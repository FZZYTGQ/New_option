import {
  PLATFORM_LABELS,
  apiGet,
  apiPatch,
  apiPost,
  escapeHtml,
  formatDate,
  formatDateCompact,
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
const resetPasswordDialog = document.getElementById("reset-password-dialog");
const resetPasswordForm = document.getElementById("reset-password-form");
const resetPasswordEmail = document.getElementById("reset-password-email");
const resetPasswordInput = document.getElementById("reset-password-input");

let resetPasswordUserId = null;

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

function renderStatusBadge(itemStatus) {
  const success = itemStatus === "success";
  return `<span class="status-badge ${success ? "status-badge--success" : "status-badge--failed"}">${success ? "成功" : "失败"}</span>`;
}

function renderRecentTable(recent) {
  return recent.length
    ? `<table class="data-table data-table--admin data-table--recent">
        <thead>
          <tr>
            <th class="col-time">时间</th>
            <th class="col-user">用户</th>
            <th class="col-platform">平台</th>
            <th class="col-title">标题</th>
            <th class="col-charge">扣费</th>
            <th class="col-status">状态</th>
          </tr>
        </thead>
        <tbody>${recent
          .map(
            (item) => `<tr>
              <td class="col-time">${formatDateCompact(item.created_at)}</td>
              <td class="col-user">${escapeHtml(item.email)}</td>
              <td class="col-platform">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || "-")}</td>
              <td class="col-title">${escapeHtml(item.title || "-")}</td>
              <td class="col-charge">${item.minutes_charged || 0} 分</td>
              <td class="col-status">${renderStatusBadge(item.status)}</td>
            </tr>`
          )
          .join("")}</tbody></table>`
    : `<p class="hint">暂无记录</p>`;
}

function renderStats(data) {
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__label">总用户数</div><div class="stat-card__value">${data.totalUsers}</div></div>
    <div class="stat-card"><div class="stat-card__label">今日提取</div><div class="stat-card__value">${data.todayExtracts}</div></div>
    <div class="stat-card"><div class="stat-card__label">今日消耗（分钟）</div><div class="stat-card__value">${data.todayMinutes}</div></div>
    <div class="stat-card"><div class="stat-card__label">累计消耗（分钟）</div><div class="stat-card__value">${data.totalUsedMinutes}</div></div>
  `;

  document.getElementById("recent-records").innerHTML = renderRecentTable(data.recent || []);
}

function renderUsers(users) {
  document.getElementById("users-table").innerHTML = `
    <table class="data-table data-table--admin">
      <thead>
        <tr>
          <th>邮箱</th>
          <th class="col-time">注册时间</th>
          <th class="col-charge">剩余额度</th>
          <th class="col-charge">已用</th>
          <th class="col-status">状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${users
          .map(
            (user) => `<tr>
              <td>${escapeHtml(user.email)}</td>
              <td class="col-time">${formatDateCompact(user.created_at)}</td>
              <td class="col-charge">${user.quota_minutes} 分</td>
              <td class="col-charge">${user.used_minutes} 分</td>
              <td class="col-status">${user.status === "active" ? "正常" : "禁用"}</td>
              <td class="table-actions">
                <div class="quota-control">
                  <input class="input input--compact" type="number" min="1" placeholder="分钟" data-quota-for="${user.id}">
                  <button class="btn btn--secondary btn--small" data-action="addQuota" data-id="${user.id}">增加</button>
                </div>
                <button class="btn btn--secondary btn--small" data-action="resetPassword" data-id="${user.id}" data-email="${escapeHtml(user.email)}">重置密码</button>
                <button class="btn btn--secondary btn--small" data-action="toggle" data-id="${user.id}" data-status="${user.status}">${user.status === "active" ? "禁用" : "启用"}</button>
                <button class="btn btn--secondary btn--small" data-action="records" data-email="${escapeHtml(user.email)}">记录</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  bindUserActions();
}

function bindUserActions() {
  document.querySelectorAll("#users-table [data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { action, id, status: userStatus, email } = button.dataset;

      if (action === "addQuota") {
        const input = document.querySelector(`[data-quota-for="${id}"]`);
        const addQuota = Number(input?.value);
        if (!addQuota || addQuota <= 0) {
          setStatus("请输入要增加的分钟数");
          input?.focus();
          return;
        }

        const payload = await apiPatch(`/api/admin/users/${id}`, { addQuota });
        if (!payload.success) {
          setStatus(payload.error || "操作失败");
          return;
        }

        clearStatus();
        showToast(`已增加 ${addQuota} 分钟`);
        if (input) input.value = "";
        await loadUsers();
        return;
      }

      if (action === "resetPassword") {
        openResetPasswordDialog(id, email);
        return;
      }

      if (action === "toggle") {
        const nextStatus = userStatus === "active" ? "disabled" : "active";
        const payload = await apiPatch(`/api/admin/users/${id}`, { status: nextStatus });
        if (!payload.success) {
          setStatus(payload.error || "操作失败");
          return;
        }
        clearStatus();
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

function openResetPasswordDialog(userId, email) {
  resetPasswordUserId = userId;
  resetPasswordEmail.textContent = `为用户 ${email} 设置新密码`;
  resetPasswordInput.value = "";
  resetPasswordDialog.showModal();
  resetPasswordInput.focus();
}

function closeResetPasswordDialog() {
  resetPasswordUserId = null;
  resetPasswordDialog.close();
}

function renderRecords(records) {
  document.getElementById("records-table").innerHTML = records.length
    ? `<table class="data-table data-table--admin">
        <thead>
          <tr>
            <th class="col-time">时间</th>
            <th class="col-user">用户</th>
            <th class="col-platform">平台</th>
            <th class="col-title">标题</th>
            <th class="col-charge">时长</th>
            <th class="col-charge">扣费</th>
            <th class="col-status">状态</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (item) => `<tr>
                <td class="col-time">${formatDateCompact(item.created_at)}</td>
                <td class="col-user">${escapeHtml(item.email)}</td>
                <td class="col-platform">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || "-")}</td>
                <td class="col-title">${escapeHtml(item.title || "-")}</td>
                <td class="col-charge">${item.duration_seconds ? Math.ceil(item.duration_seconds / 60) + " 分" : "-"}</td>
                <td class="col-charge">${item.minutes_charged || 0} 分</td>
                <td class="col-status">${renderStatusBadge(item.status)}</td>
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

  clearStatus();
  showToast("账号创建成功");
  document.getElementById("create-user-form").reset();
  document.getElementById("create-quota").value = "30";
  await loadUsers();
  switchTab("users");
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!resetPasswordUserId) return;

  const newPassword = resetPasswordInput.value.trim();
  if (newPassword.length < 6) {
    setStatus("密码至少 6 位");
    return;
  }

  const payload = await apiPatch(`/api/admin/users/${resetPasswordUserId}`, {
    resetPassword: newPassword,
  });

  if (!payload.success) {
    setStatus(payload.error || "重置失败");
    return;
  }

  clearStatus();
  closeResetPasswordDialog();
  showToast("密码已重置，用户需重新登录");
});

document.getElementById("reset-password-cancel").addEventListener("click", () => {
  closeResetPasswordDialog();
});

resetPasswordDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeResetPasswordDialog();
});

init();
