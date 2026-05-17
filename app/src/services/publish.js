import { getDb } from "../db/connect.js";
import { getActiveTheme } from "./themes.js";
import { getActiveFont, familyCssValue, fontFileSourcePath } from "./fonts.js";
import { getAllSettings, DEFAULT_SETTINGS } from "./settings.js";
import { listMenu } from "./menu.js";
import { eta } from "../lib/render.js";
import { mkdirSync, rmSync, renameSync, copyFileSync, existsSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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
  const activeHeader = getActiveFont("header");
  const menu = listMenu();
  const menuStyle = site["menu.style"] || "underline-slide";
  const featuredStyle = site["featured.style"] || "star-prefix";
  if (!theme) throw new Error("No active theme — seed presets first.");

  // Dedupe by (family + filename) so the same WOFF2 referenced by both sans
  // and header rows doesn't emit duplicate @font-face declarations / file copies.
  const fontFaces = [];
  const seenFaces = new Set();
  for (const font of [activeSans, activeMono, activeHeader].filter(Boolean)) {
    if ((font.source === "bundled" || font.source === "custom") && font.files) {
      for (const f of font.files) {
        const key = font.family + "|" + f.file;
        if (seenFaces.has(key)) continue;
        seenFaces.add(key);
        fontFaces.push({ family: font.family, weight: f.weight, file: f.file, source: font.source, _font: font });
      }
    }
  }

  mkdirSync(join(STAGING_DIR, "assets", "css"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "js"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "fonts"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "img"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "assets", "img", "work"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "work"), { recursive: true });
  mkdirSync(join(STAGING_DIR, "blog"), { recursive: true });

  copyFileSync(join(SOURCE_ASSETS, "css", "reset.css"), join(STAGING_DIR, "assets", "css", "reset.css"));
  copyFileSync(join(SOURCE_ASSETS, "css", "site.css"), join(STAGING_DIR, "assets", "css", "site.css"));
  copyFileSync(join(SOURCE_ASSETS, "js", "theme.js"), join(STAGING_DIR, "assets", "js", "theme.js"));
  copyFileSync(join(SOURCE_ASSETS, "js", "nav.js"), join(STAGING_DIR, "assets", "js", "nav.js"));
  copyFileSync(join(SOURCE_ASSETS, "js", "code-copy.js"), join(STAGING_DIR, "assets", "js", "code-copy.js"));

  // Google Analytics init — only when a measurement ID is configured.
  // We write the gtag bootstrap to its own same-origin file so CSP can
  // stay free of 'unsafe-inline'.
  const gaId = String(site["analytics.ga_id"] || "").trim();
  if (gaId && /^G-[A-Z0-9]{4,12}$/.test(gaId)) {
    const safeId = gaId.replace(/[^A-Z0-9\-]/g, "");
    const analyticsJs =
      "window.dataLayer = window.dataLayer || [];\n" +
      "function gtag(){dataLayer.push(arguments);}\n" +
      "gtag('js', new Date());\n" +
      "gtag('config', '" + safeId + "');\n";
    writeFileSync(join(STAGING_DIR, "assets", "js", "analytics.js"), analyticsJs);
  }

  let fontsCopied = 0;
  for (const face of fontFaces) {
    const src = fontFileSourcePath(face._font, face.file);
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
    headerFamilyCss: familyCssValue(activeHeader || activeSans),
    fontFaces,
  });
  writeFileSync(join(STAGING_DIR, "assets", "css", "tokens.css"), tokensCss);

  const mediaIndex = readMediaIndex();
  let mediaCopied = 0;
  mkdirSync(join(STAGING_DIR, "assets", "files"), { recursive: true });
  for (const row of mediaIndex.rows) {
    const src = join(UPLOADS, row.filename);
    if (!existsSync(src)) continue;
    const subdir = row.kind === "file" ? "files" : "img";
    const dst = join(STAGING_DIR, "assets", subdir, row.filename);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    mediaCopied++;
  }
  const legacyImgDir = join(REPO_ROOT, "seed", "legacy", "assets", "img");
  if (existsSync(legacyImgDir)) {
    copyTree(legacyImgDir, join(STAGING_DIR, "assets", "img"));
  }

  const webpMade = await generateWebpVariants(join(STAGING_DIR, "assets", "img"));

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
  const baseCtx = { site, menu, menuStyle, featuredStyle };
  function writeHtmlFile(path, html) {
    writeFileSync(path, rewriteImgsToPicture(html));
  }

  // Home
  const featuredWork = workEntries.filter((w) => !w.is_disabled).slice(0, 3);
  const home = await eta.renderAsync("public/home.eta", {
    ...baseCtx,
    featuredWork,
    recentPosts: posts.slice(0, 2),
    workYearRange: workYearRange(workEntries),
    heroAvatarAlt: "Minimalist desk with laptop — avatar",
  });
  writeHtmlFile(join(STAGING_DIR, "index.html"), home);
  pagesWritten++;

  // Simple pages: about, now, contact, 404
  for (const page of pages) {
    const html = await eta.renderAsync(
      page.slug === "404" ? "public/error-404.eta" : "public/simple-page.eta",
      { ...baseCtx, page },
    );
    writeHtmlFile(join(STAGING_DIR, `${page.slug}.html`), html);
    pagesWritten++;
  }

  // Ensure 404 is always generated even if no row exists
  if (!pages.find((p) => p.slug === "404")) {
    const html = await eta.renderAsync("public/error-404.eta", { ...baseCtx, page: { slug: "404", title: "Not found" } });
    writeHtmlFile(join(STAGING_DIR, "404.html"), html);
    pagesWritten++;
  }

  // Work
  const workIndexHtml = await eta.renderAsync("public/work-index.eta", { ...baseCtx, workEntries });
  writeHtmlFile(join(STAGING_DIR, "work", "index.html"), workIndexHtml);
  pagesWritten++;

  for (const entry of workEntries) {
    if (entry.is_disabled) continue;
    const html = await eta.renderAsync("public/work-detail.eta", { ...baseCtx, entry });
    writeHtmlFile(join(STAGING_DIR, "work", `${entry.slug}.html`), html);
    pagesWritten++;
  }

  // Writing
  const writingIndexHtml = await eta.renderAsync("public/writing-index.eta", { ...baseCtx, posts });
  writeHtmlFile(join(STAGING_DIR, "blog", "index.html"), writingIndexHtml);
  pagesWritten++;

  for (const post of posts) {
    const html = await eta.renderAsync("public/writing-post.eta", { ...baseCtx, post });
    writeHtmlFile(join(STAGING_DIR, "blog", `${post.slug}.html`), html);
    pagesWritten++;
  }

  // sitemap.xml + blog/feed.xml + robots.txt
  const sitemap = await eta.renderAsync("public/sitemap-xml.eta", { site, workEntries, posts, pages });
  writeFileSync(join(STAGING_DIR, "sitemap.xml"), sitemap);
  const rss = await eta.renderAsync("public/rss-xml.eta", { site, posts });
  writeFileSync(join(STAGING_DIR, "blog", "feed.xml"), rss);
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

  logger.info?.(`publish ok: ${pagesWritten} pages, ${fontsCopied} fonts, ${mediaCopied} media files, ${webpMade} webp variants generated`);
  return { pagesWritten, fontsCopied, mediaCopied, webpMade };
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
  const rows = db_.prepare("SELECT id, filename, kind FROM media").all();
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

