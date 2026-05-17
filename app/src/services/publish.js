import { getDb } from "../db/connect.js";
import { getActiveTheme } from "./themes.js";
import { getActiveFont, familyCssValue } from "./fonts.js";
import { getAllSettings, DEFAULT_SETTINGS } from "./settings.js";
import { listMenu } from "./menu.js";
import { eta } from "../lib/render.js";
import { mkdirSync, rmSync, renameSync, copyFileSync, existsSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SRC = join(__dirname, "..");
const REPO_ROOT = resolve(APP_SRC, "..", "..");
const SOURCE_ASSETS = join(REPO_ROOT, "source-assets");
const UPLOADS = process.env.UPLOADS_DIR ? resolve(process.env.UPLOADS_DIR) : join(REPO_ROOT, "uploads");
const PUBLIC_DIR = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : join(REPO_ROOT, "public");
const STAGING_DIR = process.env.PUBLIC_STAGING_DIR ? resolve(process.env.PUBLIC_STAGING_DIR) : join(REPO_ROOT, "public.next");
const PREV_DIR = join(REPO_ROOT, "public.prev");

let publishing = false;

export async function publish({ logger = console } = {}) {
  if (publishing) {
    const err = new Error("Publish already in progress.");
    err.code = "PUBLISH_BUSY";
    throw err;
  }
  publishing = true;
  const db = getDb();
  const logRow = db
    .prepare("INSERT INTO publish_log (started_at, status) VALUES (CURRENT_TIMESTAMP, 'running') RETURNING id")
    .get();
  try {
    const result = await runPublish(logger);
    db.prepare(
      "UPDATE publish_log SET finished_at = CURRENT_TIMESTAMP, status = 'ok', message = ? WHERE id = ?",
    ).run(`Wrote ${result.pagesWritten} pages, ${result.fontsCopied} fonts, ${result.mediaCopied} media files.`, logRow.id);
    return result;
  } catch (err) {
    db.prepare(
      "UPDATE publish_log SET finished_at = CURRENT_TIMESTAMP, status = 'error', message = ? WHERE id = ?",
    ).run(err.message, logRow.id);
    throw err;
  } finally {
    publishing = false;
  }
}

async function runPublish(logger) {
  if (existsSync(STAGING_DIR)) rmSync(STAGING_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_DIR, { recursive: true });

  const site = { ...DEFAULT_SETTINGS, ...getAllSettings() };
  const theme = getActiveTheme();
  const activeSans = getActiveFont("sans");
  const activeMono = getActiveFont("mono");
  const menu = listMenu();
  const menuStyle = site["menu.style"] || "underline-slide";
  if (!theme) throw new Error("No active theme — seed presets first.");

  const fontFaces = [];
  for (const font of [activeSans, activeMono].filter(Boolean)) {
    if (font.source === "bundled" && font.files) {
      for (const f of font.files) fontFaces.push({ family: font.family, weight: f.weight, file: f.file });
    }
  }

  mkdirSync(join(STAGING_DIR, "assets", "css"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "js"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "fonts"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "img"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "img", "work"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "work"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "writing"), { recursive: true });

  copyFileSync(join(SOURCE_ASSETS, "css", "reset.css"), join(STAGING_DIR, "assets", "css", "reset.css"));
  copyFileSync(join(SOURCE_ASSETS, "css", "site.css"), join(STAGING_DIR, "assets", "css", "site.css"));
  copyFileSync(join(SOURCE_ASSETS, "js", "theme.js"), join(STAGING_DIR, "assets", "js", "theme.js"));

  let fontsCopied = 0;
  for (const face of fontFaces) {
    const src = join(SOURCE_ASSETS, "fonts", face.file);
    const dst = join(STAGING_DIR, "assets", "fonts", face.file);
    if (existsSync(src)) {
      copyFileSync(src, dst);
      fontsCopied++;
    } else {
      logger.warn?.(`font file missing: ${src}`);
    }
  }

  const tokensCss = await eta.renderAsync("public/tokens-css.eta", {
    theme,
    sansFamilyCss: familyCssValue(activeSans),
    monoFamilyCss: familyCssValue(activeMono),
    fontFaces,
  });
  writeFileSync(join(STAGING_DIR, "assets", "css", "tokens.css"), tokensCss);

  const mediaIndex = readMediaIndex();
  let mediaCopied = 0;
  for (const filename of mediaIndex.allFiles) {
    const src = join(UPLOADS, filename);
    if (!existsSync(src)) continue;
    const dst = join(STAGING_DIR, "assets", "img", filename);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    mediaCopied++;
  }
  const legacyImgDir = join(REPO_ROOT, "seed", "legacy", "assets", "img");
  if (existsSync(legacyImgDir)) {
    copyTree(legacyImgDir, join(STAGING_DIR, "assets", "img"));
  }

  const db_ = getDb();
  const pages = db_.prepare("SELECT * FROM pages WHERE published = 1").all();
  const workEntries = db_
    .prepare("SELECT * FROM work_entries WHERE published = 1 ORDER BY sort_order, id")
    .all()
    .map(decorateWork);
  const posts = db_
    .prepare("SELECT * FROM posts WHERE published = 1 ORDER BY published_at DESC")
    .all();

  let pagesWritten = 0;
  const baseCtx = { site, menu, menuStyle };

  // Home
  const featuredWork = workEntries.filter((w) => !w.is_disabled).slice(0, 3);
  const home = await eta.renderAsync("public/home.eta", {
    ...baseCtx,
    featuredWork,
    recentPosts: posts.slice(0, 2),
    workYearRange: workYearRange(workEntries),
    heroAvatarAlt: "Minimalist desk with laptop — avatar",
  });
  writeFileSync(join(STAGING_DIR, "index.html"), home);
  pagesWritten++;

  // Simple pages: about, now, contact, 404
  for (const page of pages) {
    const html = await eta.renderAsync(
      page.slug === "404" ? "public/error-404.eta" : "public/simple-page.eta",
      { ...baseCtx, page },
    );
    writeFileSync(join(STAGING_DIR, `${page.slug}.html`), html);
    pagesWritten++;
  }

  // Ensure 404 is always generated even if no row exists
  if (!pages.find((p) => p.slug === "404")) {
    const html = await eta.renderAsync("public/error-404.eta", { ...baseCtx, page: { slug: "404", title: "Not found" } });
    writeFileSync(join(STAGING_DIR, "404.html"), html);
    pagesWritten++;
  }

  // Work
  const workIndexHtml = await eta.renderAsync("public/work-index.eta", { ...baseCtx, workEntries });
  writeFileSync(join(STAGING_DIR, "work", "index.html"), workIndexHtml);
  pagesWritten++;

  for (const entry of workEntries) {
    if (entry.is_disabled) continue;
    const html = await eta.renderAsync("public/work-detail.eta", { ...baseCtx, entry });
    writeFileSync(join(STAGING_DIR, "work", `${entry.slug}.html`), html);
    pagesWritten++;
  }

  // Writing
  const writingIndexHtml = await eta.renderAsync("public/writing-index.eta", { ...baseCtx, posts });
  writeFileSync(join(STAGING_DIR, "writing", "index.html"), writingIndexHtml);
  pagesWritten++;

  for (const post of posts) {
    const html = await eta.renderAsync("public/writing-post.eta", { ...baseCtx, post });
    writeFileSync(join(STAGING_DIR, "writing", `${post.slug}.html`), html);
    pagesWritten++;
  }

  // sitemap.xml + writing/feed.xml + robots.txt
  const sitemap = await eta.renderAsync("public/sitemap-xml.eta", { site, workEntries, posts });
  writeFileSync(join(STAGING_DIR, "sitemap.xml"), sitemap);
  const rss = await eta.renderAsync("public/rss-xml.eta", { site, posts });
  writeFileSync(join(STAGING_DIR, "writing", "feed.xml"), rss);
  writeFileSync(
    join(STAGING_DIR, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${(site["site.base_url"] || "").replace(/\/+$/, "")}/sitemap.xml\n`,
  );

  // Atomic swap
  if (existsSync(PREV_DIR)) rmSync(PREV_DIR, { recursive: true, force: true });
  if (existsSync(PUBLIC_DIR)) {
    // PUBLIC_DIR may exist with a .gitkeep; we want to replace it cleanly
    renameSync(PUBLIC_DIR, PREV_DIR);
  }
  renameSync(STAGING_DIR, PUBLIC_DIR);
  rmSync(PREV_DIR, { recursive: true, force: true });

  logger.info?.(`publish ok: ${pagesWritten} pages, ${fontsCopied} fonts, ${mediaCopied} media files`);
  return { pagesWritten, fontsCopied, mediaCopied };
}

const db = () => getDb();

function decorateWork(row) {
  const media = row.cover_media_id
    ? db()
        .prepare("SELECT filename, alt FROM media WHERE id = ?")
        .get(row.cover_media_id)
    : null;
  return {
    ...row,
    cover_filename: media ? `work/${media.filename}` : row.cover_filename || null,
    cover_alt: media?.alt || row.cover_alt || null,
  };
}

function readMediaIndex() {
  const db_ = getDb();
  const rows = db_.prepare("SELECT id, filename FROM media").all();
  return {
    rows,
    allFiles: rows.map((r) => r.filename),
  };
}

function workYearRange(entries) {
  if (entries.length === 0) return "";
  const years = entries
    .map((e) => (e.published_at || e.updated_at).slice(0, 4))
    .filter(Boolean)
    .sort();
  const first = years[0];
  const last = years[years.length - 1];
  return first === last ? first : `${first} — ${last}`;
}

function copyTree(src, dst) {
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    const stat = statSync(s);
    if (stat.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}
