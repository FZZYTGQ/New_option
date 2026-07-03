export const BIBIGPT_TIMEOUT_MS = 3 * 60 * 1000;
export const DEEPSEEK_TIMEOUT_MS = 3 * 60 * 1000;

export async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
