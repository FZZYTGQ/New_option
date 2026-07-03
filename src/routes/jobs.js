import { countProcessingJobs } from "../db.js";
import { jsonResponse } from "../http.js";
import { getJobSecret, promoteAndSchedule } from "../jobScheduler.js";
import { runExtractJob } from "./extract.js";

export async function handleJobRun(request, env, ctx, historyId) {
  const secret = getJobSecret(env);
  const authHeader = request.headers.get("Authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const record = await env.DB.prepare(
    "SELECT user_id, status FROM history WHERE id = ?"
  )
    .bind(historyId)
    .first();

  if (!record) {
    return jsonResponse({ success: false, error: "记录不存在" }, 404);
  }

  if (record.status !== "processing") {
    return jsonResponse({ success: true, data: { skipped: true } });
  }

  try {
    await runExtractJob(env, historyId, record.user_id);
  } catch (error) {
    console.error(`Job ${historyId} failed:`, error);
  }

  const processingCount = await countProcessingJobs(env, record.user_id);
  if (processingCount < 3) {
    await promoteAndSchedule(request, env, record.user_id, ctx);
  }

  return jsonResponse({ success: true });
}
