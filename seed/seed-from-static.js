#!/usr/bin/env node
/**
 * One-time importer: parse the legacy main-branch HTML in seed/legacy/
 * and populate the CMS database. Idempotent — re-running clears + reseeds.
 */
import { readFileSync, existsSync, readdirSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseHTML } from "node-html-parser";
import { getDb } from "../app/src/db/connect.js";
import { seedPresets } from "../app/src/services/themes.js";
import { seedDefaults, setSetting } from "../app/src/services/settings.js";
import { seedFonts } from "../app/src/services/fonts.js";
import { seedDefaultMenu } from "../app/src/services/menu.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LEGACY_ROOT = join(__dirname, "legacy");
const UPLOADS = process.env.UPLOADS_DIR ? resolve(process.env.UPLOADS_DIR) : join(REPO_ROOT, "uploads");

const WORK_ORDER = ["rag-eval-harness", "fine-tuning-llama-domain", "agent-tool-router", "llm-judge-bias"];
const POST_FILES = ["why-most-rag-evals-are-broken", "notes-on-llm-judge-bias"];
const SIMPLE_PAGES = ["about", "now", "contact", "404"];

function readHtml(rel) {
  const path = join(LEGACY_ROOT, rel);
  if (!existsSync(path)) return null;
  return parseHTML(readFileSync(path, "utf8"));
}

function textOf(node) {
  if (!node) return "";
  return node.text.trim().replace(/\s+/g, " ");
}

function htmlOf(node) {
  if (!node) return "";
  return node.innerHTML.trim();
}

function extractPageHeadAndBody(doc) {
  const head = doc.querySelector(".page-head .wrap");
  const proseWrap = doc.querySelector(".prose-body .wrap");
  return { head, proseWrap };
}

function bodyHtmlMinusBacklink(proseWrap) {
  if (!proseWrap) return "";
  const clone = parseHTML(proseWrap.innerHTML);
  const back = clone.querySelector(".back-link");
  if (back) back.remove();
  const banner = clone.querySelector(".work-banner");
  if (banner) banner.remove();
  return clone.innerHTML.trim();
}

function parseSimplePage(slug) {
  const doc = readHtml(`${slug}.html`);
  if (!doc) return null;
  const title = textOf(doc.querySelector("h1")) || slug;
  const metaDescription = doc.querySelector("meta[name='description']")?.getAttribute("content") || null;
  const proseWrap = doc.querySelector(".prose-body .wrap") || doc.querySelector("main .wrap");
  let bodyHtml = "";
  if (proseWrap) {
    const clone = parseHTML(proseWrap.innerHTML);
    const back = clone.querySelector(".back-link");
    if (back) back.remove();
    bodyHtml = clone.innerHTML.trim();
  } else {
    const main = doc.querySelector("main");
    bodyHtml = main ? main.innerHTML.trim() : "";
  }
  return {
    slug,
    title,
    meta_description: metaDescription,
    body_html: bodyHtml,
    body_json: JSON.stringify({ type: "doc", content: [{ type: "html", value: bodyHtml }] }),
  };
}

