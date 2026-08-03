const API_OPTIONS = {
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
};

function failureLines({ stage, problem, detail, tip }) {
  return [
    stage ? `【环节】${stage}` : null,
    problem ? `【问题】${problem}` : null,
    detail ? `【详情】${detail}` : null,
    tip ? `【建议】${tip}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 把浏览器/网络异常转成可读失败原因 */
export function formatRequestError(error, fallback = "请求失败，请稍后重试") {
  const message = String(error?.message || error || "").trim();
  const lower = message.toLowerCase();

  // 后端已格式化的文案直接展示
  if (message.includes("【环节】") || message.includes("【问题】")) {
    return message;
  }

  if (
    error?.name === "TypeError" ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed") ||
    lower.includes("fetch failed")
  ) {
    return failureLines({
      stage: "你的设备 → 本站（Cloudflare）",
      problem: "网络连接失败，页面请求没到达服务器",
      detail: "常见于国内手机流量/部分家用宽带访问 Cloudflare 不稳定（公司网往往正常）",
      tip: "换公司网络 / 稳定 Wi‑Fi，或开启可稳定访问外网的网络后重试。这不是 BibiGPT/DeepSeek 的问题。",
    });
  }

  if (
    error?.name === "AbortError" ||
    lower.includes("aborted") ||
    lower.includes("timeout") ||
    message.includes("超时")
  ) {
    return failureLines({
      stage: "你的设备 → 本站（Cloudflare）",
      problem: "请求超时",
      detail: message || "等待服务器响应过久",
      tip: "网络慢或不稳定时常见；若只在家用流量失败，优先换网络再试",
    });
  }

  if (
    lower.includes("unexpected token") ||
    lower.includes("is not valid json") ||
    lower.includes("json.parse") ||
    message.includes("无法解析")
  ) {
    return failureLines({
      stage: "你的设备 → 本站（Cloudflare）",
      problem: "服务器响应异常（返回内容不是正常 JSON）",
      detail: "可能被中途拦截、网关错误页，或连接中断",
      tip: "先确认能稳定打开本站，再重试；仍失败可换网络",
    });
  }

  if (message.includes("HTTP")) {
    return failureLines({
      stage: "你的设备 → 本站（Cloudflare）",
      problem: "本站接口返回错误",
      detail: message,
      tip: "查看详情中的 HTTP 状态；5xx 多为服务端问题，4xx 多为请求/登录问题",
    });
  }

  return message || fallback;
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(`请求失败 (HTTP ${response.status})，服务器无响应内容`);
    }
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      response.ok
        ? "服务器返回了无法解析的内容，请稍后重试"
        : `请求失败 (HTTP ${response.status})，服务器响应异常，可能是网络不稳定`
    );
  }
}

export async function apiGet(path) {
  try {
    const response = await fetch(path, {
      credentials: "include",
    });
    const payload = await readApiResponse(response);
    if (!response.ok && payload && !payload.success) {
      return payload;
    }
    if (!response.ok) {
      throw new Error(payload?.error || `请求失败 (HTTP ${response.status})`);
    }
    return payload;
  } catch (error) {
    throw new Error(formatRequestError(error));
  }
}

export async function apiPost(path, body) {
  try {
    const response = await fetch(path, {
      method: "POST",
      ...API_OPTIONS,
      body: JSON.stringify(body),
    });
    const payload = await readApiResponse(response);
    if (!response.ok && payload && !payload.success) {
      return payload;
    }
    if (!response.ok) {
      throw new Error(payload?.error || `请求失败 (HTTP ${response.status})`);
    }
    return payload;
  } catch (error) {
    throw new Error(formatRequestError(error));
  }
}

export async function apiPatch(path, body) {
  try {
    const response = await fetch(path, {
      method: "PATCH",
      ...API_OPTIONS,
      body: JSON.stringify(body),
    });
    const payload = await readApiResponse(response);
    if (!response.ok && payload && !payload.success) {
      return payload;
    }
    if (!response.ok) {
      throw new Error(payload?.error || `请求失败 (HTTP ${response.status})`);
    }
    return payload;
  } catch (error) {
    throw new Error(formatRequestError(error));
  }
}

export async function requireAuth() {
  try {
    const payload = await apiGet("/api/auth/me");
    if (!payload.success || !payload.data.loggedIn) {
      window.location.href = "/login.html";
      return null;
    }
    return payload.data;
  } catch (error) {
    const tip = formatRequestError(error);
    window.location.href = `/login.html?error=${encodeURIComponent(tip)}`;
    return null;
  }
}

export const PLATFORM_LABELS = {
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechat: "微信公众号",
};

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateCompact(value) {
  if (!value) return "-";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
