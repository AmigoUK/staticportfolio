import { getDb } from "../db/connect.js";
import { sanitize, wrapBodyJson } from "./sanitize.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$/;

export function listPosts() {
  const db = getDb();
  return db.prepare("SELECT * FROM posts ORDER BY published DESC, published_at DESC, id DESC").all();
}

export function getPostById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM posts WHERE id = ?").get(Number(id)) || null;
}

function validateSlug(slug) {
  if (!SLUG_RE.test(String(slug || ""))) {
    const e = new Error("Slug must be kebab-case alphanumerics (2–82 chars).");
    e.code = "BAD_SLUG";
    throw e;
  }
}

export function createPost(input) {
  validateSlug(input.slug);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM posts WHERE slug = ?").get(input.slug)) {
    const e = new Error("A post with this slug already exists.");
    e.code = "DUP_SLUG";
    throw e;
  }
  const bodyHtml = sanitize(input.body_html || "");
  const info = db
    .prepare(
      "INSERT INTO posts (slug, title, dek, body_json, body_html, meta_description, published, published_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.slug,
      String(input.title || "").slice(0, 200),
      String(input.dek || "").slice(0, 500),
      wrapBodyJson(bodyHtml),
      bodyHtml,
      String(input.meta_description || "").slice(0, 500),
      input.published ? 1 : 0,
      input.published_at || null,
    );
  return getPostById(info.lastInsertRowid);
}

export function updatePost(id, input) {
  const existing = getPostById(id);
  if (!existing) return null;
  if (input.slug && input.slug !== existing.slug) {
    validateSlug(input.slug);
    const db = getDb();
    if (db.prepare("SELECT 1 FROM posts WHERE slug = ? AND id <> ?").get(input.slug, existing.id)) {
      const e = new Error("Another post already uses this slug.");
      e.code = "DUP_SLUG";
      throw e;
    }
  }
  const bodyHtml = sanitize(input.body_html ?? existing.body_html ?? "");
  const db = getDb();
  db.prepare(
    "UPDATE posts SET slug = ?, title = ?, dek = ?, body_json = ?, body_html = ?, meta_description = ?, " +
      "published = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(
    input.slug || existing.slug,
    String(input.title ?? existing.title).slice(0, 200),
    String(input.dek ?? existing.dek ?? "").slice(0, 500),
    wrapBodyJson(bodyHtml),
    bodyHtml,
    String(input.meta_description ?? existing.meta_description ?? "").slice(0, 500),
    input.published !== undefined ? (input.published ? 1 : 0) : existing.published,
    input.published_at ?? existing.published_at,
    existing.id,
  );
  return getPostById(existing.id);
}

export function deletePost(id) {
  const db = getDb();
  return db.prepare("DELETE FROM posts WHERE id = ?").run(Number(id)).changes > 0;
}
