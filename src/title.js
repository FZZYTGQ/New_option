const TOPIC_RE = /[#＃]([^\s#＃]+)/gu;

/**
 * 从原始标题中拆出正文标题与话题词。
 * 例："早起的红利 #早起 #自律" → titleText="早起的红利", topics=["#早起","#自律"]
 */
export function parseTitleAndTopics(rawTitle) {
  const text = String(rawTitle || "").trim();
  if (!text) {
    return { titleText: "", topics: [] };
  }

  const topics = [];
  for (const match of text.matchAll(TOPIC_RE)) {
    const tag = String(match[1] || "")
      .replace(/[.,!?;:，。！？；：、…]+$/u, "")
      .trim();
    if (tag) {
      topics.push(`#${tag}`);
    }
  }

  const titleText = text
    .replace(TOPIC_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { titleText, topics };
}

/**
 * a. 有标题（可同时有话题）→ 只显示标题
 * b. 无标题仅有话题 → 只显示话题词
 * c. 都没有 → 返回空字符串，由调用方走 AI 补标题
 */
export function pickDisplayTitle(rawTitle) {
  const { titleText, topics } = parseTitleAndTopics(rawTitle);
  if (titleText) return titleText;
  if (topics.length) return topics.join(" ");
  return "";
}
