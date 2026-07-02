import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionId,
  getUserFromRequest,
  hashPassword,
  isSecureRequest,
  verifyPassword,
} from "../auth.js";
import { createId, nowIso } from "../db.js";
import { jsonResponse } from "../http.js";

export async function handleLogin(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "请求体必须是 JSON" }, 400);
  }

  const email = payload.email?.trim().toLowerCase();
  const password = payload.password || "";

  if (!email || !password) {
    return jsonResponse({ success: false, error: "请输入邮箱和密码" }, 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, email, password_hash, status, role FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!user) {
    return jsonResponse({ success: false, error: "邮箱或密码错误" }, 401);
  }

  if (user.status !== "active") {
    return jsonResponse({ success: false, error: "账号已停用，请联系管理员" }, 403);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return jsonResponse({ success: false, error: "邮箱或密码错误" }, 401);
  }

  const sessionId = createSessionId();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(sessionId, user.id, expiresAt, createdAt)
    .run();

  return jsonResponse(
    {
      success: true,
      data: {
        email: user.email,
        role: user.role,
      },
    },
    200,
    {
      "Set-Cookie": buildSessionCookie(sessionId, isSecureRequest(request)),
    }
  );
}

export async function handleLogout(request) {
  return jsonResponse(
    { success: true },
    200,
    {
      "Set-Cookie": buildClearSessionCookie(isSecureRequest(request)),
    }
  );
}

export async function handleMe(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ success: true, data: { loggedIn: false } });
  }

  return jsonResponse({
    success: true,
    data: {
      loggedIn: true,
      email: user.email,
      role: user.role,
    },
  });
}

export async function hashPasswordForSeed(password) {
  return hashPassword(password);
}

export { createId };
