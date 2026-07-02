export function renderMarkdown(element, markdown) {
  if (!element || !markdown) {
    return;
  }

  if (window.marked?.parse) {
    element.innerHTML = window.marked.parse(markdown, { breaks: true });
    return;
  }

  element.textContent = markdown;
}

export function buildMarkdown(data, platformLabels) {
  const platform = platformLabels[data.platform] || data.platform || "";
  const lines = [
    `# ${data.title || "视频内容"}`,
    "",
    "## 内容转写",
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
