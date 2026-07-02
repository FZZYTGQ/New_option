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
  platformBadge: document.getElementById("platform-badge"),
  resultTitle: document.getElementById("result-title"),
  resultAuthor: document.getElementById("result-author"),
  transcript: document.getElementById("transcript"),
  summary: document.getElementById("summary"),
  downloadBtn: document.getElementById("download-btn"),
  shareBtn: document.getElementById("share-btn"),
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

function buildMarkdown(data) {
  const lines = [
    `# ${data.title || "视频内容"}`,
    "",
    `- 平台：${PLATFORM_LABELS[data.platform] || data.platform}`,
    `- 链接：${data.videoUrl}`,
  ];

  if (data.author) {
    lines.push(`- 作者：${data.author}`);
  }

  lines.push("", "## 口播逐字稿", "", data.transcript, "", "## AI 总结", "", data.summary);
  return lines.join("\n");
}

function renderResult(data) {
  currentResult = data;
  elements.result.hidden = false;
  elements.platformBadge.textContent = PLATFORM_LABELS[data.platform] || data.platform;
  elements.resultTitle.textContent = data.title || "未获取到标题";
  elements.resultAuthor.textContent = data.author ? `作者：${data.author}` : "";
  elements.transcript.textContent = data.transcript;
  elements.summary.textContent = data.summary;
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

  const markdown = buildMarkdown(currentResult);
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

async function shareResult() {
  if (!currentResult) return;

  const markdown = buildMarkdown(currentResult);
  const shareData = {
    title: currentResult.title || "视频口播稿与总结",
    text: markdown,
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
    await navigator.clipboard.writeText(markdown);
    setStatus("当前设备不支持系统分享，内容已复制到剪贴板", "loading");
    window.setTimeout(clearStatus, 2500);
  } catch {
    setStatus("分享失败，请使用下载 Markdown", "error");
  }
}

elements.extractBtn.addEventListener("click", extractContent);
elements.downloadBtn.addEventListener("click", downloadMarkdown);
elements.shareBtn.addEventListener("click", shareResult);

if (!navigator.share) {
  elements.shareBtn.textContent = "复制全部";
}
