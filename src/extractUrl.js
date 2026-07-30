const PLATFORM_HOSTS = {
  bilibili: ["bilibili.com", "b23.tv"],
  douyin: ["douyin.com", "iesdouyin.com"],
  xiaohongshu: ["xiaohongshu.com", "xhslink.com", "xhslink.cn"],
};

const TRAILING_JUNK = /[)\]}>，。！？；：、'"“”‘’…]+$/u;

function cleanUrl(raw) {
  return raw.replace(TRAILING_JUNK, "").trim();
}

function detectPlatform(urlString) {
  try {
    const hostname = new URL(urlString).hostname.replace(/^www\./, "");
    for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS)) {
      if (hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
        return platform;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extract the first supported video URL from messy share text.
 */
export function extractVideoUrl(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const normalized = text.trim();
  const candidates = new Set();

  const explicitUrls = normalized.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/giu) || [];
  for (const raw of explicitUrls) {
    candidates.add(cleanUrl(raw));
  }

  const bareHosts = normalized.match(
    /(?:https?:\/\/)?(?:v\.douyin\.com|www\.douyin\.com|www\.bilibili\.com|b23\.tv|www\.xiaohongshu\.com|xhslink\.com)\/[^\s<>"{}|\\^`[\]]+/giu
  ) || [];
  for (const raw of bareHosts) {
    const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
    candidates.add(cleanUrl(withScheme));
  }

  for (const candidate of candidates) {
    const platform = detectPlatform(candidate);
    if (platform) {
      return { url: candidate, platform };
    }
  }

  return null;
}
