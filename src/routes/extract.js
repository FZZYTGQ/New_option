import { extractVideoUrl } from "../extractUrl.js";
import { fetchSubtitle } from "../bibigpt.js";
import { summarizeTranscript } from "../deepseek.js";
import playbook from "../summarize_playbook.md";
import {
  chargeMinutes,
  chargeUserQuota,
  createId,
  insertHistory,
  MAX_DURATION_SECONDS,
  nowIso,
} from "../db.js";
import { jsonResponse } from "../http.js";
import { requireUser } from "../middleware.js";
import { saveShare } from "../share.js";

const QUOTA_EXHAUSTED_MESSAGE = "额度用完了，请联系小赵学姐增加额度";

async function saveFailedHistory(env, user, extracted, fields) {
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
    created_at: nowIso(),
  });
  return historyId;
}

export async function handleExtract(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) {
    return auth.error;
  }
  const user = auth.user;

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

  let subtitle;
  try {
    subtitle = await fetchSubtitle(extracted.url, bibigptToken);
  } catch (error) {
    await saveFailedHistory(env, user, extracted, {
      error_message: error.message || "转写失败",
    });
    return jsonResponse(
      { success: false, error: error.message || "转写失败，请稍后重试" },
      500
    );
  }

  const durationSeconds =
    Number(subtitle.duration) || Number(subtitle.costDuration) || 0;
  if (durationSeconds > MAX_DURATION_SECONDS) {
    await saveFailedHistory(env, user, extracted, {
      platform: extracted.platform,
      title: subtitle.title,
      author: subtitle.author,
      duration_seconds: durationSeconds,
      error_message: "视频超过 30 分钟，暂不支持",
    });
    return jsonResponse({ success: false, error: "视频超过 30 分钟，暂不支持" }, 400);
  }

  const minutesToCharge = chargeMinutes(durationSeconds);
  if (user.quota_minutes < minutesToCharge) {
    return jsonResponse({ success: false, error: QUOTA_EXHAUSTED_MESSAGE }, 403);
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

  const historyId = createId();
  const createdAt = nowIso();
  const isSuccess = !summaryError;

  await insertHistory(env, {
    id: historyId,
    user_id: user.id,
    platform: extracted.platform,
    video_url: extracted.url,
    title: subtitle.title,
    author: subtitle.author,
    duration_seconds: durationSeconds || null,
    minutes_charged: minutesToCharge,
    transcript: subtitle.transcript,
    summary: isSuccess ? summary : null,
    status: isSuccess ? "success" : "failed",
    error_message: summaryError?.message || null,
    created_at: createdAt,
  });

  await chargeUserQuota(env, user.id, minutesToCharge, historyId);

  if (summaryError) {
    return jsonResponse(
      {
        success: false,
        error: summaryError.message || "总结失败，但转写内容已保存",
        data: {
          historyId,
          platform: extracted.platform,
          videoUrl: extracted.url,
          title: subtitle.title,
          author: subtitle.author,
          transcript: subtitle.transcript,
        },
      },
      500
    );
  }

  const data = {
    historyId,
    platform: extracted.platform,
    videoUrl: extracted.url,
    title: subtitle.title,
    author: subtitle.author,
    transcript: subtitle.transcript,
    summary,
    sourceUrl: subtitle.sourceUrl,
    duration: durationSeconds || null,
    costDuration: subtitle.costDuration,
    remainingTime: subtitle.remainingTime,
  };

  const shareId = await saveShare(env, data);
  const shareUrl = shareId
    ? new URL(`/s/${shareId}`, request.url).toString()
    : null;

  return jsonResponse({
    success: true,
    data: {
      ...data,
      shareId,
      shareUrl,
    },
  });
}
