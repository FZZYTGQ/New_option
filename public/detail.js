import {
  PLATFORM_LABELS,
  apiGet,
  escapeHtml,
  formatDate,
  formatRequestError,
  requireAuth,
} from "./api.js";
import { buildMarkdown, renderMarkdown } from "./markdown.js";
import { showToast } from "./toast.js";

const STATUS_LABELS = {
  processing: "处理中",
  queued: "排队中",
  success: "成功",
  failed: "失败",
};

const POLL_INTERVAL_MS = 4000;

const elements = {
  root: document.getElementById("detail-root"),
  status: document.getElementById("status"),
  backLink: document.getElementById("back-link"),
};

let pollTimer = null;
let currentRecord = null;

function isPending(status) {
  return status === "processing" || status === "queued";
}

function setStatus(message, type = "error") {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.status.className = `status status--${type}`;
}

function clearStatus() {
  elements.status.hidden = true;
  elements.status.textContent = "";
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

function switchTab(name) {
  elements.root.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("tab--active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  elements.root.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.hidden = !active;
    panel.classList.toggle("tab-panel--active", active);
  });
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(id) {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      await loadDetail(id, { silent: true });
    } catch {
      // ignore polling errors
    }
  }, POLL_INTERVAL_MS);
}

function sourceLinkHtml(record) {
  if (!record.video_url) return "";
  return `<a class="detail-card__source" href="${escapeHtml(record.video_url)}" target="_blank" rel="noopener noreferrer">原文链接</a>`;
}

function renderPending(record) {
  const title = record.title || "处理中…";
  const message =
    record.status === "queued"
      ? "排队中，等待前方任务完成"
      : "正在处理，约需 1～3 分钟，可稍后再看";

  elements.root.innerHTML = `
    <section class="detail-card card">
      <div class="detail-card__meta">
        <div class="detail-card__meta-left">
          <span class="badge">${escapeHtml(PLATFORM_LABELS[record.platform] || record.platform || "未知")}</span>
          ${sourceLinkHtml(record)}
          <span class="history-item__time">${formatDate(record.created_at)}</span>
        </div>video-meta__item
        <span class="history-item__status history-item__status--${record.status}">${STATUS_LABELS[record.status] || record.status}</span>
      </div>
      <h2 class="detail-card__title">${escapeHtml(title)}</h2>
      <div class="detail-card__pending" role="status" aria-live="polite">
        <div class="detail-loading" aria-hidden="true">
          <span class="detail-loading__spinner"></span>
        </div>
        <p class="detail-card__pending-text">${escapeHtml(message)}</p>
      </div>
    </section>
  `;
}

function renderFailed(record) {
  const title = record.title || "处理失败";
  const reason = record.error_message || "处理失败";

  elements.root.innerHTML = `
    <section class="detail-card card">
      <div class="detail-card__meta">
        <div class="detail-card__meta-left">
          <span class="badge">${escapeHtml(PLATFORM_LABELS[record.platform] || record.platform || "未知")}</span>
          ${sourceLinkHtml(record)}
          <span class="history-item__time">${formatDate(record.created_at)}</span>
        </div>
        <span class="history-item__status history-item__status--failed">失败</span>
      </div>
      <h2 class="detail-card__title">${escapeHtml(title)}</h2>
      <div class="history-accordion__error">
        <div class="history-accordion__error-title">失败诊断</div>
        <pre class="history-accordion__error-body">${escapeHtml(reason)}</pre>
      </div>
    </section>
  `;
}

