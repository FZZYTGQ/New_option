import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { D1Database } from "./d1.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(__dirname, ".env") });

const dbPath =
  process.env.DATABASE_PATH || path.join(__dirname, "data", "new-option.sqlite");
const migrationsDir = path.join(ROOT, "migrations");

const db = new D1Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const applied = new Set(
  db.db
    .prepare("SELECT id FROM _migrations")
    .all()
    .map((row) => row.id)
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip ${file}`);
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  console.log(`apply ${file}`);
  db.exec(sql);
  db.db
    .prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)")
    .run(file, new Date().toISOString());
}

db.close();
console.log(`migrations done -> ${dbPath}`);
