import {
  buildSessionCookie,
  createSessionId,
  hashPassword,
  isSecureRequest,
} from "../auth.js";
import {
  createId,
  DEFAULT_QUOTA_MINUTES,
  insertUsageLog,
  nowIso,
} from "../db.js";
import { jsonResponse } from "../http.js";
import { requireAdmin } from "../middleware.js";

export async function handleAdminStats(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) {
    return auth.error;
  }

  const [users, todayHistory, todayMinutes, totalUsed] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM history WHERE date(created_at) = date('now')"
    ).first(),
    env.DB.prepare(
      "SELECT COALESCE(SUM(minutes_charged), 0) AS total FROM history WHERE date(created_at) = date('now')"
    ).first(),
    env.DB.prepare("SELECT COALESCE(SUM(used_minutes), 0) AS total FROM users").first(),
  ]);

  const recent = await env.DB.prepare(
    `SELECT h.created_at, u.email, h.platform, h.title, h.minutes_charged, h.status
     FROM history h
     JOIN users u ON u.id = h.user_id
     ORDER BY h.created_at DESC
     LIMIT 10`
  ).all();

  return jsonResponse({
    success: true,
    data: {
      totalUsers: users?.count || 0,
      todayExtracts: todayHistory?.count || 0,
      todayMinutes: todayMinutes?.total || 0,
      totalUsedMinutes: totalUsed?.total || 0,
      recent: recent.results || [],
    },
  });
}

export async function handleAdminUsers(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) {
    return auth.error;
  }

  const rows = await env.DB.prepare(
    `SELECT id, email, quota_minutes, used_minutes, status, role, created_at
     FROM users
     ORDER BY created_at DESC`
  ).all();

  return jsonResponse({
    success: true,
    data: rows.results || [],
  });
}

export async function handleAdminCreateUser(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) {
    return auth.error;
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "请求体必须是 JSON" }, 400);
  }

  const email = payload.email?.trim().toLowerCase();
  const password = payload.password || "";
  const quotaMinutes = Number(payload.quotaMinutes) || DEFAULT_QUOTA_MINUTES;

  if (!email || !password) {
    return jsonResponse({ success: false, error: "请填写邮箱和初始密码" }, 400);
  }

  if (password.length < 6) {
    return jsonResponse({ success: false, error: "密码至少 6 位" }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) {
    return jsonResponse({ success: false, error: "该邮箱已存在" }, 400);
  }

  const userId = createId();
  const timestamp = nowIso();
  const passwordHash = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users (
      id, email, password_hash, quota_minutes, used_minutes, status, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 'active', 'user', ?, ?)`
  )
    .bind(userId, email, passwordHash, quotaMinutes, timestamp, timestamp)
    .run();

  await insertUsageLog(env, {
    id: createId(),
    user_id: userId,
    history_id: null,
    minutes_charged: quotaMinutes,
    action: "admin_grant",
    note: "创建账号初始额度",
    created_at: timestamp,
  });

  return jsonResponse({
    success: true,
    data: {
      id: userId,
      email,
      quota_minutes: quotaMinutes,
    },
  });
}

export async function handleAdminPatchUser(request, env, userId) {
  const auth = await requireAdmin(request, env);
  if (auth.error) {
    return auth.error;
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "请求体必须是 JSON" }, 400);
  }

  const user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?")
    .bind(userId)
    .first();
  if (!user) {
    return jsonResponse({ success: false, error: "用户不存在" }, 404);
  }

  const timestamp = nowIso();

  if (typeof payload.addQuota === "number" && payload.addQuota > 0) {
    await env.DB.prepare(
      "UPDATE users SET quota_minutes = quota_minutes + ?, updated_at = ? WHERE id = ?"
    )
      .bind(payload.addQuota, timestamp, userId)
      .run();

    await insertUsageLog(env, {
      id: createId(),
      user_id: userId,
      history_id: null,
      minutes_charged: payload.addQuota,
      action: "admin_grant",
      note: `管理员增加 ${payload.addQuota} 分钟`,
      created_at: timestamp,
    });
  }

  if (payload.status === "active" || payload.status === "disabled") {
    await env.DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
      .bind(payload.status, timestamp, userId)
      .run();
  }

  const updated = await env.DB.prepare(
    "SELECT id, email, quota_minutes, used_minutes, status, role, created_at FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();

  return jsonResponse({
    success: true,
    data: updated,
  });
}

export async function handleAdminHistory(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();

  let rows;
  if (email) {
    rows = await env.DB.prepare(
      `SELECT h.id, h.created_at, u.email, h.platform, h.title, h.duration_seconds,
              h.minutes_charged, h.status, h.error_message
       FROM history h
       JOIN users u ON u.id = h.user_id
       WHERE u.email = ?
       ORDER BY h.created_at DESC
       LIMIT 200`
    )
      .bind(email)
      .all();
  } else {
    rows = await env.DB.prepare(
      `SELECT h.id, h.created_at, u.email, h.platform, h.title, h.duration_seconds,
              h.minutes_charged, h.status, h.error_message
       FROM history h
       JOIN users u ON u.id = h.user_id
       ORDER BY h.created_at DESC
       LIMIT 200`
    ).all();
  }

  return jsonResponse({
    success: true,
    data: rows.results || [],
  });
}

export async function ensureAdminUser(env, request) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    return;
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) {
    return;
  }

  const userId = createId();
  const timestamp = nowIso();
  const passwordHash = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users (
      id, email, password_hash, quota_minutes, used_minutes, status, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 'active', 'admin', ?, ?)`
  )
    .bind(userId, email, passwordHash, DEFAULT_QUOTA_MINUTES, timestamp, timestamp)
    .run();
}
