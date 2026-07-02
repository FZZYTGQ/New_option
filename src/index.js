import { extractVideoUrl } from "./extractUrl.js";
import { fetchSubtitle } from "./bibigpt.js";
import { summarizeTranscript } from "./deepseek.js";
import playbook from "./summarize_playbook.md";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function handleExtract(request, env) {
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

  try {
    const subtitle = await fetchSubtitle(extracted.url, bibigptToken);
    const { summary } = await summarizeTranscript({
      title: subtitle.title,
      transcript: subtitle.transcript,
      apiKey: deepseekKey,
      playbook,
    });

    return jsonResponse({
      success: true,
      data: {
        platform: extracted.platform,
        videoUrl: extracted.url,
        title: subtitle.title,
        author: subtitle.author,
        transcript: subtitle.transcript,
        summary,
        sourceUrl: subtitle.sourceUrl,
        duration: subtitle.duration,
        costDuration: subtitle.costDuration,
        remainingTime: subtitle.remainingTime,
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error.message || "处理失败，请稍后重试",
        code: error.code,
      },
      500
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/extract") {
      if (request.method !== "POST") {
        return jsonResponse({ success: false, error: "仅支持 POST 请求" }, 405);
      }
      return handleExtract(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
