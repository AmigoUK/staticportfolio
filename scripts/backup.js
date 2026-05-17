#!/usr/bin/env node
/**
 * Hot backup for the Portfolio CMS.
 *
 *   - DB:       SQLite online-backup API (consistent snapshot, no app downtime)
 *   - Uploads:  rsync mirror with --delete
 *   - Retention: keeps the last RETAIN_DAYS daily DB snapshots, prunes older.
 *
 * Env vars:
 *   DB_PATH         (default ./data/portfolio.db)
 *   UPLOADS_DIR     (default ./uploads)
 *   BACKUP_DIR      (default /var/backups/portfolio-cms)
 *   RETAIN_DAYS     (default 14)
 *
 * Run:
 *   npm run backup
 * or via the systemd timer in deploy/portfolio-cms-backup.{service,timer}.
 */
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(process.env.DB_PATH || join(REPO_ROOT, "data", "portfolio.db"));
const UPLOADS = resolve(process.env.UPLOADS_DIR || join(REPO_ROOT, "uploads"));
const BACKUP_DIR = resolve(process.env.BACKUP_DIR || "/var/backups/portfolio-cms");
const RETAIN_DAYS = Number(process.env.RETAIN_DAYS || 14);

const stamp = new Date().toISOString().slice(0, 10);
const uploadsDest = join(BACKUP_DIR, "uploads");

async function backupDb() {
  if (!existsSync(DB_PATH)) {
    console.warn(`skip db: ${DB_PATH} not found`);
    return null;
  }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = join(BACKUP_DIR, `portfolio-${stamp}.db`);
  const db = new Database(DB_PATH, { readonly: true });
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }
  const bytes = statSync(dest).size;
  console.log(`db -> ${dest} (${(bytes / 1024).toFixed(1)} KB)`);
  return dest;
}

function backupUploads() {
  if (!existsSync(UPLOADS)) {
    console.warn(`skip uploads: ${UPLOADS} not found`);
    return;
  }
  mkdirSync(uploadsDest, { recursive: true });
  const r = spawnSync("rsync", ["-a", "--delete", `${UPLOADS}/`, `${uploadsDest}/`], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    throw new Error(`rsync failed with exit code ${r.status}`);
  }
  console.log(`uploads -> ${uploadsDest}`);
}

function prune() {
  if (!existsSync(BACKUP_DIR)) return;
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!/^portfolio-\d{4}-\d{2}-\d{2}\.db$/.test(name)) continue;
    const path = join(BACKUP_DIR, name);
    if (statSync(path).mtimeMs < cutoff) {
      unlinkSync(path);
      console.log(`pruned ${path}`);
      pruned++;
    }
  }
  if (pruned === 0) console.log(`no snapshots older than ${RETAIN_DAYS} days`);
}

async function main() {
  console.log(`backup started @ ${new Date().toISOString()}`);
  console.log(`  source: ${DB_PATH}`);
  console.log(`  uploads: ${UPLOADS}`);
  console.log(`  dest: ${BACKUP_DIR}`);
  await backupDb();
  backupUploads();
  prune();
  console.log(`backup complete`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
