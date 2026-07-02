import {
  PLATFORM_LABELS,
  apiGet,
  apiPatch,
  apiPost,
  formatDate,
  requireAuth,
} from "./api.js";
import { showToast } from "./toast.js";

const status = document.getElementById("status");
const tabs = document.querySelectorAll(".admin-tabs .tab");
const panels = {
  overview: document.getElementById("panel-overview"),
  users: document.getElementById("panel-users"),
  records: document.getElementById("panel-records"),
  create: document.getElementById("panel-create"),
};

function setStatus(message, type = "error") {
  status.hidden = false;
  status.textContent = message;
  status.className = `status status--${type}`;
}

function clearStatus() {
  status.hidden = true;
}

function switchTab(name) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("tab--active", active);
  });
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
    panel.classList.toggle("admin-panel--active", key === name);
  });
}

function renderStats(data) {
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__label">总用户数</div><div class="stat-card__value">${data.totalUsers}</div></div>
    <div class="stat-card"><div class="stat-card__label">今日提取</div><div class="stat-card__value">${data.todayExtracts}</div></div>
    <div class="stat-card"><div class="stat-card__label">今日消耗（分钟）</div><div class="stat-card__value">${data.todayMinutes}</div></div>
    <div class="stat-card"><div class="stat-card__label">累计消耗（分钟）</div><div class="stat-card__value">${data.totalUsedMinutes}</div></div>
  `;

  const recent = data.recent || [];
  document.getElementById("recent-records").innerHTML = recent.length
    ? `<table class="data-table">
        <thead><tr><th>时间</th><th>用户</th><th>平台</th><th>标题</th><th>扣费</th><th>状态</th></tr></thead>
        <tbody>${recent
          .map(
            (item) => `<tr>
              <td>${formatDate(item.created_at)}</td>
              <td>${item.email}</td>
              <td>${PLATFORM_LABELS[item.platform] || item.platform || "-"}</td>
              <td>${item.title || "-"}</td>
              <td>${item.minutes_charged || 0}</td>
              <td>${item.status === "success" ? "成功" : "失败"}</td>
            </tr>`
          )
          .join("")}</tbody></table>`
    : `<p class="hint">暂无记录</p>`;
}

function renderUsers(users) {
  document.getElementById("users-table").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>邮箱</th>
          <th>注册时间</th>
          <th>剩余额度</th>
          <th>已用</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${users
          .map(
            (user) => `<tr>
              <td>${user.email}</td>
              <td>${formatDate(user.created_at)}</td>
              <td>${user.quota_minutes} 分</td>
              <td>${user.used_minutes} 分</td>
              <td>${user.status === "active" ? "正常" : "禁用"}</td>
              <td class="table-actions">
                <button class="btn btn--secondary btn--small" data-action="add30" data-id="${user.id}">+30</button>
                <button class="btn btn--secondary btn--small" data-action="add60" data-id="${user.id}">+60</button>
                <button class="btn btn--secondary btn--small" data-action="toggle" data-id="${user.id}" data-status="${user.status}">${user.status === "active" ? "禁用" : "启用"}</button>
                <button class="btn btn--secondary btn--small" data-action="records" data-email="${user.email}">记录</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("#users-table [data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { action, id, status: userStatus, email } = button.dataset;
      if (action === "add30" || action === "add60") {
        const addQuota = action === "add30" ? 30 : 60;
        const payload = await apiPatch(`/api/admin/users/${id}`, { addQuota });
        if (!payload.success) {
          setStatus(payload.error || "操作失败");
          return;
        }
        showToast(`已增加 ${addQuota} 分钟`);
        await loadUsers();
        return;
      }
      if (action === "toggle") {
        const nextStatus = userStatus === "active" ? "disabled" : "active";
        const payload = await apiPatch(`/api/admin/users/${id}`, { status: nextStatus });
        if (!payload.success) {
          setStatus(payload.error || "操作失败");
          return;
        }
        await loadUsers();
        return;
      }
      if (action === "records") {
        switchTab("records");
        document.getElementById("filter-email").value = email;
        await loadRecords(email);
      }
    });
  });
}

function renderRecords(records) {
  document.getElementById("records-table").innerHTML = records.length
    ? `<table class="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>平台</th>
            <th>标题</th>
            <th>时长</th>
            <th>扣费</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (item) => `<tr>
                <td>${formatDate(item.created_at)}</td>
                <td>${item.email}</td>
                <td>${PLATFORM_LABELS[item.platform] || item.platform || "-"}</td>
                <td>${item.title || "-"}</td>
                <td>${item.duration_seconds ? Math.ceil(item.duration_seconds / 60) + " 分" : "-"}</td>
                <td>${item.minutes_charged || 0}</td>
                <td>${item.status === "success" ? "成功" : "失败"}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`
    : `<p class="hint">暂无记录</p>`;
}

async function loadOverview() {
  const payload = await apiGet("/api/admin/stats");
  if (!payload.success) {
    setStatus(payload.error || "加载概览失败");
    return;
  }
  clearStatus();
  renderStats(payload.data);
}

async function loadUsers() {
  const payload = await apiGet("/api/admin/users");
  if (!payload.success) {
    setStatus(payload.error || "加载用户失败");
    return;
  }
  clearStatus();
  renderUsers(payload.data || []);
}

async function loadRecords(email = "") {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  const payload = await apiGet(`/api/admin/history${query}`);
  if (!payload.success) {
    setStatus(payload.error || "加载记录失败");
    return;
  }
  clearStatus();
  renderRecords(payload.data || []);
}

async function init() {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== "admin") {
    window.location.href = "/";
    return;
  }

  await loadOverview();
  await loadUsers();
  await loadRecords();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    switchTab(tab.dataset.tab);
    if (tab.dataset.tab === "overview") await loadOverview();
    if (tab.dataset.tab === "users") await loadUsers();
    if (tab.dataset.tab === "records") await loadRecords(document.getElementById("filter-email").value.trim());
  });
});

document.getElementById("filter-btn").addEventListener("click", async () => {
  await loadRecords(document.getElementById("filter-email").value.trim());
});

document.getElementById("create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("create-email").value.trim();
  const password = document.getElementById("create-password").value;
  const quotaMinutes = Number(document.getElementById("create-quota").value) || 30;

  const payload = await apiPost("/api/admin/users", {
    email,
    password,
    quotaMinutes,
  });

  if (!payload.success) {
    setStatus(payload.error || "创建失败");
    return;
  }

  showToast("账号创建成功");
  document.getElementById("create-user-form").reset();
  document.getElementById("create-quota").value = "30";
  await loadUsers();
  switchTab("users");
});

init();
