import {
  PLATFORM_LABELS,
  apiGet,
  escapeHtml,
  formatDate,
} from "./api.js";
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

function failedPreviewHtml(item) {
  if (item.status !== "failed") return "";

  const raw = item.error_message || "处理失败，点击查看详情";
  const problemLine = raw
    .split("\n")
    .find((line) => line.startsWith("【问题】"))
    ?.replace("【问题】", "")
    .trim();
  const stageLine = raw
    .split("\n")
    .find((line) => line.startsWith("【环节】"))
    ?.replace("【环节】", "")
    .trim();
  const preview = [stageLine, problemLine].filter(Boolean).join(" · ") || raw.split("\n")[0];
  return `<p class="history-item__error">${escapeHtml(preview)}</p>`;
}

function renderListItem(item) {
  const title = item.title || item.video_url || "未获取到标题";
  return `
    <article class="history-accordion" data-id="${item.id}" data-status="${item.status}">
      <a class="history-accordion__header history-accordion__link" href="/detail.html?id=${encodeURIComponent(item.id)}">
        <div class="history-item__meta">
          <span class="badge">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || "未知")}</span>
          <span class="history-item__time">${formatDate(item.created_at)}</span>
          ${renderStatusBadge(item.status)}
        </div>
        <div class="history-accordion__title-row">
          <span class="history-item__title">${escapeHtml(title)}</span>
          <span class="history-accordion__chevron" aria-hidden="true">›</span>
        </div>
        ${failedPreviewHtml(item)}
      </a>
    </article>`;
}

export function createHistoryListController({
  container,
  emptyMessage = "还没有记录",
  limit = null,
  detailFrom = null,
}) {
  let pollTimer = null;
  let items = [];

  function detailHref(id) {
    const params = new URLSearchParams({ id });
    if (detailFrom) params.set("from", detailFrom);
    return `/detail.html?${params.toString()}`;
  }

  function renderList(newItems) {
    items = newItems;
    container.classList.remove("history-list--loading");
    container.removeAttribute("aria-busy");

    if (!items.length) {
      container.innerHTML = `<div class="card empty-card">${escapeHtml(emptyMessage)}</div>`;
      stopPolling();
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const html = renderListItem(item);
        return detailFrom
          ? html.replace(
              `href="/detail.html?id=${encodeURIComponent(item.id)}"`,
              `href="${detailHref(item.id)}"`
            )
          : html;
      })
      .join("");

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

    const newlyFinished = (payload.data || []).filter(
      (item) => previousPending.includes(item.id) && !isPending(item.status)
    );

    newlyFinished
      .filter((item) => item.status === "failed")
      .forEach((item) => {
        const raw = item.error_message || "处理失败";
        const problem = raw
          .split("\n")
          .find((line) => line.startsWith("【问题】"))
          ?.replace("【问题】", "")
          .trim();
        showToast(`失败：${problem || raw.split("\n")[0]}`);
      });

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
    startPolling,
    stopPolling,
    destroy,
    getItems: () => items,
  };
}
