import fs from "node:fs";
import path from "node:path";

/**
 * 简易文件 KV，兼容 Cloudflare KV 的 get/put（含 expirationTtl）。
 * 分享功能可选；没有也会正常运行。
 */
export class FileKvNamespace {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  #pathFor(key) {
    const safe = Buffer.from(key).toString("base64url");
    return path.join(this.dir, `${safe}.json`);
  }

  async get(key) {
    const filePath = this.#pathFor(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        fs.unlinkSync(filePath);
        return null;
      }
      return parsed.value;
    } catch {
      return null;
    }
  }

  async put(key, value, options = {}) {
    const expiresAt = options.expirationTtl
      ? Date.now() + Number(options.expirationTtl) * 1000
      : null;
    const filePath = this.#pathFor(key);
    fs.writeFileSync(
      filePath,
      JSON.stringify({ value, expiresAt }),
      "utf8"
    );
  }
}
