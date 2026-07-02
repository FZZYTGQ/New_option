const PLATFORM_LABELS = {
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSharePage(data, shareId) {
  const platform = PLATFORM_LABELS[data.platform] || data.platform || "";
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title || "视频内容分享")}</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div class="page">
    <header class="hero hero--compact">
      <img src="/pic2.png" alt="小赵学姐的黑科技" class="hero__logo">
      <h1 class="hero__title">小赵学姐的黑科技</h1>
      <p class="hero__subtitle">分享内容 · ${escapeHtml(platform)}</p>
    </header>

    <section class="card result-card">
      <div class="result__toolbar">
        <div class="tabs" role="tablist">
          <button class="tab tab--active" type="button" data-tab="transcript" role="tab">内容转写</button>
          <button class="tab" type="button" data-tab="summary" role="tab">智能总结</button>
        </div>
        <div class="result__actions">
          <button id="download-btn" class="btn btn--secondary" type="button">下载</button>
          <button id="copy-btn" class="btn btn--secondary" type="button">复制</button>
        </div>
      </div>

      <div id="panel-transcript" class="tab-panel tab-panel--active" role="tabpanel">
        <div class="video-meta">
          <p class="video-meta__title"><strong>${escapeHtml(data.title || "未获取到标题")}</strong></p>
          ${data.author ? `<p class="video-meta__item">作者：${escapeHtml(data.author)}</p>` : ""}
          <p class="video-meta__item">链接：<a href="${escapeHtml(data.videoUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.videoUrl)}</a></p>
          ${platform ? `<p class="video-meta__item">平台：${escapeHtml(platform)}</p>` : ""}
        </div>
        <div class="content-box content-box--transcript">${escapeHtml(data.transcript || "")}</div>
      </div>

      <div id="panel-summary" class="tab-panel" role="tabpanel" hidden>
        <div id="summary" class="content-box content-box--summary markdown-body"></div>
      </div>
    </section>
  </div>

  <script>
    window.__SHARE_DATA__ = ${payload};
    window.__SHARE_ID__ = ${JSON.stringify(shareId)};
  </script>
  <script type="module" src="/share.js"></script>
</body>
</html>`;
}