// Generate a sibling .webp for every .jpg/.jpeg/.png found under `dir`,
// recursively. Skips files where the .webp already exists.
async function generateWebpVariants(dir) {
  if (!existsSync(dir)) return 0;
  let made = 0;
  const queue = [dir];
  while (queue.length) {
    const d = queue.pop();
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const stat = statSync(full);
      if (stat.isDirectory()) { queue.push(full); continue; }
      if (!/\.(jpe?g|png)$/i.test(name)) continue;
      const webpPath = full.replace(/\.(jpe?g|png)$/i, ".webp");
      if (existsSync(webpPath)) continue;
      try {
        await sharp(full).webp({ quality: 82 }).toFile(webpPath);
        made++;
      } catch (e) {
        // Tolerate broken images — skip them rather than break the publish.
      }
    }
  }
  return made;
}

// Wrap every <img src="X.jpg|.jpeg|.png"> in <picture> with a WebP source.
// Skips external URLs and images already inside a <picture>.
function rewriteImgsToPicture(html) {
  // Pass-through any pre-existing <picture> blocks intact.
  return html.replace(
    /(<picture\b[\s\S]*?<\/picture>)|(<img\b([^>]*?)\bsrc=(["'])([^"']+\.(?:jpe?g|png))\4([^>]*?)\s*\/?>)/gi,
    (match, picture, imgTag, before, _q, src, after) => {
      if (picture) return picture;
      if (!imgTag) return match;
      if (/^https?:/i.test(src) || /^\/\//.test(src)) return imgTag;
      const webp = src.replace(/\.(jpe?g|png)$/i, ".webp");
      // Reconstruct the <img> tag cleanly to ensure it self-closes.
      const cleanImg = `<img${before}src="${src}"${after} />`;
      return `<picture><source srcset="${webp}" type="image/webp" />${cleanImg}</picture>`;
    },
  );
}
