import { failureMessage } from "./errorMessage.js";
import { DEEPSEEK_TIMEOUT_MS, fetchWithTimeout } from "./fetchWithTimeout.js";

const STAGE = "本站服务器 → DeepSeek（总结）";

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

export async function generateTitleFromTranscript({ transcript, apiKey }) {
  const snippet = String(transcript || "").trim().slice(0, 1200);
  if (!snippet) {
    return { title: "" };
  }

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
          {
            role: "system",
            content:
              "你是短视频标题助手。根据口播逐字稿生成一个简洁中文标题。要求：只输出标题本身；不超过 24 个字；不要加引号、编号、话题标签或解释。",
          },
          {
            role: "user",
            content: `请为以下口播内容生成标题：\n\n${snippet}`,
          },
        ],
        temperature: 0.3,
      }),
    },
    DEEPSEEK_TIMEOUT_MS,
    "DeepSeek（生成标题）"
  );

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { title: "" };
  }

  if (!response.ok) {
    return { title: "" };
  }

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const title = content
    .replace(/^["'“”]|["'“”]$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[#＃][^\s#＃]+/gu, "")
    .trim()
    .slice(0, 40);

  return { title };
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
    DEEPSEEK_TIMEOUT_MS,
    "DeepSeek（总结）"
  );

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: "DeepSeek 返回内容无法解析",
        detail: raw.slice(0, 200) || "空响应",
        tip: "多为服务端异常，请稍后重试",
      })
    );
  }

  if (!response.ok) {
    const apiMsg = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: `DeepSeek 接口报错（HTTP ${response.status}）`,
        detail: String(apiMsg),
        tip:
          response.status === 401 || response.status === 403
            ? "请检查 Cloudflare Secrets 里的 DEEPSEEK_API_KEY 是否有效"
            : "请稍后重试；若持续失败，检查 DeepSeek 账户余额/限流",
      })
    );
  }

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const summaryError = tryParseSummaryError(content);
  if (summaryError) {
    const error = new Error(
      failureMessage({
        stage: STAGE,
        problem: "内容无法生成有效总结",
        detail: summaryError.des || summaryError.msg || `业务码 ${summaryError.code}`,
        tip: "口播稿可能过短或无效，可换一条内容更完整的视频",
      })
    );
    error.code = summaryError.code;
    throw error;
  }

  if (!content) {
    throw new Error(
      failureMessage({
        stage: STAGE,
        problem: "DeepSeek 未返回总结正文",
        detail: "接口成功，但 choices 内容为空",
        tip: "请稍后重试",
      })
    );
  }

  return { summary: content };
}
