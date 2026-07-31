export const MAX_DURATION_SECONDS = 30 * 60;
export const DEFAULT_QUOTA_MINUTES = 30;
export const MAX_CONCURRENT_JOBS = 3;
export const JOB_TIMEOUT_MINUTES = 5;
export const JOB_HEARTBEAT_INTERVAL_MS = 30 * 1000;

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
  const updatedAt = record.updated_at || record.created_at;
  await env.DB.prepare(
    `INSERT INTO history (
      id, user_id, platform, video_url, title, author, duration_seconds,
      minutes_charged, transcript, summary, status, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      record.created_at,
      updatedAt
    )
    .run();
}

export async function updateHistory(env, historyId, fields) {
  const columnMap = {
    platform: "platform",
    title: "title",
    author: "author",
    duration_seconds: "duration_seconds",
    minutes_charged: "minutes_charged",
    transcript: "transcript",
    summary: "summary",
    status: "status",
    error_message: "error_message",
  };

  const sets = ["updated_at = ?"];
  const values = [nowIso()];

  for (const [key, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = ?`);
      values.push(fields[key]);
    }
  }

  values.push(historyId);
  await env.DB.prepare(`UPDATE history SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function countActiveJobs(env, userId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM history
     WHERE user_id = ? AND status IN ('processing', 'queued')`
  )
    .bind(userId)
    .first();
  return row?.count || 0;
}

export async function countProcessingJobs(env, userId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM history WHERE user_id = ? AND status = 'processing'`
  )
    .bind(userId)
    .first();
  return row?.count || 0;
}

export async function tryPromoteQueuedJob(env, userId) {
  const processing = await countProcessingJobs(env, userId);
  if (processing >= MAX_CONCURRENT_JOBS) {
    return null;
  }

  const next = await env.DB.prepare(
    `SELECT id FROM history
     WHERE user_id = ? AND status = 'queued'
     ORDER BY created_at ASC
     LIMIT 1`
  )
    .bind(userId)
    .first();

  if (!next) {
    return null;
  }

  const timestamp = nowIso();
  const result = await env.DB.prepare(
    `UPDATE history SET status = 'processing', updated_at = ?
     WHERE id = ? AND status = 'queued'`
  )
    .bind(timestamp, next.id)
    .run();

  if (!result.meta?.changes) {
    return null;
  }

  return next.id;
}

export async function touchHistoryHeartbeat(env, historyId) {
  await env.DB.prepare(
    "UPDATE history SET updated_at = ? WHERE id = ? AND status = 'processing'"
  )
    .bind(nowIso(), historyId)
    .run();
}

export async function expireStuckJobs(env, userId) {
  const cutoff = new Date(Date.now() - JOB_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const timeoutMessage = [
    "【环节】后台任务执行",
    "【问题】处理超时",
    `【详情】超过 ${JOB_TIMEOUT_MINUTES} 分钟无进度更新，任务已被标记失败`,
    "【建议】请重新提交；若多次超时，可能是 BibiGPT/DeepSeek 过慢或任务卡住",
  ].join("\n");
  await env.DB.prepare(
    `UPDATE history SET status = 'failed', error_message = ?, updated_at = ?
     WHERE user_id = ? AND status = 'processing' AND updated_at < ?`
  )
    .bind(timeoutMessage, nowIso(), userId, cutoff)
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

export async function getUserQuota(env, userId) {
  const row = await env.DB.prepare(
    "SELECT quota_minutes FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();
  return row?.quota_minutes ?? 0;
}

export async function getHistoryById(env, historyId, userId) {
  return env.DB.prepare(
    `SELECT id, user_id, platform, video_url, title, author, duration_seconds,
            minutes_charged, transcript, summary, status, error_message, created_at, updated_at
     FROM history WHERE id = ? AND user_id = ?`
  )
    .bind(historyId, userId)
    .first();
}
