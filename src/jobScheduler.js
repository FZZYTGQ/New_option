import { tryPromoteQueuedJob } from "./db.js";

export function getJobSecret(env) {
  return env.INTERNAL_JOB_SECRET || env.ADMIN_PASSWORD;
}

export function scheduleJobRun(request, env, historyId) {
  const secret = getJobSecret(env);
  if (!secret) {
    return Promise.reject(
      new Error("任务密钥未配置，请设置 INTERNAL_JOB_SECRET 或 ADMIN_PASSWORD")
    );
  }

  const url = new URL(`/api/jobs/${historyId}/run`, request.url);
  return fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
}

export async function promoteAndSchedule(request, env, userId) {
  const nextId = await tryPromoteQueuedJob(env, userId);
  if (!nextId) {
    return null;
  }

  await scheduleJobRun(request, env, nextId);
  return nextId;
}
