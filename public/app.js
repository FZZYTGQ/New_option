import { apiPost, formatRequestError, requireAuth } from "./api.js";
import { createHistoryListController } from "./history-list.js";
import { showToast } from "./toast.js";

const SUPPORTED_HOSTS = [
  "douyin.com",
  "iesdouyin.com",
  "bilibili.com",
  "b23.tv",
  "xiaohongshu.com",
  "xhslink.com",
  "xhslink.cn",
  "mp.weixin.qq.com",
];

const elements = {
  input: document.getElementById("share-input"),
  extractBtn: document.getElementById("extract-btn"),
  status: document.getElementById("status"),
  recordsList: document.getElementById("records-list"),
  adminLink: document.getElementById("admin-link"),
  logoutBtn: document.getElementById("logout-btn"),
  clipboardSlot: document.getElementById("clipboard-slot"),
  clipboardPrompt: document.getElementById("clipboard-prompt"),
  clipboardPasteBtn: document.getElementById("clipboard-paste-btn"),
  clipboardDismissBtn: document.getElementById("clipboard-dismiss-btn"),
};

let recordsController = null;
let pendingClipboardText = "";
let clipboardDismissedKey = "";

function setStatus(message, type = "loading") {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.status.className = `status status--${type}`;
}

function clearStatus() {
  elements.status.hidden = true;
  elements.status.textContent = "";
}

function hostMatches(hostname) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return SUPPORTED_HOSTS.some(
    (item) => host === item || host.endsWith(`.${item}`) || host === `v.${item}`
  );
}

/** 剪切板是否包含抖音 / B站 / 小红书 / 微信公众号链接 */
function looksLikeSupportedShare(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;

  const urls = raw.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/giu) || [];
  const bare = raw.match(
    /(?:https?:\/\/)?(?:v\.douyin\.com|www\.douyin\.com|www\.bilibili\.com|b23\.tv|www\.xiaohongshu\.com|xhslink\.com|xhslink\.cn|mp\.weixin\.qq\.com)\/[^\s<>"{}|\\^`[\]]+/giu
  ) || [];

  for (const candidate of [...urls, ...bare]) {
    try {
      const withScheme = candidate.startsWith("http") ? candidate : `https://${candidate}`;
      if (hostMatches(new URL(withScheme).hostname)) {
        return true;
      }
    } catch {
      // ignore invalid url
    }
  }

  return false;
}

async function readClipboardText() {
  if (!navigator.clipboard?.readText) {
    return "";
  }
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    // 浏览器可能要求权限或用户手势，失败时静默忽略
    return "";
  }
}

function hideClipboardPrompt() {
  elements.clipboardSlot?.classList.remove("is-open");
  if (elements.clipboardPrompt) {
    elements.clipboardPrompt.setAttribute("aria-hidden", "true");
  }
}

function showClipboardPrompt(text) {
  pendingClipboardText = text;
  elements.clipboardSlot?.classList.add("is-open");
  if (elements.clipboardPrompt) {
    elements.clipboardPrompt.setAttribute("aria-hidden", "false");
  }
}

async function detectClipboardLink({ force = false } = {}) {
  if (!elements.input || elements.input.value.trim()) {
    hideClipboardPrompt();
    return;
  }

  const text = await readClipboardText();
  if (!text || !looksLikeSupportedShare(text)) {
    if (!force) hideClipboardPrompt();
    return;
  }

  if (text === clipboardDismissedKey) {
    return;
  }

  showClipboardPrompt(text);
}

async function pasteClipboardIntoInput() {
  // 点击时再读一次，兼容需用户手势的浏览器
  const text = (await readClipboardText()) || pendingClipboardText;
  if (!text) {
    showToast("无法读取剪切板，请手动粘贴");
    return;
  }

  elements.input.value = text;
  elements.input.focus();
  hideClipboardPrompt();
  clipboardDismissedKey = text;
  showToast("已粘贴剪切板内容");
}

function dismissClipboardPrompt() {
  clipboardDismissedKey = pendingClipboardText || clipboardDismissedKey;
  pendingClipboardText = "";
  hideClipboardPrompt();
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
    const payload = await apiPost("/api/extract", { input });
    if (!payload.success) {
      throw new Error(payload.error || "提交失败");
    }

    clearStatus();
    elements.input.value = "";
    showToast(payload.data.message || "已提交");

    const newId = payload.data.historyId;
    if (newId) {
      window.location.href = `/detail.html?id=${encodeURIComponent(newId)}&from=home`;
      return;
    }

    await recordsController?.load(5);
  } catch (error) {
    setStatus(formatRequestError(error, "提交失败，请稍后重试"), "error");
  } finally {
    elements.extractBtn.disabled = false;
  }
}

async function init() {
  if (elements.recordsList) {
    recordsController = createHistoryListController({
      container: elements.recordsList,
      emptyMessage: "暂无记录，提交第一条试试吧",
      limit: 5,
      detailFrom: "home",
    });
  }

  const authPromise = requireAuth();
  const loadPromise = recordsController
    ? recordsController.load(5).catch((error) => error)
    : Promise.resolve(null);

  const [user, loadResult] = await Promise.all([authPromise, loadPromise]);

  if (!user) return;

  if (user.role === "admin" && elements.adminLink) {
    elements.adminLink.hidden = false;
  }

  if (loadResult instanceof Error && elements.recordsList) {
    const tip = formatRequestError(loadResult, "记录加载失败，请刷新页面重试");
    elements.recordsList.classList.remove("history-list--loading");
    elements.recordsList.removeAttribute("aria-busy");
    elements.recordsList.innerHTML = `<div class="card empty-card">${tip}</div>`;
    setStatus(tip, "error");
  }

  // 登录后检测剪切板
  void detectClipboardLink();

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;

    if (recordsController) {
      try {
        await recordsController.load(5);
      } catch {
        // ignore
      }
    }

    void detectClipboardLink();
  });
}

elements.input?.addEventListener("focus", () => {
  setTimeout(() => {
    elements.input.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
  // 部分浏览器仅在用户手势后才允许读剪切板
  void detectClipboardLink();
});

elements.clipboardPasteBtn?.addEventListener("click", () => {
  void pasteClipboardIntoInput();
});

elements.clipboardDismissBtn?.addEventListener("click", () => {
  dismissClipboardPrompt();
});

elements.extractBtn?.addEventListener("click", extractContent);
elements.logoutBtn?.addEventListener("click", async () => {
  recordsController?.destroy();
  await apiPost("/api/auth/logout", {});
  window.location.href = "/login.html";
});

init();
