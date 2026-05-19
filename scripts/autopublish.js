#!/usr/bin/env node
/**
 * Auto-publish for scheduled content.
 *
 * Triggered by portfolio-cms-autopublish.timer every 5 minutes. Re-runs
 * publish() only when a row's published_at has passed AND is newer than the
 * last successful publish — otherwise exits silently so the static site isn't
 * regenerated for nothing.
 *
 * Manual invocation:
 *   sudo systemctl start portfolio-cms-autopublish.service
 *   journalctl -u portfolio-cms-autopublish -n 50 --no-pager
 */
import { publish } from "../app/src/services/publish.js";
import { getDb, closeDb } from "../app/src/db/connect.js";

const SCHEDULED_TABLES = ["pages", "posts", "work_entries"];

// Historical publish_log rows were written via SQLite's CURRENT_TIMESTAMP
// ("YYYY-MM-DD HH:MM:SS" UTC, no T, no Z). New rows write ISO 8601. Normalize
// to ISO so the lex-compare against published_at (always ISO) is sound — 'T'
// > ' ' would otherwise make a same-instant SQLite-format value look smaller
// than any ISO value and spuriously trigger an autopublish.
function toIsoUtc(value) {
  if (!value) return null;
  if (value.includes("T")) return value;
  return value.replace(" ", "T") + "Z";
}

async function main() {
  const db = getDb();
  const now = new Date().toISOString();
  const lastOkRow = db
    .prepare("SELECT MAX(finished_at) AS at FROM publish_log WHERE status = 'ok'")
    .get();
  const lastOk = toIsoUtc(lastOkRow && lastOkRow.at);

  let dueCount = 0;
  for (const table of SCHEDULED_TABLES) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE published = 1 ` +
          `AND published_at IS NOT NULL AND published_at <= @now ` +
          `AND (@lastOk IS NULL OR published_at > @lastOk)`,
      )
      .get({ now, lastOk });
    dueCount += row.n;
  }

  if (dueCount === 0) {
    console.log(`autopublish: nothing due (last_ok=${lastOk || "never"}); skip`);
    closeDb();
    return;
  }

  console.log(`autopublish: ${dueCount} scheduled row(s) due since ${lastOk || "never"}; running publish`);
  const result = await publish({ logger: console });
  console.log(
    `autopublish: published ${result.pagesWritten} pages, ${result.fontsCopied} fonts, ` +
      `${result.mediaCopied} media files, ${result.webpMade ?? 0} new webp variants.`,
  );
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
