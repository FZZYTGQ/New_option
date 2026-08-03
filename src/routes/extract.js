import { extractVideoUrl, isArticlePlatform, SUPPORTED_PLATFORM_LABEL } from "../extractUrl.js";
import { fetchSubtitle } from "../bibigpt.js";
import { cleanWechatTranscript } from "../cleanTranscript.js";
import { generateTitleFromTranscript, summarizeTranscript } from "../deepseek.js";
import { pickDisplayTitle } from "../title.js";
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
  updateHistory,
} from "../db.js";
import { failureMessage } from "../errorMessage.js";
import { jsonResponse } from "../http.js";
import { promoteAndSchedule, scheduleJobRun } from "../jobScheduler.js";
import { requireUser } from "../middleware.js";
import { saveShare } from "../share.js";

const QUOTA_EXHAUSTED_MESSAGE = failureMessage({
  stage: "账号额度",
  problem: "可用分钟数不足",
  detail: "当前剩余额度不够完成本次提取",
  tip: "请联系小赵学姐增加额度",
});

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
      const missing = [
        !bibigptToken ? "BIBIGPT_API_TOKEN" : null,
        !deepseekKey ? "DEEPSEEK_API_KEY" : null,
      ]
        .filter(Boolean)
        .join("、");
      await updateHistory(env, historyId, {
        status: "failed",
        error_message: failureMessage({
          stage: "服务端配置",
          problem: "API 密钥未配置",
          detail: `缺少：${missing}`,
          tip: "请在服务端环境变量中配置对应密钥后重试",
        }),
      });
      return;
    }

    // 提取前先查额度：没额度就不调用 BibiGPT
    const quotaMinutes = await getUserQuota(env, userId);
    if (quotaMinutes <= 0) {
      await updateHistory(env, historyId, {
        status: "failed",
        error_message: QUOTA_EXHAUSTED_MESSAGE,
      });
      return;
    }

    const isArticle = isArticlePlatform(record.platform);

    // 按剩余额度限制最大可转写时长，超长由 BibiGPT 直接拒绝
    const maxDurationSeconds = Math.min(quotaMinutes * 60, MAX_DURATION_SECONDS);

    let subtitle;
    try {
      subtitle = await fetchSubtitle(record.video_url, bibigptToken, {
        maxDurationSeconds,
      });
    } catch (error) {
      await updateHistory(env, historyId, {
        status: "failed",
        error_message: error.message || failureMessage({
          stage: "本站服务器 → BibiGPT（转写）",
          problem: isArticle ? "公众号正文提取失败" : "转写失败",
          tip: "请稍后重试",
        }),
      });
      return;
    }

    if (isArticle) {
      subtitle = {
        ...subtitle,
        transcript: cleanWechatTranscript(subtitle.transcript),
      };
      if (!subtitle.transcript) {
        await updateHistory(env, historyId, {
          status: "failed",
          error_message: failureMessage({
            stage: "公众号正文清洗",
            problem: "清洗后正文为空",
            detail: "提取结果可能全是页面提示文案",
            tip: "请确认链接可公开访问，或换一篇文章再试",
          }),
        });
        return;
      }
    }

    const durationSeconds =
      Number(subtitle.duration) || Number(subtitle.costDuration) || 0;

    // a/b：有标题去话题；无标题留话题。c：都没有时后面用 AI 补标题
    let displayTitle = pickDisplayTitle(subtitle.title);

    if (durationSeconds > MAX_DURATION_SECONDS) {
      await updateHistory(env, historyId, {
        platform: record.platform,
        title: displayTitle || null,
        author: subtitle.author,
        duration_seconds: durationSeconds,
        status: "failed",
        error_message: failureMessage({
          stage: isArticle ? "内容长度校验" : "视频时长校验",
          problem: isArticle ? "内容过长，超过额度上限" : "视频超过 30 分钟",
          detail: `当前约 ${Math.ceil(durationSeconds / 60)} 分钟，上限 30 分钟`,
          tip: isArticle
            ? "请换更短的文章，本次未扣费"
            : "请换更短的视频，本次未扣费",
        }),
      });
      return;
    }

    const minutesToCharge = chargeMinutes(durationSeconds);
    // 兜底：若上游未按 maxDuration 拦截，仍拒绝落库与扣费
    if (quotaMinutes < minutesToCharge) {
      await updateHistory(env, historyId, {
        platform: record.platform,
        title: displayTitle || null,
        author: subtitle.author,
        duration_seconds: durationSeconds,
        transcript: null,
        summary: null,
        status: "failed",
        error_message: failureMessage({
          stage: "账号额度",
          problem: "剩余额度不足",
          detail: `本次需 ${minutesToCharge} 分钟，当前剩余 ${quotaMinutes} 分钟`,
          tip: "请联系小赵学姐增加额度",
        }),
      });
      return;
    }

    if (!displayTitle) {
      try {
        const generated = await generateTitleFromTranscript({
          transcript: subtitle.transcript,
          apiKey: deepseekKey,
        });
        displayTitle = pickDisplayTitle(generated.title) || generated.title || "";
      } catch {
        displayTitle = "";
      }
    }

    let summary = "";
    let summaryError = null;
    try {
      const result = await summarizeTranscript({
        title: displayTitle || subtitle.title,
        transcript: subtitle.transcript,
        apiKey: deepseekKey,
        playbook,
        contentType: isArticle ? "article" : "video",
      });
      summary = result.summary;
    } catch (error) {
      summaryError = error;
    }

    const isSuccess = !summaryError;

    await updateHistory(env, historyId, {
      platform: record.platform,
      title: displayTitle || null,
      author: subtitle.author,
      duration_seconds: durationSeconds || null,
      minutes_charged: minutesToCharge,
      transcript: subtitle.transcript,
      summary: isSuccess ? summary : null,
      status: isSuccess ? "success" : "failed",
      error_message: summaryError
        ? summaryError.message ||
          failureMessage({
            stage: "本站服务器 → DeepSeek（总结）",
            problem: "总结失败",
            tip: isArticle
              ? "正文已提取并已扣费，可稍后重试或联系管理员"
              : "转写已完成并已扣费，可稍后重试或联系管理员",
          })
        : null,
    });

    await chargeUserQuota(env, userId, minutesToCharge, historyId);

    if (isSuccess) {
      const data = {
        historyId,
        platform: record.platform,
        videoUrl: record.video_url,
        title: displayTitle || subtitle.title,
        author: subtitle.author,
        transcript: subtitle.transcript,
        summary,
      };
      await saveShare(env, data);
    }
  } catch (error) {
    await updateHistory(env, historyId, {
      status: "failed",
      error_message:
        error.message ||
        failureMessage({
          stage: "后台任务",
          problem: "处理失败",
          tip: "请稍后重试",
        }),
    });
  } finally {
    stopHeartbeat();
  }
}

