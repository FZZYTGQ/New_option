import { tryPromoteQueuedJob } from "./db.js";

const JOB_SECRET_HEADER = "X-Job-Secret";

export function getJobSecret(env) {
  return env.INTERNAL_JOB_SECRET || env.ADMIN_PASSWORD;
}

export function buildJobRunRequest(request, env, historyId) {
  const secret = getJobSecret(env);
  if (!secret) {
    throw new Error("任务密钥未配置，请设置 ADMIN_PASSWORD（或 INTERNAL_JOB_SECRET）");
  }

  const url = new URL(`/api/jobs/${historyId}/run`, request.url);
  return new Request(url.toString(), {
    method: "POST",
    headers: {
      [JOB_SECRET_HEADER]: secret,
    },
  });
}

export function scheduleJobRun(request, env, historyId) {
  const jobRequest = buildJobRunRequest(request, env, historyId);
  if (env.WORKER) {
    return env.WORKER.fetch(jobRequest);
  }
  return fetch(jobRequest);
}

export function isValidJobSecret(request, env) {
  const secret = getJobSecret(env);
  const provided = request.headers.get(JOB_SECRET_HEADER);
  return Boolean(secret && provided && provided === secret);
}

export async function promoteAndSchedule(request, env, userId) {
  const nextId = await tryPromoteQueuedJob(env, userId);
  if (!nextId) {
    return null;
  }

  await scheduleJobRun(request, env, nextId);
  return nextId;
}
