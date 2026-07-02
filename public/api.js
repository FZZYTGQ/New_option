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
