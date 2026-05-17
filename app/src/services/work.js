import { getDb } from "../db/connect.js";
import { sanitize, wrapBodyJson } from "./sanitize.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$/;

export function listWork() {
  const db = getDb();
  return db
    .prepare(
      "SELECT w.*, m.filename AS cover_media_filename, m.alt AS cover_media_alt " +
        "FROM work_entries w LEFT JOIN media m ON w.cover_media_id = m.id " +
        "ORDER BY sort_order, id",
    )
    .all();
}

export function getWorkById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM work_entries WHERE id = ?").get(Number(id)) || null;
}

function validateSlug(slug) {
  if (!SLUG_RE.test(String(slug || ""))) {
    const e = new Error("Slug must be kebab-case alphanumerics (2–82 chars).");
    e.code = "BAD_SLUG";
    throw e;
  }
}

export function createWork(input) {
  validateSlug(input.slug);
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM work_entries WHERE slug = ?").get(input.slug);
  if (exists) {
    const e = new Error("A work entry with this slug already exists.");
    e.code = "DUP_SLUG";
    throw e;
  }
  const bodyHtml = sanitize(input.body_html || "");
  const articleMeta = sanitize(input.article_meta || "");
  const nextSort = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM work_entries").get().n);
  const info = db
    .prepare(
      "INSERT INTO work_entries (slug, title, kicker, eyebrow, lede, article_meta, body_json, body_html, " +
        "cover_media_id, cover_filename, cover_alt, tags_csv, sort_order, is_disabled, meta_description, " +
        "published, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.slug,
      String(input.title || "").slice(0, 200),
      String(input.kicker || "").slice(0, 100),
      String(input.eyebrow || "").slice(0, 100),
      String(input.lede || "").slice(0, 500),
      articleMeta,
      wrapBodyJson(bodyHtml),
      bodyHtml,
      input.cover_media_id ? Number(input.cover_media_id) : null,
      input.cover_filename || null,
      String(input.cover_alt || "").slice(0, 500) || null,
      String(input.tags_csv || "").slice(0, 200),
      Number(input.sort_order ?? nextSort),
      input.is_disabled ? 1 : 0,
      String(input.meta_description || "").slice(0, 500),
      input.published ? 1 : 0,
      input.published_at || null,
    );
  return getWorkById(info.lastInsertRowid);
}

export function updateWork(id, input) {
  const existing = getWorkById(id);
  if (!existing) return null;
  if (input.slug && input.slug !== existing.slug) validateSlug(input.slug);
  const slug = input.slug || existing.slug;
  if (slug !== existing.slug) {
    const db = getDb();
    const clash = db.prepare("SELECT 1 FROM work_entries WHERE slug = ? AND id <> ?").get(slug, existing.id);
    if (clash) {
      const e = new Error("Another work entry already uses this slug.");
      e.code = "DUP_SLUG";
      throw e;
    }
  }
  const bodyHtml = sanitize(input.body_html ?? existing.body_html ?? "");
  const articleMeta = input.article_meta !== undefined ? sanitize(input.article_meta) : existing.article_meta;
  const db = getDb();
  db.prepare(
    "UPDATE work_entries SET slug = ?, title = ?, kicker = ?, eyebrow = ?, lede = ?, article_meta = ?, " +
      "body_json = ?, body_html = ?, cover_media_id = ?, cover_filename = ?, cover_alt = ?, tags_csv = ?, " +
      "sort_order = ?, is_disabled = ?, meta_description = ?, published = ?, published_at = ?, " +
      "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(
    slug,
    String(input.title ?? existing.title).slice(0, 200),
    String(input.kicker ?? existing.kicker ?? "").slice(0, 100),
    String(input.eyebrow ?? existing.eyebrow ?? "").slice(0, 100),
    String(input.lede ?? existing.lede ?? "").slice(0, 500),
    articleMeta,
    wrapBodyJson(bodyHtml),
    bodyHtml,
    input.cover_media_id !== undefined ? (input.cover_media_id ? Number(input.cover_media_id) : null) : existing.cover_media_id,
    input.cover_filename ?? existing.cover_filename,
    input.cover_alt ?? existing.cover_alt,
    String(input.tags_csv ?? existing.tags_csv ?? "").slice(0, 200),
    input.sort_order !== undefined ? Number(input.sort_order) : existing.sort_order,
    input.is_disabled !== undefined ? (input.is_disabled ? 1 : 0) : existing.is_disabled,
    String(input.meta_description ?? existing.meta_description ?? "").slice(0, 500),
    input.published !== undefined ? (input.published ? 1 : 0) : existing.published,
    input.published_at ?? existing.published_at,
    existing.id,
  );
  return getWorkById(existing.id);
}

export function deleteWork(id) {
  const db = getDb();
  const info = db.prepare("DELETE FROM work_entries WHERE id = ?").run(Number(id));
  return info.changes > 0;
}
