import { apiGet, apiPost, formatRequestError } from "./api.js";

const form = document.getElementById("login-form");
const status = document.getElementById("status");

function setStatus(message, type = "error") {
  status.hidden = false;
  status.textContent = message;
  status.className = `status status--${type}`;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const presetError = params.get("error");
  if (presetError) {
    setStatus(presetError, "error");
  }

  try {
    const me = await apiGet("/api/auth/me");
    if (me.success && me.data.loggedIn) {
      window.location.href = "/";
      return;
    }
  } catch (error) {
    setStatus(formatRequestError(error, "无法连接服务器，请检查网络后重试"), "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.hidden = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const payload = await apiPost("/api/auth/login", { email, password });
    if (!payload.success) {
      setStatus(payload.error || "登录失败");
      return;
    }
    window.location.href = "/";
  } catch (error) {
    setStatus(formatRequestError(error, "登录失败，请稍后重试"));
  }
});

init();
