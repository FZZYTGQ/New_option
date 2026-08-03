let markedLoadPromise = null;

function loadMarked() {
  if (window.marked?.parse) {
    return Promise.resolve();
  }

  if (!markedLoadPromise) {
    markedLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("marked 加载失败"));
      document.head.appendChild(script);
    });
  }

  return markedLoadPromise;
}

export async function renderMarkdown(element, markdown) {
  if (!element || !markdown) {
    return;
  }

  try {
    await loadMarked();
    if (window.marked?.parse) {
      element.innerHTML = window.marked.parse(markdown, { breaks: true });
      return;
    }
  } catch {
    // fall back to plain text
  }

  element.textContent = markdown;
}

export function buildMarkdown(data, platformLabels) {
  const platform = platformLabels[data.platform] || data.platform || "";
  const isArticle = data.platform === "wechat";
  const bodyHeading = isArticle ? "文章正文" : "内容转写";
  const lines = [
    `# ${data.title || (isArticle ? "文章内容" : "视频内容")}`,
    "",
    `## ${bodyHeading}`,
    "",
    `**标题：** ${data.title || "未获取到标题"}`,
  ];

  if (data.author) {
    lines.push(`**作者：** ${data.author}`);
  }

  lines.push(`**链接：** ${data.videoUrl}`);

  if (platform) {
    lines.push(`**平台：** ${platform}`);
  }

  lines.push("", data.transcript || "", "", "## 智能总结", "", data.summary || "");
  return lines.join("\n");
}
