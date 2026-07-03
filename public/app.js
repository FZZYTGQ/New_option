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
  const user = await requireAuth();
  if (!user) return;

  if (user.role === "admin") {
    elements.adminLink.hidden = false;
  }

  recordsController = createHistoryListController({
    container: elements.recordsList,
    emptyMessage: "暂无记录，提交第一条试试吧",
    limit: 5,
  });

  try {
    await recordsController.load(5);
  } catch (error) {
    setStatus(error.message, "error");
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

elements.extractBtn.addEventListener("click", extractContent);
elements.logoutBtn.addEventListener("click", async () => {
  recordsController?.destroy();
  await apiPost("/api/auth/logout", {});
  window.location.href = "/login.html";
});

init();
