import {
  PLATFORM_LABELS,
  apiGet,
  escapeHtml,
  formatDate,
} from "./api.js";
import { buildMarkdown, renderMarkdown } from "./markdown.js";
import { showToast } from "./toast.js";

export const STATUS_LABELS = {
  processing: "处理中",
  queued: "排队中",
  success: "成功",
  failed: "失败",
};

const POLL_INTERVAL_MS = 4000;

function renderStatusBadge(status) {
  return `<span class="history-item__status history-item__status--${status}">${STATUS_LABELS[status] || status}</span>`;
}

function isPending(status) {
  return status === "processing" || status === "queued";
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

function renderPendingBody(accordion, record) {
  const body = accordion.querySelector(".history-accordion__body");
  const message =
    record.status === "queued"
      ? "排队中，前方任务完成后将自动开始处理"
      : "正在转写和总结，约需 1～3 分钟，可稍后再看";
  body.innerHTML = `<div class="history-accordion__pending">${escapeHtml(message)}</div>`;
}

function renderAccordionDetail(accordion, record) {
  const body = accordion.querySelector(".history-accordion__body");

  if (isPending(record.status)) {
    renderPendingBody(accordion, record);
    return;
  }

  if (record.status === "failed" && !record.transcript) {
    body.innerHTML = `<div class="history-accordion__error">${escapeHtml(record.error_message || "处理失败")}</div>`;
    return;
  }

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
          ${record.status === "failed" && record.error_message ? `<p class="video-meta__item history-item__status--failed">错误：${escapeHtml(record.error_message)}</p>` : ""}
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
    record.summary || (record.status === "failed" ? "总结失败" : "暂无总结内容")
  );

  body.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.stopPropagation();
      switchTab(accordion, tab.dataset.tab);
    });
  });

  body.querySelector(".history-download-btn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    downloadRecord(record);
  });

  body.querySelector(".history-copy-btn")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await copyRecord(record);
  });
}

function renderAccordionItem(item) {
  const title = item.title || item.video_url || "未获取到标题";
  return `
    <article class="history-accordion" data-id="${item.id}" data-status="${item.status}">
      <button class="history-accordion__header" type="button" aria-expanded="false">
        <div class="history-item__meta">
          <span class="badge">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || "未知")}</span>
          <span class="history-item__time">${formatDate(item.created_at)}</span>
          ${renderStatusBadge(item.status)}
        </div>
        <div class="history-accordion__title-row">
          <span class="history-item__title">${escapeHtml(title)}</span>
          <span class="history-accordion__chevron" aria-hidden="true">›</span>
        </div>
      </button>
      <div class="history-accordion__body" hidden>
        <div class="history-accordion__loading">加载中…</div>
      </div>
    </article>`;
}

export function createHistoryListController({
  container,
  emptyMessage = "还没有记录",
  limit = null,
}) {
  const detailCache = new Map();
  const listCache = new Map();
  let expandedId = null;
  let pollTimer = null;
  let items = [];

  function setAccordionExpanded(accordion, expanded) {
    const header = accordion.querySelector(".history-accordion__header");
    const body = accordion.querySelector(".history-accordion__body");
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    accordion.classList.toggle("history-accordion--open", expanded);
    body.hidden = !expanded;
  }

  function collapseExpanded() {
    if (!expandedId) return;
    const previous = container.querySelector(`.history-accordion[data-id="${expandedId}"]`);
    if (previous) {
      setAccordionExpanded(previous, false);
    }
    expandedId = null;
  }

  async function toggleAccordion(id) {
    const accordion = container.querySelector(`.history-accordion[data-id="${id}"]`);
    if (!accordion) return;

    if (expandedId === id) {
      setAccordionExpanded(accordion, false);
      expandedId = null;
      return;
    }

    if (expandedId) {
      const previous = container.querySelector(`.history-accordion[data-id="${expandedId}"]`);
      if (previous) {
        setAccordionExpanded(previous, false);
      }
    }

    expandedId = id;
    setAccordionExpanded(accordion, true);

    const listItem = listCache.get(id);
    if (listItem && isPending(listItem.status)) {
      renderAccordionDetail(accordion, listItem);
      return;
    }

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

    detailCache.set(id, payload.data);
    renderAccordionDetail(accordion, payload.data);
  }

  function bindHeaders() {
    container.querySelectorAll(".history-accordion__header").forEach((button) => {
      button.onclick = () => {
        const accordion = button.closest(".history-accordion");
        toggleAccordion(accordion.dataset.id);
      };
    });
  }

  function renderList(newItems) {
    items = newItems;
    listCache.clear();
    items.forEach((item) => listCache.set(item.id, item));

    if (!items.length) {
      container.innerHTML = `<div class="card empty-card">${escapeHtml(emptyMessage)}</div>`;
      expandedId = null;
      stopPolling();
      return;
    }

    const openId = expandedId;
    container.innerHTML = items.map(renderAccordionItem).join("");
    bindHeaders();

    if (openId && listCache.has(openId)) {
      const accordion = container.querySelector(`.history-accordion[data-id="${openId}"]`);
      if (accordion) {
        expandedId = openId;
        setAccordionExpanded(accordion, true);
        const cached = detailCache.get(openId);
        const listItem = listCache.get(openId);
        if (cached && !isPending(cached.status)) {
          renderAccordionDetail(accordion, cached);
        } else if (listItem && isPending(listItem.status)) {
          renderAccordionDetail(accordion, listItem);
        }
      } else {
        expandedId = null;
      }
    }

    if (items.some((item) => isPending(item.status))) {
      startPolling();
    } else {
      stopPolling();
    }
  }

  async function load(customLimit) {
    const actualLimit = customLimit ?? limit;
    const path = actualLimit ? `/api/history?limit=${actualLimit}` : "/api/history";
    const payload = await apiGet(path);
    if (!payload.success) {
      throw new Error(payload.error || "加载记录失败");
    }

    const previousPending = items.filter((item) => isPending(item.status)).map((item) => item.id);
    renderList(payload.data || []);

    const newlyDone = (payload.data || []).filter(
      (item) =>
        previousPending.includes(item.id) &&
        !isPending(item.status) &&
        item.status === "success"
    );
    newlyDone.forEach((item) => detailCache.delete(item.id));

    return payload.data || [];
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (document.hidden) return;
      try {
        await load();
      } catch {
        // ignore polling errors
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function destroy() {
    stopPolling();
  }

  return {
    load,
    renderList,
    toggleAccordion,
    collapseExpanded,
    startPolling,
    stopPolling,
    destroy,
    getItems: () => items,
  };
}