async function tryDispatchJob(request, env, historyId) {
  try {
    const jobResponse = await scheduleJobRun(request, env, historyId);
    if (jobResponse.ok) {
      return { ok: true };
    }

    let detail = `HTTP ${jobResponse.status}`;
    try {
      const body = await jobResponse.json();
      detail = body.error || detail;
    } catch {
      // ignore parse errors
    }

    const errorMessage = failureMessage({
      stage: "任务调度（启动后台转写/总结）",
      problem: "后台任务启动失败",
      detail,
      tip: "请稍后重试；若持续失败，检查 Worker 服务绑定与 ADMIN_PASSWORD 配置",
    });
    console.error(`Job dispatch failed for ${historyId}: ${errorMessage}`);
    return { ok: false, error: errorMessage };
  } catch (error) {
    console.error(`Job dispatch error for ${historyId}:`, error);
    return {
      ok: false,
      error: failureMessage({
        stage: "任务调度（启动后台转写/总结）",
        problem: "后台任务启动异常",
        detail: error.message || "未知错误",
        tip: "请稍后重试",
      }),
    };
  }
}

async function dispatchOrFail(request, env, historyId) {
  const dispatched = await tryDispatchJob(request, env, historyId);
  if (dispatched.ok) {
    return dispatched;
  }

  await updateHistory(env, historyId, {
    status: "failed",
    error_message: dispatched.error || "任务启动失败，请重试",
  });
  return dispatched;
}

export async function handleExtractSubmit(request, env, ctx) {
  const auth = await requireUser(request, env);
  if (auth.error) {
    return auth.error;
  }
  const user = auth.user;

  await expireStuckJobs(env, user.id);
  try {
    await promoteAndSchedule(request, env, user.id);
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
    return jsonResponse({ success: false, error: "请粘贴分享内容、视频链接或公众号文章链接" }, 400);
  }

  const extracted = extractVideoUrl(input);
  if (!extracted) {
    const linkError = failureMessage({
      stage: "链接识别",
      problem: "未识别到支持的链接",
      detail: `当前只支持${SUPPORTED_PLATFORM_LABEL}分享文案或链接`,
      tip: "请粘贴完整分享内容（含 http 链接）后再试",
    });
    await saveFailedHistory(env, user, null, {
      video_url: input.slice(0, 500),
      error_message: linkError,
    });
    return jsonResponse({ success: false, error: linkError }, 400);
  }

  const bibigptToken = env.BIBIGPT_API_TOKEN;
  const deepseekKey = env.DEEPSEEK_API_KEY;
  if (!bibigptToken || !deepseekKey) {
    const missing = [
      !bibigptToken ? "BIBIGPT_API_TOKEN" : null,
      !deepseekKey ? "DEEPSEEK_API_KEY" : null,
    ]
      .filter(Boolean)
      .join("、");
    return jsonResponse(
      {
        success: false,
        error: failureMessage({
          stage: "服务端配置",
          problem: "API 密钥未配置",
          detail: `缺少：${missing}`,
          tip: "请在服务端环境变量中配置后重试",
        }),
      },
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
      : "后台处理中，可稍后回来查看";

  if (status === "processing") {
    // Dispatch on a separate Worker invocation so the long job is not tied to
    // the phone browser request (which mobile OS may cancel when switching apps).
    const dispatchPromise = dispatchOrFail(request, env, historyId);
    ctx.waitUntil(dispatchPromise);
    const dispatched = await dispatchPromise;
    if (!dispatched.ok) {
      return jsonResponse(
        {
          success: false,
          error: dispatched.error || "任务启动失败，请重试",
        },
        500
      );
    }
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