async function renderSuccess(record) {
  const platformLabel = PLATFORM_LABELS[record.platform] || record.platform || "";
  const title = record.title || "未获取到标题";

  elements.root.innerHTML = `
    <section class="detail-card card">
      <div class="detail-card__meta">
        <div class="detail-card__meta-left">
          <span class="badge">${escapeHtml(platformLabel || "未知")}</span>
          ${sourceLinkHtml(record)}
          <span class="history-item__time">${formatDate(record.created_at)}</span>
        </div>
        <span class="history-item__status history-item__status--success">成功</span>
      </div>
      <h2 class="detail-card__title">${escapeHtml(title)}</h2>

      <div class="result__toolbar history-result__toolbar detail-card__toolbar">
        <div class="tabs" role="tablist">
          <button class="tab tab--active" type="button" data-tab="transcript" role="tab">内容转写</button>
          <button class="tab" type="button" data-tab="summary" role="tab">智能总结</button>
        </div>
        <div class="result__actions">
          <button class="btn btn--secondary detail-download-btn" type="button">下载</button>
          <button class="btn btn--secondary detail-copy-btn" type="button">复制</button>
        </div>
      </div>

      <div class="tab-panel tab-panel--active" data-panel="transcript" role="tabpanel">
        <div class="video-meta">
          ${record.error_message
      ? `<pre class="history-accordion__error-body history-accordion__error-body--inline">${escapeHtml(record.error_message)}</pre>`
      : ""
    }
        </div>
        <div class="content-box content-box--transcript detail-transcript"></div>
      </div>

      <div class="tab-panel" data-panel="summary" role="tabpanel" hidden>
        <div class="content-box content-box--summary markdown-body detail-summary"></div>
      </div>
    </section>
  `;

  elements.root.querySelector(".detail-transcript").textContent =
    record.transcript || "暂无转写内容";
  await renderMarkdown(
    elements.root.querySelector(".detail-summary"),
    record.summary || "暂无总结内容"
  );

  elements.root.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  elements.root.querySelector(".detail-download-btn")?.addEventListener("click", () => {
    downloadRecord(record);
  });
  elements.root.querySelector(".detail-copy-btn")?.addEventListener("click", async () => {
    await copyRecord(record);
  });
}

function isQuotaFailure(record) {
  const message = String(record.error_message || "");
  return record.status === "failed" && (message.includes("剩余额度不足") || message.includes("可用分钟数不足"));
}

async function renderRecord(record) {
  currentRecord = record;
  document.title = `${record.title || "详情"} - 小赵学姐的黑科技`;

  if (isPending(record.status)) {
    renderPending(record);
    return;
  }

  // 额度不足或无转写的失败：只展示失败诊断，不展示内容
  if (record.status === "failed" && (!record.transcript || isQuotaFailure(record))) {
    renderFailed(record);
    return;
  }

  await renderSuccess(record);
}

async function loadDetail(id, { silent = false } = {}) {
  const payload = await apiGet(`/api/history/${id}`);
  if (!payload.success) {
    throw new Error(payload.error || "加载失败");
  }

  const record = payload.data;
  const prevStatus = currentRecord?.status;
  const shouldRerender =
    !silent ||
    !currentRecord ||
    prevStatus !== record.status ||
    currentRecord.transcript !== record.transcript ||
    currentRecord.summary !== record.summary;

  if (shouldRerender) {
    await renderRecord(record);
  } else {
    currentRecord = record;
  }

  if (isPending(record.status)) {
    startPolling(id);
  } else {
    stopPolling();
  }

  if (!silent) {
    clearStatus();
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const from = params.get("from");

  if (from === "home") {
    elements.backLink.href = "/";
    elements.backLink.textContent = "← 返回首页";
  }

  if (!id) {
    setStatus("缺少记录 ID", "error");
    elements.root.innerHTML = "";
    elements.root.removeAttribute("aria-busy");
    return;
  }

  const user = await requireAuth();
  if (!user) return;

  elements.root.innerHTML = `<div class="card empty-card">加载中…</div>`;

  try {
    await loadDetail(id);
  } catch (error) {
    setStatus(formatRequestError(error, "加载详情失败"), "error");
    elements.root.innerHTML = `<div class="card empty-card">无法加载该记录</div>`;
  } finally {
    elements.root.removeAttribute("aria-busy");
  }

  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && id && currentRecord && isPending(currentRecord.status)) {
      try {
        await loadDetail(id, { silent: true });
      } catch {
        // ignore
      }
    }
  });
}

init();
