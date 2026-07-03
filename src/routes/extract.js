import { extractVideoUrl } from "../extractUrl.js";
import { fetchSubtitle } from "../bibigpt.js";
import { summarizeTranscript } from "../deepseek.js";
import playbook from "../summarize_playbook.md";
import {
  chargeMinutes,
  chargeUserQuota,
  createId,
  countProcessingJobs,
  expireStuckJobs,
  getHistoryById,
  getUserQuota,
  insertHistory,
  JOB_HEARTBEAT_INTERVAL_MS,
  MAX_DURATION_SECONDS,
  nowIso,
  touchHistoryHeartbeat,
  tryPromoteQueuedJob,
  updateHistory,
} from "../db.js";
import { jsonResponse } from "../http.js";
import { requireUser } from "../middleware.js";
import { saveShare } from "../share.js";

const QUOTA_EXHAUSTED_MESSAGE = "额度用完了，请联系小赵学姐增加额度";

function startHeartbeat(env, historyId) {
  const timer = setInterval(() => {
    touchHistoryHeartbeat(env, historyId).catch(() => {});
  }, JOB_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}

async function saveFailedHistory(env, user, extracted, fields) {
  const timestamp = nowIso();
  const historyId = createId();
  await insertHistory(env, {
    id: historyId,
    user_id: user.id,
    platform: extracted?.platform || fields.platform || null,
    video_url: extracted?.url || fields.video_url || "",
    title: fields.title || null,
    author: fields.author || null,
    duration_seconds: fields.duration_seconds || null,
    minutes_charged: 0,
    transcript: fields.transcript || null,
    summary: fields.summary || null,
    status: "failed",
    error_message: fields.error_message,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return historyId;
}

export async function runExtractJob(env, historyId, userId) {
  const record = await getHistoryById(env, historyId, userId);
  if (!record || record.status !== "processing") {
    return;
  }

  const stopHeartbeat = startHeartbeat(env, historyId);

  try {
    await updateHistory(env, historyId, { status: "processing" });

    const bibigptToken = env.BIBIGPT_API_TOKEN;
    const deepseekKey = env.DEEPSEEK_API_KEY;
    if (!bibigptToken || !deepseekKey) {
      await updateHistory(env, historyId, {
        status: "failed",
        error_message: "服务端 API 密钥未配置，请联系管理员",
      });
      return;
    }

    let subtitle;
    try {
      subtitle = await fetchSubtitle(record.video_url, bibigptToken);
    } catch (error) {
      await updateHistory(env, historyId, {
        status: "failed",
        error_message: error.message || "转写失败",
      });
      return;
    }

    const durationSeconds =
      Number(subtitle.duration) || Number(subtitle.costDuration) || 0;
    if (durationSeconds > MAX_DURATION_SECONDS) {
      await updateHistory(env, historyId, {
        platform: record.platform,
        title: subtitle.title,
        author: subtitle.author,
        duration_seconds: durationSeconds,
        status: "failed",
        error_message: "视频超过 30 分钟，暂不支持",
      });
      return;
    }

    const minutesToCharge = chargeMinutes(durationSeconds);
    const quotaMinutes = await getUserQuota(env, userId);
    if (quotaMinutes < minutesToCharge) {
      await updateHistory(env, historyId, {
        platform: record.platform,
        title: subtitle.title,
        author: subtitle.author,
        duration_seconds: durationSeconds,
        transcript: subtitle.transcript,
        status: "failed",
        error_message: QUOTA_EXHAUSTED_MESSAGE,
      });
      return;
    }

    let summary = "";
    let summaryError = null;
    try {
      const result = await summarizeTranscript({
        title: subtitle.title,
        transcript: subtitle.transcript,
        apiKey: deepseekKey,
        playbook,
      });
      summary = result.summary;
    } catch (error) {
      summaryError = error;
    }

    const isSuccess = !summaryError;

    await updateHistory(env, historyId, {
      platform: record.platform,
      title: subtitle.title,
      author: subtitle.author,
      duration_seconds: durationSeconds || null,
      minutes_charged: minutesToCharge,
      transcript: subtitle.transcript,
      summary: isSuccess ? summary : null,
      status: isSuccess ? "success" : "failed",
      error_message: summaryError?.message || null,
    });

    await chargeUserQuota(env, userId, minutesToCharge, historyId);

    if (isSuccess) {
      const data = {
        historyId,
        platform: record.platform,
        videoUrl: record.video_url,
        title: subtitle.title,
        author: subtitle.author,
        transcript: subtitle.transcript,
        summary,
      };
      await saveShare(env, data);
    }
  } catch (error) {
    await updateHistory(env, historyId, {
      status: "failed",
      error_message: error.message || "处理失败，请重试",
    });
  } finally {
    stopHeartbeat();
  }
}

function scheduleInlineJob(env, ctx, historyId, userId) {
  ctx.waitUntil(
    (async () => {
      try {
        await runExtractJob(env, historyId, userId);
      } catch (error) {
        console.error(`Job ${historyId} failed:`, error);
        try {
          await updateHistory(env, historyId, {
            status: "failed",
            error_message: error.message || "处理失败，请重试",
          });
        } catch (updateError) {
          console.error(`Failed to mark job ${historyId} failed:`, updateError);
        }
      }

      try {
        const nextId = await tryPromoteQueuedJob(env, userId);
        if (nextId) {
          scheduleInlineJob(env, ctx, nextId, userId);
        }
      } catch (error) {
        console.error(`Failed to promote next job for user ${userId}:`, error);
      }
    })()
  );
}

export async function handleExtractSubmit(request, env, ctx) {
  const auth = await requireUser(request, env);
  if (auth.error) {
    return auth.error;
  }
  const user = auth.user;

  await expireStuckJobs(env, user.id);
  try {
    const resumedId = await tryPromoteQueuedJob(env, user.id);
    if (resumedId) {
      scheduleInlineJob(env, ctx, resumedId, user.id);
    }
  } catch (error) {
    console.error("Failed to resume queued job:", error);
  }

  if (user.quota_minutes <= 0) {
    return jsonResponse({ success: false, error: QUOTA_EXHAUSTED_MESSAGE }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "请求体必须是 JSON" }, 400);
  }

  const input = payload.input?.trim();
  if (!input) {
    return jsonResponse({ success: false, error: "请粘贴分享内容或视频链接" }, 400);
  }

  const extracted = extractVideoUrl(input);
  if (!extracted) {
    await saveFailedHistory(env, user, null, {
      video_url: input.slice(0, 500),
      error_message: "未识别到支持的视频链接，请确认包含抖音、B站或小红书链接",
    });
    return jsonResponse(
      {
        success: false,
        error: "未识别到支持的视频链接，请确认包含抖音、B站或小红书链接",
      },
      400
    );
  }

  const bibigptToken = env.BIBIGPT_API_TOKEN;
  const deepseekKey = env.DEEPSEEK_API_KEY;
  if (!bibigptToken || !deepseekKey) {
    return jsonResponse(
      { success: false, error: "服务端 API 密钥未配置，请联系管理员" },
      500
    );
  }

  const processingCount = await countProcessingJobs(env, user.id);
  const status = processingCount < 3 ? "processing" : "queued";
  const historyId = createId();
  const timestamp = nowIso();

  await insertHistory(env, {
    id: historyId,
    user_id: user.id,
    platform: extracted.platform,
    video_url: extracted.url,
    title: null,
    author: null,
    duration_seconds: null,
    minutes_charged: 0,
    transcript: null,
    summary: null,
    status,
    error_message: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const message =
    status === "queued"
      ? "已加入队列，前方任务完成后将自动开始"
      : "已提交，正在处理中";

  if (status === "processing") {
    scheduleInlineJob(env, ctx, historyId, user.id);
  }

  return jsonResponse({
    success: true,
    data: {
      historyId,
      status,
      message,
      platform: extracted.platform,
      videoUrl: extracted.url,
    },
  });
}

export const handleExtract = handleExtractSubmit;
