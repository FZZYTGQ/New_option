import { BIBIGPT_TIMEOUT_MS, fetchWithTimeout } from "./fetchWithTimeout.js";

export async function fetchSubtitle(videoUrl, apiToken) {
  const apiUrl = new URL("https://api.bibigpt.co/api/v1/getSubtitle");
  apiUrl.searchParams.set("url", videoUrl);
  apiUrl.searchParams.set("audioLanguage", "zh");

  const response = await fetchWithTimeout(
    apiUrl.toString(),
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
    BIBIGPT_TIMEOUT_MS
  );

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`BibiGPT 返回了无法解析的响应: ${raw.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `BibiGPT 请求失败 (${response.status})`
    );
  }

  if (!data.success) {
    throw new Error(data.message || "BibiGPT 处理失败");
  }

  const detail = data.detail || {};
  const subtitles = detail.subtitlesArray || [];
  const transcript = subtitles
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n");

  if (!transcript) {
    throw new Error("未能获取口播逐字稿，视频可能没有可用字幕或转写失败");
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
