import { getDb } from "../db/connect.js";
import { sanitize, wrapBodyJson } from "./sanitize.js";

const KNOWN_SLUGS = ["about", "now", "contact", "404"];

export function listPages() {
  const db = getDb();
  return db.prepare("SELECT id, slug, title, meta_description, updated_at, published FROM pages ORDER BY slug").all();
}

export function getPageBySlug(slug) {
  const db = getDb();
  return db.prepare("SELECT * FROM pages WHERE slug = ?").get(String(slug)) || null;
}

export function getPageById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM pages WHERE id = ?").get(Number(id)) || null;
}

export function upsertPage({ slug, title, meta_description, body_html, published = 1 }) {
  if (!slug || !KNOWN_SLUGS.includes(slug)) {
    const e = new Error(`Unknown page slug: ${slug}`);
    e.code = "BAD_SLUG";
    throw e;
  }
  const cleanHtml = sanitize(body_html || "");
  const bodyJson = wrapBodyJson(cleanHtml);
  const db = getDb();
  db.prepare(
    "INSERT INTO pages (slug, title, meta_description, body_json, body_html, published) " +
      "VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(slug) DO UPDATE SET title=excluded.title, meta_description=excluded.meta_description, " +
      "body_json=excluded.body_json, body_html=excluded.body_html, published=excluded.published, " +
      "updated_at=CURRENT_TIMESTAMP",
  ).run(slug, String(title).slice(0, 200), String(meta_description || "").slice(0, 500), bodyJson, cleanHtml, published ? 1 : 0);
  return getPageBySlug(slug);
}
