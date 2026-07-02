import { apiGet, apiPost } from "./api.js";

const form = document.getElementById("login-form");
const status = document.getElementById("status");

function setStatus(message, type = "error") {
  status.hidden = false;
  status.textContent = message;
  status.className = `status status--${type}`;
}

async function init() {
  const me = await apiGet("/api/auth/me");
  if (me.success && me.data.loggedIn) {
    window.location.href = "/";
    return;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.hidden = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const payload = await apiPost("/api/auth/login", { email, password });
  if (!payload.success) {
    setStatus(payload.error || "登录失败");
    return;
  }

  window.location.href = "/";
});

init();
