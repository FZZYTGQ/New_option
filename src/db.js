export const MAX_DURATION_SECONDS = 30 * 60;
export const DEFAULT_QUOTA_MINUTES = 30;

export function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function chargeMinutes(durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

export async function insertHistory(env, record) {
  await env.DB.prepare(
    `INSERT INTO history (
      id, user_id, platform, video_url, title, author, duration_seconds,
      minutes_charged, transcript, summary, status, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      record.id,
      record.user_id,
      record.platform,
      record.video_url,
      record.title,
      record.author,
      record.duration_seconds,
      record.minutes_charged,
      record.transcript,
      record.summary,
      record.status,
      record.error_message,
      record.created_at
    )
    .run();
}

export async function insertUsageLog(env, log) {
  await env.DB.prepare(
    `INSERT INTO usage_logs (
      id, user_id, history_id, minutes_charged, action, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      log.id,
      log.user_id,
      log.history_id,
      log.minutes_charged,
      log.action,
      log.note,
      log.created_at
    )
    .run();
}

export async function chargeUserQuota(env, userId, minutes, historyId) {
  const timestamp = nowIso();
  await env.DB.prepare(
    "UPDATE users SET quota_minutes = quota_minutes - ?, used_minutes = used_minutes + ?, updated_at = ? WHERE id = ?"
  )
    .bind(minutes, minutes, timestamp, userId)
    .run();

  await insertUsageLog(env, {
    id: createId(),
    user_id: userId,
    history_id: historyId,
    minutes_charged: minutes,
    action: "charge",
    note: null,
    created_at: timestamp,
  });
}
