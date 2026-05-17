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
  cachedDb = db;
  return db;
}

function applySchema(db, sql) {
  db["exec"](sql);
}

export function closeDb() {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
}
