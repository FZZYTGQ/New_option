import { jsonResponse } from "../http.js";
import { requireUser } from "../middleware.js";
import { deleteHistory, expireStuckJobs } from "../db.js";
import { promoteAndSchedule } from "../jobScheduler.js";

export async function handleHistoryList(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) {
    return auth.error;
  }

  await expireStuckJobs(env, auth.user.id);
  try {
    await promoteAndSchedule(request, env, auth.user.id);
  } catch (error) {
    console.error("Failed to promote queued job:", error);
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Number(limitParam) || 100, 100) : 100;

  const rows = await env.DB.prepare(
    `SELECT id, platform, video_url, title, author, duration_seconds, minutes_charged, status, error_message, created_at, updated_at
     FROM history
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(auth.user.id, limit)
    .all();

  return jsonResponse({
    success: true,
    data: rows.results || [],
  });
}

export async function handleHistoryDetail(request, env, historyId) {
  const auth = await requireUser(request, env);
  if (auth.error) {
    return auth.error;
  }

  const row = await env.DB.prepare(
    `SELECT id, platform, video_url, title, author, duration_seconds, minutes_charged,
            transcript, summary, status, error_message, created_at, updated_at
     FROM history
     WHERE id = ? AND user_id = ?`
  )
    .bind(historyId, auth.user.id)
    .first();

  if (!row) {
    return jsonResponse({ success: false, error: "记录不存在" }, 404);
  }

  return jsonResponse({
    success: true,
    data: row,
  });
}

export async function handleHistoryDelete(request, env, historyId) {
  const auth = await requireUser(request, env);
  if (auth.error) {
    return auth.error;
  }

  const result = await deleteHistory(env, historyId, auth.user.id);
  if (result.reason === "not_found") {
    return jsonResponse({ success: false, error: "记录不存在" }, 404);
  }
  if (result.reason === "processing") {
    return jsonResponse({ success: false, error: "任务处理中，完成后再删除" }, 409);
  }

  return jsonResponse({ success: true });
}
