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
  ensureColumn("pages", "published_at", "TEXT");
  widenFontsSourceCheck(db);
  widenFontsRoleCheck(db);
  renameWritingMenuToBlog(db);
}

function renameWritingMenuToBlog(db) {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='menu_items'").get();
  if (!tbl) return;
  db.prepare(
    "UPDATE menu_items SET label = 'Blog', href = 'blog/', updated_at = CURRENT_TIMESTAMP " +
      "WHERE label = 'Writing' AND href = 'writing/'",
  ).run();
}

// SQLite has no DROP CONSTRAINT; widening a CHECK means recreating the
// table. Detect the narrow constraint via sqlite_master.sql and rebuild
// only if it's the old shape.
function widenFontsSourceCheck(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fonts'").get();
  if (!row || !row.sql) return;
  if (row.sql.includes("'custom'")) return; // already widened
  if (!/CHECK\s*\(\s*source\s+IN\s*\(\s*['"]bundled['"]\s*,\s*['"]system['"]\s*\)\s*\)/i.test(row.sql)) return;
  db["exec"](
    "BEGIN;" +
      "CREATE TABLE fonts_new (" +
      "  id INTEGER PRIMARY KEY," +
      "  family TEXT NOT NULL," +
      "  role TEXT NOT NULL CHECK(role IN ('sans','mono'))," +
      "  weights_csv TEXT NOT NULL," +
      "  source TEXT NOT NULL CHECK(source IN ('bundled','system','custom'))," +
      "  files_json TEXT," +
      "  fallback_stack TEXT," +
      "  is_active INTEGER NOT NULL DEFAULT 0," +
      "  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  UNIQUE(family, role)" +
      ");" +
      "INSERT INTO fonts_new SELECT id, family, role, weights_csv, source, files_json, fallback_stack, is_active, created_at FROM fonts;" +
      "DROP TABLE fonts;" +
      "ALTER TABLE fonts_new RENAME TO fonts;" +
      "COMMIT;",
  );
}

// Same pattern as widenFontsSourceCheck — but widening the role CHECK to
// allow the new 'header' value. Idempotent: bails out if the new CHECK is
// already present in sqlite_master.sql.
function widenFontsRoleCheck(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fonts'").get();
  if (!row || !row.sql) return;
  if (row.sql.includes("'header'")) return; // already widened
  if (!/CHECK\s*\(\s*role\s+IN\s*\(\s*['"]sans['"]\s*,\s*['"]mono['"]\s*\)\s*\)/i.test(row.sql)) return;
  db["exec"](
    "BEGIN;" +
      "CREATE TABLE fonts_new (" +
      "  id INTEGER PRIMARY KEY," +
      "  family TEXT NOT NULL," +
      "  role TEXT NOT NULL CHECK(role IN ('sans','mono','header'))," +
      "  weights_csv TEXT NOT NULL," +
      "  source TEXT NOT NULL CHECK(source IN ('bundled','system','custom'))," +
      "  files_json TEXT," +
      "  fallback_stack TEXT," +
      "  is_active INTEGER NOT NULL DEFAULT 0," +
      "  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  UNIQUE(family, role)" +
      ");" +
      "INSERT INTO fonts_new SELECT id, family, role, weights_csv, source, files_json, fallback_stack, is_active, created_at FROM fonts;" +
      "DROP TABLE fonts;" +
      "ALTER TABLE fonts_new RENAME TO fonts;" +
      "COMMIT;",
  );
}

export function closeDb() {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
}
