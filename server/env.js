import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { D1Database } from "./d1.js";
import { createAssetsBinding } from "./assets.js";
import { FileKvNamespace } from "./kv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadEnvFile() {
  dotenv.config({ path: path.join(__dirname, ".env") });
}

export function createRuntimeEnv() {
  loadEnvFile();

  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(__dirname, "data", "new-option.sqlite");
  const kvDir =
    process.env.SHARES_KV_PATH || path.join(__dirname, "data", "shares-kv");

  const required = [
    "BIBIGPT_API_TOKEN",
    "DEEPSEEK_API_KEY",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.warn(
      `[warn] 缺少环境变量：${missing.join("、")}（可先启动，但提取/管理员初始化会失败）`
    );
  }

  const env = {
    DB: new D1Database(dbPath),
    ASSETS: createAssetsBinding(),
    SHARES: new FileKvNamespace(kvDir),
    BIBIGPT_API_TOKEN: process.env.BIBIGPT_API_TOKEN || "",
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
    INTERNAL_JOB_SECRET:
      process.env.INTERNAL_JOB_SECRET || process.env.ADMIN_PASSWORD || "",
    RUNTIME: "node",
  };

  return { env, dbPath };
}

export function createExecutionContext() {
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch((error) => {
        console.error("[waitUntil]", error);
      });
    },
    passThroughOnException() {},
  };
}
