const API_OPTIONS = {
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
};

export async function apiGet(path) {
  const response = await fetch(path, {
    credentials: "include",
  });
  return response.json();
}

export async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    ...API_OPTIONS,
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function apiPatch(path, body) {
  const response = await fetch(path, {
    method: "PATCH",
    ...API_OPTIONS,
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function requireAuth() {
  const payload = await apiGet("/api/auth/me");
  if (!payload.success || !payload.data.loggedIn) {
    window.location.href = "/login.html";
    return null;
  }
  return payload.data;
}

export const PLATFORM_LABELS = {
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
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
