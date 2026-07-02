import {
  PLATFORM_LABELS,
  apiGet,
  formatDate,
  requireAuth,
} from "./api.js";
import { buildMarkdown, renderMarkdown } from "./markdown.js";
import { showToast } from "./toast.js";

const historyList = document.getElementById("history-list");
const historyDetail = document.getElementById("history-detail");
const status = document.getElementById("status");
const tabs = document.querySelectorAll(".tab");
const panels = {
  transcript: document.getElementById("panel-transcript"),
  summary: document.getElementById("panel-summary"),
};

let currentRecord = null;

function setStatus(message, type = "error") {
  status.hidden = false;
  status.textContent = message;
  status.className = `status status--${type}`;
}

function switchTab(name) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("tab--active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  Object.entries(panels).forEach(([key, panel]) => {
    const active = key === name;
    panel.hidden = !active;
    panel.classList.toggle("tab-panel--active", active);
  });
}

function renderList(items) {
  if (!items.length) {
    historyList.innerHTML = `<div class="card empty-card">还没有历史记录，去首页提取一个视频吧。</div>`;
    return;
  }

  historyList.innerHTML = items
    .map(
      (item) => `
      <button class="history-item" type="button" data-id="${item.id}">
        <div class="history-item__meta">
          <span class="badge">${PLATFORM_LABELS[item.platform] || item.platform || "未知"}</span>
          <span class="history-item__time">${formatDate(item.created_at)}</span>
          <span class="history-item__status history-item__status--${item.status}">${item.status === "success" ? "成功" : "失败"}</span>
        </div>
        <div class="history-item__title">${item.title || "未获取到标题"}</div>
      </button>`
    )
    .join("");

  historyList.querySelectorAll(".history-item").forEach((button) => {
    button.addEventListener("click", () => loadDetail(button.dataset.id));
  });
}

function renderDetail(record) {
  currentRecord = {
    platform: record.platform,
    videoUrl: record.video_url,
    title: record.title,
    author: record.author,
    transcript: record.transcript || "",
    summary: record.summary || "",
  };

  historyDetail.hidden = false;
  document.getElementById("meta-title").textContent = record.title || "未获取到标题";
  document.getElementById("meta-link").textContent = record.video_url;
  document.getElementById("meta-link").href = record.video_url;
  document.getElementById("meta-platform").textContent =
    PLATFORM_LABELS[record.platform] || record.platform || "";

  const authorEl = document.getElementById("meta-author");
  if (record.author) {
    authorEl.hidden = false;
    authorEl.textContent = `作者：${record.author}`;
  } else {
    authorEl.hidden = true;
  }

  document.getElementById("transcript").textContent = record.transcript || "暂无转写内容";
  renderMarkdown(document.getElementById("summary"), record.summary || "暂无总结内容");
  switchTab("transcript");
  historyDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadDetail(id) {
  const payload = await apiGet(`/api/history/${id}`);
  if (!payload.success) {
    setStatus(payload.error || "加载失败");
    return;
  }
  status.hidden = true;
  renderDetail(payload.data);
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const payload = await apiGet("/api/history");
  if (!payload.success) {
    setStatus(payload.error || "加载历史记录失败");
    return;
  }

  renderList(payload.data || []);

  const params = new URLSearchParams(window.location.search);
  const detailId = params.get("id");
  if (detailId) {
    await loadDetail(detailId);
  }
}

document.getElementById("download-btn").addEventListener("click", () => {
  if (!currentRecord) return;
  const markdown = buildMarkdown(currentRecord, PLATFORM_LABELS);
  const safeName = (currentRecord.title || "视频内容").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.md`;
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById("copy-btn").addEventListener("click", async () => {
  if (!currentRecord) return;
  try {
    await navigator.clipboard.writeText(buildMarkdown(currentRecord, PLATFORM_LABELS));
    showToast("已复制到剪贴板");
  } catch {
    showToast("复制失败，请手动选择内容复制");
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

init();
