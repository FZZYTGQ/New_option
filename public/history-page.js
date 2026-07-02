import {
  PLATFORM_LABELS,
  apiGet,
  escapeHtml,
  formatDate,
  requireAuth,
} from "./api.js";
import { buildMarkdown, renderMarkdown } from "./markdown.js";
import { showToast } from "./toast.js";

const historyList = document.getElementById("history-list");
const status = document.getElementById("status");

const detailCache = new Map();
let expandedId = null;

function setStatus(message, type = "error") {
  status.hidden = false;
  status.textContent = message;
  status.className = `status status--${type}`;
}

function switchTab(accordion, name) {
  accordion.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("tab--active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  accordion.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.dataset.panel === name;
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
      <article class="history-accordion" data-id="${item.id}">
        <button class="history-accordion__header" type="button" aria-expanded="false">
          <div class="history-item__meta">
            <span class="badge">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || "未知")}</span>
            <span class="history-item__time">${formatDate(item.created_at)}</span>
            <span class="history-item__status history-item__status--${item.status}">${item.status === "success" ? "成功" : "失败"}</span>
          </div>
          <div class="history-accordion__title-row">
            <span class="history-item__title">${escapeHtml(item.title || "未获取到标题")}</span>
            <span class="history-accordion__chevron" aria-hidden="true">›</span>
          </div>
        </button>
        <div class="history-accordion__body" hidden>
          <div class="history-accordion__loading">加载中…</div>
        </div>
      </article>`
    )
    .join("");

  historyList.querySelectorAll(".history-accordion__header").forEach((button) => {
    button.addEventListener("click", () => {
      const accordion = button.closest(".history-accordion");
      toggleAccordion(accordion.dataset.id);
    });
  });
}

function renderAccordionDetail(accordion, record) {
  const body = accordion.querySelector(".history-accordion__body");
  body.innerHTML = `
    <div class="history-accordion__content card result-card">
      <div class="result__toolbar">
        <div class="tabs" role="tablist">
          <button class="tab tab--active" type="button" data-tab="transcript" role="tab">内容转写</button>
          <button class="tab" type="button" data-tab="summary" role="tab">智能总结</button>
        </div>
        <div class="result__actions">
          <button class="btn btn--secondary history-download-btn" type="button">下载</button>
          <button class="btn btn--secondary history-copy-btn" type="button">复制</button>
        </div>
      </div>

      <div class="tab-panel tab-panel--active" data-panel="transcript" role="tabpanel">
        <div class="video-meta">
          <p class="video-meta__title"><strong>${escapeHtml(record.title || "未获取到标题")}</strong></p>
          ${record.author ? `<p class="video-meta__item">作者：${escapeHtml(record.author)}</p>` : ""}
          <p class="video-meta__item">链接：<a href="${escapeHtml(record.video_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.video_url)}</a></p>
          <p class="video-meta__item">平台：${escapeHtml(PLATFORM_LABELS[record.platform] || record.platform || "")}</p>
        </div>
        <div class="content-box content-box--transcript history-transcript"></div>
      </div>

      <div class="tab-panel" data-panel="summary" role="tabpanel" hidden>
        <div class="content-box content-box--summary markdown-body history-summary"></div>
      </div>
    </div>
  `;

  body.querySelector(".history-transcript").textContent = record.transcript || "暂无转写内容";
  renderMarkdown(
    body.querySelector(".history-summary"),
    record.summary || "暂无总结内容"
  );

  body.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.stopPropagation();
      switchTab(accordion, tab.dataset.tab);
    });
  });

  body.querySelector(".history-download-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    downloadRecord(record);
  });

  body.querySelector(".history-copy-btn").addEventListener("click", async (event) => {
    event.stopPropagation();
    await copyRecord(record);
  });
}

function getRecordPayload(record) {
  return {
    platform: record.platform,
    videoUrl: record.video_url,
    title: record.title,
    author: record.author,
    transcript: record.transcript || "",
    summary: record.summary || "",
  };
}

function downloadRecord(record) {
  const payload = getRecordPayload(record);
  const markdown = buildMarkdown(payload, PLATFORM_LABELS);
  const safeName = (payload.title || "视频内容").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyRecord(record) {
  try {
    await navigator.clipboard.writeText(buildMarkdown(getRecordPayload(record), PLATFORM_LABELS));
    showToast("已复制到剪贴板");
  } catch {
    showToast("复制失败，请手动选择内容复制");
  }
}

function setAccordionExpanded(accordion, expanded) {
  const header = accordion.querySelector(".history-accordion__header");
  const body = accordion.querySelector(".history-accordion__body");
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  accordion.classList.toggle("history-accordion--open", expanded);
  body.hidden = !expanded;
}

async function toggleAccordion(id) {
  const accordion = historyList.querySelector(`.history-accordion[data-id="${id}"]`);
  if (!accordion) return;

  if (expandedId === id) {
    setAccordionExpanded(accordion, false);
    expandedId = null;
    return;
  }

  if (expandedId) {
    const previous = historyList.querySelector(`.history-accordion[data-id="${expandedId}"]`);
    if (previous) {
      setAccordionExpanded(previous, false);
    }
  }

  expandedId = id;
  setAccordionExpanded(accordion, true);

  const body = accordion.querySelector(".history-accordion__body");
  if (detailCache.has(id)) {
    renderAccordionDetail(accordion, detailCache.get(id));
    return;
  }

  body.innerHTML = `<div class="history-accordion__loading">加载中…</div>`;

  const payload = await apiGet(`/api/history/${id}`);
  if (!payload.success) {
    body.innerHTML = `<div class="history-accordion__error">${escapeHtml(payload.error || "加载失败")}</div>`;
    return;
  }

  status.hidden = true;
  detailCache.set(id, payload.data);
  renderAccordionDetail(accordion, payload.data);
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
    await toggleAccordion(detailId);
  }
}

init();
