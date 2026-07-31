import { failureMessage } from "./errorMessage.js";

export const BIBIGPT_TIMEOUT_MS = 3 * 60 * 1000;
export const DEEPSEEK_TIMEOUT_MS = 3 * 60 * 1000;

export async function fetchWithTimeout(url, options = {}, timeoutMs, serviceLabel = "上游服务") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const seconds = Math.round(timeoutMs / 1000);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        failureMessage({
          stage: `本站服务器 → ${serviceLabel}`,
          problem: "请求超时",
          detail: `${seconds} 秒内未收到 ${serviceLabel} 响应`,
          tip: "可能是该服务繁忙或链路不稳，请稍后重试；与你手机流量无关（此请求由本站服务器发出）",
        })
      );
    }

    throw new Error(
      failureMessage({
        stage: `本站服务器 → ${serviceLabel}`,
        problem: "网络连接失败",
        detail: error?.message || "连接失败",
        tip: `本站服务器暂时连不上 ${serviceLabel}，请稍后重试或检查该服务是否可用`,
      })
    );
  } finally {
    clearTimeout(timer);
  }
}
