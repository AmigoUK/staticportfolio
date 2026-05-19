import { getDb } from "../db/connect.js";
import { sanitize, wrapBodyJson } from "./sanitize.js";

// Slugs the user cannot create or delete from the admin.
// 404 is rendered by error-404.eta in the publish pipeline.
const RESERVED_SLUGS = new Set(["404"]);

// Slugs that may exist but cannot be deleted (system pages from the seed).
// Editing is fine; removing them would break links from the default menu.
const UNDELETABLE_SLUGS = new Set(["about", "now", "contact", "404"]);

// Slugs that collide with existing site paths or generated files.
const FORBIDDEN_SLUGS = new Set([
  "index", "work", "writing", "blog", "admin", "assets", "sitemap", "robots",
  "feed", "favicon", "uploads", "static",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$/;

function validateSlug(raw, { allowReserved = false } = {}) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!slug) {
    const e = new Error("Slug is required."); e.code = "BAD_SLUG"; throw e;
  }
  if (!SLUG_RE.test(slug)) {
    const e = new Error("Slug must be lowercase kebab-case, 2–82 chars (a-z, 0-9, dash)."); e.code = "BAD_SLUG"; throw e;
  }
  if (!allowReserved && RESERVED_SLUGS.has(slug)) {
    const e = new Error(`'${slug}' is reserved by the system.`); e.code = "BAD_SLUG"; throw e;
  }
  if (FORBIDDEN_SLUGS.has(slug)) {
    const e = new Error(`'${slug}' collides with a generated path.`); e.code = "BAD_SLUG"; throw e;
  }
  return slug;
}

export function listPages() {
  const db = getDb();
  return db.prepare(
    "SELECT id, slug, title, meta_description, updated_at, published, published_at FROM pages ORDER BY " +
      "CASE slug WHEN 'about' THEN 0 WHEN 'now' THEN 1 WHEN 'contact' THEN 2 WHEN '404' THEN 99 ELSE 50 END, slug",
  ).all().map((p) => ({ ...p, is_system: UNDELETABLE_SLUGS.has(p.slug) }));
}

export function getPageBySlug(slug) {
  const db = getDb();
  return db.prepare("SELECT * FROM pages WHERE slug = ?").get(String(slug)) || null;
}

export function getPageById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM pages WHERE id = ?").get(Number(id)) || null;
}

export function isSystemPage(slug) {
  return UNDELETABLE_SLUGS.has(String(slug));
}

function createPageInternal({ slug, title, meta_description, body_html, published = 1, published_at = null }, opts = {}) {
  const cleanSlug = validateSlug(slug, opts);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM pages WHERE slug = ?").get(cleanSlug)) {
    const e = new Error(`A page with slug '${cleanSlug}' already exists.`); e.code = "DUP_SLUG"; throw e;
  }
  const cleanHtml = sanitize(body_html || "");
  db.prepare(
    "INSERT INTO pages (slug, title, meta_description, body_json, body_html, published, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    cleanSlug,
    String(title || cleanSlug).slice(0, 200),
    String(meta_description || "").slice(0, 500),
    wrapBodyJson(cleanHtml),
    cleanHtml,
    published ? 1 : 0,
    published_at || null,
  );
  return getPageBySlug(cleanSlug);
}

export function createPage(input) {
  return createPageInternal(input);
}

export function updatePage(slug, { title, meta_description, body_html, published, published_at }) {
  const existing = getPageBySlug(slug);
  if (!existing) return null;
  const cleanHtml = sanitize(body_html || "");
  const db = getDb();
  db.prepare(
    "UPDATE pages SET title = ?, meta_description = ?, body_json = ?, body_html = ?, published = ?, " +
      "published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?",
  ).run(
    String(title ?? existing.title).slice(0, 200),
    String(meta_description ?? existing.meta_description ?? "").slice(0, 500),
    wrapBodyJson(cleanHtml),
    cleanHtml,
    published !== undefined ? (published ? 1 : 0) : existing.published,
    published_at !== undefined ? (published_at || null) : existing.published_at,
    existing.slug,
  );
  return getPageBySlug(existing.slug);
}

export function deletePage(slug) {
  if (UNDELETABLE_SLUGS.has(String(slug))) {
    const e = new Error(`'${slug}' is a system page and cannot be deleted.`); e.code = "SYSTEM_PAGE"; throw e;
  }
  const db = getDb();
  return db.prepare("DELETE FROM pages WHERE slug = ?").run(String(slug)).changes > 0;
}

// Kept for backwards compatibility with seed-from-static.js — bypasses
// reserved-slug restrictions so the legacy 404 page can be seeded.
export function upsertPage(input) {
  if (getPageBySlug(input.slug)) return updatePage(input.slug, input);
  return createPageInternal(input, { allowReserved: true });
}
