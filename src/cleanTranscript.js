/** 微信公众号页面常见 UI 文案，不应进入正文 */
const WECHAT_UI_LINE_PATTERNS = [
  /^预览时标签不可点$/,
  /^阅读原文$/,
  /^写留言$/,
  /^喜欢作者$/,
  /^轻点两下取消赞$/,
  /^轻点两下取消在看$/,
  /^滑动查看更多$/,
  /^继续滑动看下一个$/,
  /^微信扫一扫赞赏作者$/,
  /^点击[“"]?阅读原文[”"]?$/,
  /^收录于合集$/,
  /^暂无留言$/,
  /^精选留言$/,
  /^查看更多留言$/,
  /^环境异常$/,
  /^当前环境异常，完成验证后即可继续访问。$/,
  /^去验证$/,
];

function isWechatUiLine(line) {
  const text = String(line || "").trim();
  if (!text) return false;
  return WECHAT_UI_LINE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 清洗公众号正文：去掉 BibiGPT 误抓的微信页面 UI 文案。
 */
export function cleanWechatTranscript(transcript) {
  if (!transcript || typeof transcript !== "string") {
    return "";
  }

  const lines = transcript.split(/\r?\n/);
  const kept = [];

  for (const line of lines) {
    if (isWechatUiLine(line)) {
      continue;
    }
    kept.push(line);
  }

  // 去掉文末连续空行
  while (kept.length && !kept[kept.length - 1].trim()) {
    kept.pop();
  }

  return kept.join("\n").trim();
}
