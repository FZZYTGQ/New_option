import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function normalizeParams(params) {
  return params.map((value) => (value === undefined ? null : value));
}

class D1PreparedStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = normalizeParams(params);
    return this;
  }

  async first(columnName) {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params);
    if (!row) {
      return null;
    }
    if (columnName) {
      return row[columnName] ?? null;
    }
    return row;
  }

  async run() {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }

  async all() {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.params);
    return {
      success: true,
      results,
      meta: {
        changes: 0,
      },
    };
  }
}

export class D1Database {
  constructor(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  prepare(sql) {
    return new D1PreparedStatement(this.db, sql);
  }

  exec(sql) {
    this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}
