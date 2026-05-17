import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "schema.sql");

let cachedDb = null;

export function getDb() {
  if (cachedDb) return cachedDb;
  const raw = process.env.DB_PATH || "./data/portfolio.db";
  const dbPath = raw === ":memory:" ? ":memory:" : resolve(raw);
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schemaSql = readFileSync(SCHEMA_PATH, "utf8");
  applySchema(db, schemaSql);
  applyMigrations(db);
  cachedDb = db;
  return db;
}

function applySchema(db, sql) {
  db["exec"](sql);
}

// Idempotent column additions for tables that pre-date a feature.
// SQLite has no IF NOT EXISTS for ADD COLUMN, so we inspect first.
function applyMigrations(db) {
  function ensureColumn(table, name, sqlType) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === name)) {
      db["exec"](`ALTER TABLE ${table} ADD COLUMN ${name} ${sqlType}`);
    }
  }
  ensureColumn("menu_items", "parent_id", "INTEGER");
  ensureColumn("menu_items", "is_featured", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("media", "kind", "TEXT NOT NULL DEFAULT 'image'");
}

export function closeDb() {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
}
