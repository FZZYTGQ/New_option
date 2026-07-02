const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100000;

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt);
  return `pbkdf2$${toBase64(salt)}$${toBase64(hash)}`;
}

async function derivePasswordHash(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return new Uint8Array(derived);
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltBase64, hashBase64] = storedHash.split("$");
  if (algorithm !== "pbkdf2" || !saltBase64 || !hashBase64) {
    return false;
  }

  const salt = fromBase64(saltBase64);
  const expected = fromBase64(hashBase64);
  const actual = await derivePasswordHash(password, salt);

  if (actual.length !== expected.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

export function createSessionId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] || null;
}

export function buildSessionCookie(sessionId, secure) {
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearSessionCookie(secure) {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function getUserFromRequest(request, env) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return null;
  }

  const session = await env.DB.prepare(
    "SELECT s.id, s.user_id, s.expires_at, u.id as uid, u.email, u.quota_minutes, u.used_minutes, u.status, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"
  )
    .bind(sessionId)
    .first();

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }

  return {
    id: session.uid,
    email: session.email,
    quota_minutes: session.quota_minutes,
    used_minutes: session.used_minutes,
    status: session.status,
    role: session.role,
    sessionId: session.id,
  };
}

export function isSecureRequest(request) {
  const url = new URL(request.url);
  return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
}
