import { renderMarkdown, buildMarkdown } from "./markdown.js";
import { showToast } from "./toast.js";

const PLATFORM_LABELS = {
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
};

const elements = {
  input: document.getElementById("share-input"),
  extractBtn: document.getElementById("extract-btn"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  metaTitle: document.getElementById("meta-title"),
  metaAuthor: document.getElementById("meta-author"),
  metaLink: document.getElementById("meta-link"),
  metaPlatform: document.getElementById("meta-platform"),
  transcript: document.getElementById("transcript"),
  summary: document.getElementById("summary"),
  downloadBtn: document.getElementById("download-btn"),
  copyBtn: document.getElementById("copy-btn"),
  shareBtn: document.getElementById("share-btn"),
  tabs: document.querySelectorAll(".tab"),
  panels: {
    transcript: document.getElementById("panel-transcript"),
    summary: document.getElementById("panel-summary"),
  },
};

let currentResult = null;

function setStatus(message, type = "loading") {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.status.className = `status status--${type}`;
}

function clearStatus() {
  elements.status.hidden = true;
  elements.status.textContent = "";
}

function switchTab(name) {
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("tab--active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  Object.entries(elements.panels).forEach(([key, panel]) => {
    const active = key === name;
    panel.hidden = !active;
    panel.classList.toggle("tab-panel--active", active);
  });
}

function renderResult(data) {
  currentResult = data;
  elements.result.hidden = false;

  elements.metaTitle.textContent = data.title || "未获取到标题";
  elements.metaLink.textContent = data.videoUrl;
  elements.metaLink.href = data.videoUrl;
  elements.metaPlatform.textContent = PLATFORM_LABELS[data.platform] || data.platform || "";

  if (data.author) {
    elements.metaAuthor.hidden = false;
    elements.metaAuthor.textContent = `作者：${data.author}`;
  } else {
    elements.metaAuthor.hidden = true;
    elements.metaAuthor.textContent = "";
  }

  elements.transcript.textContent = data.transcript;
  renderMarkdown(elements.summary, data.summary);
  switchTab("transcript");
}

async function extractContent() {
  const input = elements.input.value.trim();
  if (!input) {
    setStatus("请先粘贴分享内容", "error");
    return;
  }

  elements.extractBtn.disabled = true;
  elements.result.hidden = true;
  setStatus("正在提取口播稿并生成总结，可能需要 1～3 分钟，请稍候…", "loading");

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "提取失败");
    }

    renderResult(payload.data);
    clearStatus();
  } catch (error) {
    setStatus(error.message || "提取失败，请稍后重试", "error");
  } finally {
    elements.extractBtn.disabled = false;
  }
}

function downloadMarkdown() {
  if (!currentResult) return;

  const markdown = buildMarkdown(currentResult, PLATFORM_LABELS);
  const safeName = (currentResult.title || "视频内容")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 40);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyMarkdown() {
  if (!currentResult) return;

  try {
    const markdown = buildMarkdown(currentResult, PLATFORM_LABELS);
    await navigator.clipboard.writeText(markdown);
    showToast("已复制到剪贴板");
  } catch {
    showToast("复制失败，请手动选择内容复制");
  }
}

async function shareResult() {
  if (!currentResult?.shareUrl) {
    setStatus("分享链接生成失败，请重新提取", "error");
    return;
  }

  const shareData = {
    title: currentResult.title || "视频内容分享",
    url: currentResult.shareUrl,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(currentResult.shareUrl);
    setStatus("分享链接已复制到剪贴板", "loading");
    window.setTimeout(clearStatus, 2500);
  } catch {
    setStatus("分享失败，请手动复制链接", "error");
  }
}

elements.extractBtn.addEventListener("click", extractContent);
elements.downloadBtn.addEventListener("click", downloadMarkdown);
elements.copyBtn.addEventListener("click", copyMarkdown);
elements.shareBtn.addEventListener("click", shareResult);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});
