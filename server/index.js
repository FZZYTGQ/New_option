import http from "node:http";
import { createRuntimeEnv, createExecutionContext } from "./env.js";
import worker from "../src/index.js";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

const { env, dbPath } = createRuntimeEnv();

// 自调用 Worker 绑定：替代 Cloudflare service binding，后台任务不绑在用户手机请求上
env.WORKER = {
  fetch(request) {
    return worker.fetch(request, env, createExecutionContext());
  },
};

async function toWebRequest(req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const url = `http://${host}${req.url}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method || "GET";
  const canHaveBody = method !== "GET" && method !== "HEAD";

  if (!canHaveBody) {
    return new Request(url, { method, headers });
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  return new Request(url, {
    method,
    headers,
    body: body.length ? body : undefined,
  });
}

async function sendResponse(res, response) {
  res.statusCode = response.status;
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
  ]);

  response.headers.forEach((value, key) => {
    if (hopByHop.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

const server = http.createServer(async (req, res) => {
  try {
    const request = await toWebRequest(req);
    const response = await worker.fetch(request, env, createExecutionContext());
    await sendResponse(res, response);
  } catch (error) {
    console.error("[request error]", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("服务器内部错误");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`New Option (Node) listening on http://${HOST}:${PORT}`);
  console.log(`SQLite: ${dbPath}`);
  console.log(`Runtime: node (Tencent / self-hosted)`);
});

function shutdown(signal) {
  console.log(`received ${signal}, shutting down...`);
  server.close(() => {
    try {
      env.DB.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
