const SHARE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function generateShareId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function saveShare(env, data) {
  if (!env.SHARES) {
    return null;
  }

  const shareId = generateShareId();
  await env.SHARES.put(`share:${shareId}`, JSON.stringify(data), {
    expirationTtl: SHARE_TTL_SECONDS,
  });
  return shareId;
}

export async function getShare(env, shareId) {
  if (!env.SHARES || !shareId) {
    return null;
  }

  const raw = await env.SHARES.get(`share:${shareId}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
