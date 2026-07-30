import { apiGet, apiPost, requireAuth } from "./api.js";
import { createHistoryListController } from "./history-list.js";
import { showToast } from "./toast.js";

const elements = {
  input: document.getElementById("share-input"),
  extractBtn: document.getElementById("extract-btn"),
  status: document.getElementById("status"),
  recordsList: document.getElementById("records-list"),
  adminLink: document.getElementById("admin-link"),
  logoutBtn: document.getElementById("logout-btn"),
};

let recordsController = null;

function setStatus(message, type = "loading") {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.status.className = `status status--${type}`;
}

function clearStatus() {
  elements.status.hidden = true;
  elements.status.textContent = "";
}

async function extractContent() {
  const input = elements.input.value.trim();
  if (!input) {
    setStatus("请先粘贴分享内容", "error");
    return;
  }

  setStatus("正在处理，可能需要 1～3 分钟，请稍候…", "loading");
  elements.extractBtn.disabled = true;

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });

    const payload = await response.json();
    // #region agent log
    fetch("http://127.0.0.1:7261/ingest/1bff3e25-de4a-4550-b309-49dd62349c18", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "1805c8",
      },
      body: JSON.stringify({
        sessionId: "1805c8",
        runId: "pre-fix",
        hypothesisId: "E",
        location: "app.js:extractContent",
        message: "extract API response",
        data: {
          ok: response.ok,
          success: payload?.success,
          historyId: payload?.data?.historyId || null,
          status: payload?.data?.status || null,
          platform: payload?.data?.platform || null,
          error: payload?.error || null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "提交失败");
    }

    clearStatus();
    elements.input.value = "";
    showToast(payload.data.message || "已提交");

    await recordsController.load(5);

    const newId = payload.data.historyId;
    if (newId) {
      await recordsController.toggleAccordion(newId);
      const accordion = elements.recordsList.querySelector(
        `.history-accordion[data-id="${newId}"]`
      );
      accordion?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } catch (error) {
    setStatus(error.message || "提交失败，请稍后重试", "error");
  } finally {
    elements.extractBtn.disabled = false;
  }
}

async function init() {
  recordsController = createHistoryListController({
    container: elements.recordsList,
    emptyMessage: "暂无记录，提交第一条试试吧",
    limit: 5,
  });

  const [user, loadResult] = await Promise.all([
    requireAuth(),
    recordsController.load(5).catch((error) => error),
  ]);

  if (!user) return;

  if (user.role === "admin") {
    elements.adminLink.hidden = false;
  }

  if (loadResult instanceof Error) {
    elements.recordsList.classList.remove("history-list--loading");
    elements.recordsList.removeAttribute("aria-busy");
    elements.recordsList.innerHTML =
      '<div class="card empty-card">记录加载失败，请刷新页面重试</div>';
    setStatus(loadResult.message, "error");
  }

  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && recordsController) {
      try {
        await recordsController.load(5);
      } catch {
        // ignore
      }
    }
  });
}

elements.input.addEventListener("focus", () => {
  setTimeout(() => {
    elements.input.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
});

elements.extractBtn.addEventListener("click", extractContent);
elements.logoutBtn.addEventListener("click", async () => {
  recordsController?.destroy();
  await apiPost("/api/auth/logout", {});
  window.location.href = "/login.html";
});

init();
