import { DEEPSEEK_TIMEOUT_MS, fetchWithTimeout } from "./fetchWithTimeout.js";

function tryParseSummaryError(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes('"code"')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.code === 100000) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export async function summarizeTranscript({ title, transcript, apiKey, playbook }) {
  const response = await fetchWithTimeout(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: playbook },
          {
            role: "user",
            content: `请根据以下视频口播逐字稿进行总结。\n\n视频标题：${title || "（未知）"}\n\n口播逐字稿：\n${transcript}`,
          },
        ],
        temperature: 0.3,
      }),
    },
    DEEPSEEK_TIMEOUT_MS
  );

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`DeepSeek 返回了无法解析的响应: ${raw.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `DeepSeek 请求失败 (${response.status})`
    );
  }

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const summaryError = tryParseSummaryError(content);
  if (summaryError) {
    const error = new Error(summaryError.des || summaryError.msg || "内容过短或无法总结");
    error.code = summaryError.code;
    throw error;
  }

  if (!content) {
    throw new Error("DeepSeek 未返回总结内容");
  }

  return { summary: content };
}
