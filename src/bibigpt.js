import { failureMessage } from "./errorMessage.js";
import { BIBIGPT_TIMEOUT_MS, fetchWithTimeout } from "./fetchWithTimeout.js";

const STAGE = "本站服务器 → BibiGPT（转写）";

function buildQuotaExceededError(maxDurationSeconds) {
  const minutes = Math.max(1, Math.floor(Number(maxDurationSeconds || 0) / 60));
  return new Error(
    failureMessage({
      stage: "账号额度",
      problem: "剩余额度不足",
      detail: `视频时长超过当前剩余可用 ${minutes} 分钟，已取消转写`,
      tip: "请联系小赵学姐增加额度，或换更短的视频",
    })
  );
}

export async function fetchSubtitle(videoUrl, apiToken, { maxDurationSeconds } = {}) {
  const apiUrl = new URL("https://api.bibigpt.co/api/v1/getSubtitle");
  apiUrl.searchParams.set("url", videoUrl);
  apiUrl.searchParams.set("audioLanguage", "zh");
  if (maxDurationSeconds && maxDurationSeconds > 0) {
    // 让 BibiGPT 在超长时直接 422，避免用完剩余额度还去转写
    apiUrl.searchParams.set("maxDuration", String(maxDurationSeconds));
  }

  const response = await fetchWithTimeout(
    apiUrl.toString(),
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
    BIBIGPT_TIMEOUT_MS,
    "BibiGPT（转写）"
  );

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: "BibiGPT 返回内容无法解析",
        detail: raw.slice(0, 200) || "空响应",
        tip: "多为服务端异常或网关返回了非 JSON，请稍后重试",
      })
    );
  }

  if (response.status === 422) {
    throw buildQuotaExceededError(maxDurationSeconds);
  }

  if (!response.ok) {
    const apiMsg = data?.message || data?.error || `HTTP ${response.status}`;
    const lower = String(apiMsg).toLowerCase();
    if (
      lower.includes("maxduration") ||
      lower.includes("max duration") ||
      (lower.includes("duration") && lower.includes("exceed"))
    ) {
      throw buildQuotaExceededError(maxDurationSeconds);
    }
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: `BibiGPT 接口报错（HTTP ${response.status}）`,
        detail: String(apiMsg),
        tip:
          response.status === 401 || response.status === 403
            ? "请检查 Cloudflare Secrets 里的 BIBIGPT_API_TOKEN 是否有效"
            : "请稍后重试；若持续失败，检查 BibiGPT 账户额度/状态",
      })
    );
  }

  if (!data.success) {
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: "BibiGPT 处理失败",
        detail: data.message || "success=false，未返回成功结果",
        tip: "请确认视频链接可公开访问，或稍后重试",
      })
    );
  }

  const detail = data.detail || {};
  const subtitles = detail.subtitlesArray || [];
  const transcript = subtitles
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n");

  if (!transcript) {
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: "未拿到口播逐字稿",
        detail: "BibiGPT 成功返回，但字幕/转写文本为空",
        tip: "视频可能无可用字幕、为纯音乐/画面，或该平台暂不支持，可换一条口播视频试",
      })
    );
  }

  return {
    title: detail.title || "",
    transcript,
    author: detail.author || "",
    platform: detail.type || data.service || "",
    sourceUrl: data.sourceUrl || videoUrl,
    duration: detail.duration || null,
    costDuration: data.costDuration,
    remainingTime: data.remainingTime,
  };
}