function parseWorkDetail(slug) {
  const doc = readHtml(`work/${slug}.html`);
  if (!doc) return null;
  const head = doc.querySelector(".page-head .wrap");
  const eyebrow = textOf(head?.querySelector(".eyebrow"));
  const title = textOf(head?.querySelector("h1"));
  const lede = textOf(head?.querySelector(".lede"));
  const articleMeta = head?.querySelector(".article-meta")?.innerHTML?.trim() || null;
  const proseWrap = doc.querySelector(".prose-body .wrap");
  const banner = doc.querySelector(".work-banner");
  const coverFilename = banner ? banner.getAttribute("src").replace(/^\.\.\/assets\/img\//, "") : null;
  const coverAlt = banner ? banner.getAttribute("alt") : null;
  const metaDescription = doc.querySelector("meta[name='description']")?.getAttribute("content") || null;
  return {
    slug,
    title,
    eyebrow,
    lede,
    article_meta: articleMeta,
    cover_filename: coverFilename,
    cover_alt: coverAlt,
    meta_description: metaDescription,
    body_html: bodyHtmlMinusBacklink(proseWrap),
  };
}

function parseWorkIndexCards() {
  const doc = readHtml("work/index.html");
  if (!doc) return new Map();
  const out = new Map();
  for (const card of doc.querySelectorAll(".card-grid .card")) {
    const href = card.getAttribute("href") || "";
    const isDisabled = card.getAttribute("aria-disabled") === "true";
    let slug = href === "#" || isDisabled ? null : href.replace(/\.html$/, "");
    const cover = card.querySelector(".card-cover");
    const kicker = textOf(card.querySelector(".kicker"));
    const title = textOf(card.querySelector("h3"));
    const blurb = textOf(card.querySelector("p:not(.kicker)"));
    const tags = Array.from(card.querySelectorAll(".tag")).map((t) => textOf(t));
    if (isDisabled) {
      // Derive slug from the cover filename stem, falling back to the title.
      if (cover) {
        const src = cover.getAttribute("src") || "";
        const file = src.split("/").pop() || "";
        slug = file.replace(/\.[^.]+$/, "") || null;
      }
      if (!slug) {
        slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
    }
    out.set(slug, {
      slug,
      kicker,
      title,
      blurb,
      tags_csv: tags.join(","),
      cover_filename: cover ? cover.getAttribute("src").replace(/^\.\.\/assets\/img\//, "") : null,
      cover_alt: cover ? cover.getAttribute("alt") : null,
      is_disabled: isDisabled ? 1 : 0,
    });
  }
  return out;
}

function parsePost(slug) {
  const doc = readHtml(`writing/${slug}.html`);
  if (!doc) return null;
  const head = doc.querySelector(".page-head .wrap");
  const title = textOf(head?.querySelector("h1"));
  const dek = textOf(head?.querySelector(".lede"));
  const time = head?.querySelector("time")?.getAttribute("datetime") || null;
  const proseWrap = doc.querySelector(".prose-body .wrap");
  const metaDescription = doc.querySelector("meta[name='description']")?.getAttribute("content") || null;
  return {
    slug,
    title,
    dek,
    published_at: time,
    body_html: bodyHtmlMinusBacklink(proseWrap),
    meta_description: metaDescription,
  };
}

function copyLegacyImagesToUploads() {
  const src = join(LEGACY_ROOT, "assets", "img");
  if (!existsSync(src)) return 0;
  mkdirSync(UPLOADS, { recursive: true });
  let n = 0;
  walk(src, (file, relPath) => {
    const dst = join(UPLOADS, relPath);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(file, dst);
    n++;
  });
  return n;
}

function walk(dir, fn, base = dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const stat = statSync(p);
    const rel = p.slice(base.length + 1);
    if (stat.isDirectory()) walk(p, fn, base);
    else fn(p, rel);
  }
}

function main() {
  const db = getDb();
  console.log("Seeding presets / defaults / fonts / menu…");
  seedPresets();
  seedDefaults();
  seedFonts();
  seedDefaultMenu();

  // Override the site brand to "John Doe" (default already), tagline, etc. from legacy home.
  const home = readHtml("index.html");
  if (home) {
    const homeMain = home.querySelector("main");
    const eyebrow = textOf(homeMain?.querySelector(".hero .eyebrow"));
    const brand = textOf(homeMain?.querySelector(".hero h1"));
    const lede = textOf(homeMain?.querySelector(".hero .lede"));
    const title = textOf(home.querySelector("title"));
    if (brand) setSetting("site.brand", brand);
    if (eyebrow) setSetting("site.tagline", eyebrow);
    if (lede) setSetting("site.lede", lede);
    if (title) setSetting("site.title", title);
    const contactLink = home.querySelector(".contact-strip a[href^='mailto:']");
    if (contactLink) setSetting("site.contact_email", contactLink.getAttribute("href").replace("mailto:", ""));
  }

  console.log("Importing simple pages…");
  const upsertPage = db.prepare(
    "INSERT INTO pages (slug, title, meta_description, body_json, body_html, published) VALUES (?, ?, ?, ?, ?, 1) " +
      "ON CONFLICT(slug) DO UPDATE SET title=excluded.title, meta_description=excluded.meta_description, " +
      "body_json=excluded.body_json, body_html=excluded.body_html, updated_at=CURRENT_TIMESTAMP",
  );
  for (const slug of SIMPLE_PAGES) {
    const page = parseSimplePage(slug);
    if (!page) continue;
    upsertPage.run(page.slug, page.title, page.meta_description, page.body_json, page.body_html);
    console.log(`  page: ${page.slug}`);
  }

  console.log("Importing work entries…");
  const cards = parseWorkIndexCards();
  const upsertWork = db.prepare(
    "INSERT INTO work_entries (slug, title, kicker, eyebrow, lede, article_meta, body_json, body_html, cover_filename, cover_alt, tags_csv, sort_order, is_disabled, meta_description, published, published_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) " +
      "ON CONFLICT(slug) DO UPDATE SET title=excluded.title, kicker=excluded.kicker, eyebrow=excluded.eyebrow, " +
      "lede=excluded.lede, article_meta=excluded.article_meta, body_json=excluded.body_json, body_html=excluded.body_html, " +
      "cover_filename=excluded.cover_filename, cover_alt=excluded.cover_alt, tags_csv=excluded.tags_csv, " +
      "sort_order=excluded.sort_order, is_disabled=excluded.is_disabled, meta_description=excluded.meta_description, " +
      "published_at=excluded.published_at, updated_at=CURRENT_TIMESTAMP",
  );
  for (let i = 0; i < WORK_ORDER.length; i++) {
    const slug = WORK_ORDER[i];
    const card = cards.get(slug) || {};
    const detail = parseWorkDetail(slug);
    if (!detail && !card.is_disabled) continue;

    const merged = {
      slug,
      title: detail?.title || card.title,
      kicker: card.kicker,
      eyebrow: detail?.eyebrow,
      lede: detail?.lede || card.blurb,
      article_meta: detail?.article_meta || null,
      body_html: detail?.body_html || "",
      body_json: JSON.stringify({ type: "doc", content: [{ type: "html", value: detail?.body_html || "" }] }),
      cover_filename: detail?.cover_filename || card.cover_filename,
      cover_alt: detail?.cover_alt || card.cover_alt,
      tags_csv: card.tags_csv,
      sort_order: i,
      is_disabled: card.is_disabled || 0,
      meta_description: detail?.meta_description || null,
      published_at: "2024-01-01",
    };

    upsertWork.run(
      merged.slug,
      merged.title,
      merged.kicker,
      merged.eyebrow,
      merged.lede,
      merged.article_meta,
      merged.body_json,
      merged.body_html,
      merged.cover_filename,
      merged.cover_alt,
      merged.tags_csv,
      merged.sort_order,
      merged.is_disabled,
      merged.meta_description,
      merged.published_at,
    );
    console.log(`  work: ${merged.slug}${merged.is_disabled ? " (disabled)" : ""}`);
  }

  console.log("Importing writing posts…");
  const upsertPost = db.prepare(
    "INSERT INTO posts (slug, title, dek, body_json, body_html, meta_description, published, published_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, 1, ?) " +
      "ON CONFLICT(slug) DO UPDATE SET title=excluded.title, dek=excluded.dek, body_json=excluded.body_json, " +
      "body_html=excluded.body_html, meta_description=excluded.meta_description, published_at=excluded.published_at, " +
      "updated_at=CURRENT_TIMESTAMP",
  );
  for (const slug of POST_FILES) {
    const post = parsePost(slug);
    if (!post) continue;
    const bodyJson = JSON.stringify({ type: "doc", content: [{ type: "html", value: post.body_html }] });
    upsertPost.run(post.slug, post.title, post.dek, bodyJson, post.body_html, post.meta_description, post.published_at);
    console.log(`  post: ${post.slug}`);
  }

  console.log("Copying legacy images into uploads/…");
  const imageCount = copyLegacyImagesToUploads();
  console.log(`  ${imageCount} files copied`);

  console.log("Done.");
}

main();
