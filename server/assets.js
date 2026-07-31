import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function safeResolve(urlPathname) {
  let pathname = decodeURIComponent(urlPathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const resolved = path.resolve(PUBLIC_DIR, "." + pathname);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    return null;
  }
  return resolved;
}

export function createAssetsBinding() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const filePath = safeResolve(url.pathname);
      if (!filePath) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const data = await fs.readFile(filePath);
        return new Response(data, {
          headers: {
            "Content-Type": contentTypeFor(filePath),
            "Cache-Control": url.pathname.startsWith("/api/")
              ? "no-store"
              : "public, max-age=300",
          },
        });
      } catch {
        return new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    },
  };
}
