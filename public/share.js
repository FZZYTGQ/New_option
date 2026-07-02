import { renderMarkdown, buildMarkdown } from "./markdown.js";
import { showToast } from "./toast.js";

const PLATFORM_LABELS = {
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
};

const data = window.__SHARE_DATA__;
const summaryEl = document.getElementById("summary");
const tabs = document.querySelectorAll(".tab");
const panels = {
  transcript: document.getElementById("panel-transcript"),
  summary: document.getElementById("panel-summary"),
};

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

function downloadMarkdown() {
  const markdown = buildMarkdown(data, PLATFORM_LABELS);
  const safeName = (data.title || "视频内容").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyMarkdown() {
  try {
    const markdown = buildMarkdown(data, PLATFORM_LABELS);
    await navigator.clipboard.writeText(markdown);
    showToast("已复制到剪贴板");
  } catch {
    showToast("复制失败，请手动选择内容复制");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

document.getElementById("download-btn")?.addEventListener("click", downloadMarkdown);
document.getElementById("copy-btn")?.addEventListener("click", copyMarkdown);

renderMarkdown(summaryEl, data.summary || "");
switchTab("transcript");
