import { getDb } from "../db/connect.js";
import { setSetting, getSettingNum } from "./settings.js";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, "font-registry.json");
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const CUSTOM_FONTS_DIR = process.env.CUSTOM_FONTS_DIR
  ? resolve(process.env.CUSTOM_FONTS_DIR)
  : join(REPO_ROOT, "uploads", "fonts");
const MAX_FONT_BYTES = 2 * 1024 * 1024;
const STANDARD_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export function customFontsDir() { return CUSTOM_FONTS_DIR; }

function isWoff2(buf) {
  if (!buf || buf.length < 4) return false;
  // WOFF2 signature: "wOF2"
  return buf[0] === 0x77 && buf[1] === 0x4f && buf[2] === 0x46 && buf[3] === 0x32;
}

function sanitizeFamily(raw) {
  const f = String(raw || "").trim();
  if (!f) { const e = new Error("Family name is required."); e.code = "BAD_FAMILY"; throw e; }
  if (f.length > 60) { const e = new Error("Family name too long (max 60)."); e.code = "BAD_FAMILY"; throw e; }
  if (!/^[a-zA-Z0-9 _\-]+$/.test(f)) {
    const e = new Error("Family name: letters, digits, spaces, dashes, underscores only.");
    e.code = "BAD_FAMILY"; throw e;
  }
  return f;
}

function sanitizeWeight(raw) {
  const w = Number(raw);
  if (!STANDARD_WEIGHTS.includes(w)) {
    const e = new Error("Weight must be a standard CSS weight (100, 200, …, 900)."); e.code = "BAD_WEIGHT"; throw e;
  }
  return w;
}

const FONT_ROLES = ["sans", "mono", "header"];
export { FONT_ROLES };

function sanitizeRole(raw) {
  if (!FONT_ROLES.includes(raw)) {
    const e = new Error("Role must be 'sans', 'mono', or 'header'."); e.code = "BAD_ROLE"; throw e;
  }
  return raw;
}

export async function ingestFontUpload({ buffer, family, weight, role, originalFilename }) {
  if (!buffer || buffer.length === 0) {
    const e = new Error("Empty upload."); e.code = "EMPTY"; throw e;
  }
  if (buffer.length > MAX_FONT_BYTES) {
    const e = new Error(`Upload too large: ${buffer.length} > ${MAX_FONT_BYTES} bytes.`); e.code = "TOO_LARGE"; throw e;
  }
  if (!isWoff2(buffer)) {
    const e = new Error("File is not a WOFF2 (magic bytes don't match). Convert your font to WOFF2 first.");
    e.code = "BAD_MAGIC"; throw e;
  }
  const cleanFamily = sanitizeFamily(family);
  const cleanWeight = sanitizeWeight(weight);
  const cleanRole = sanitizeRole(role);

  mkdirSync(CUSTOM_FONTS_DIR, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.woff2`;
  writeFileSync(join(CUSTOM_FONTS_DIR, filename), buffer);

  const db = getDb();
  const existing = db.prepare("SELECT * FROM fonts WHERE family = ? AND role = ?").get(cleanFamily, cleanRole);

  if (existing) {
    if (existing.source === "bundled" || existing.source === "system") {
      // Don't overwrite the built-ins. Append to a custom family with the same name? Block instead.
      try { unlinkSync(join(CUSTOM_FONTS_DIR, filename)); } catch (_) {}
      const e = new Error(`'${cleanFamily}' (${cleanRole}) is a built-in family. Pick a different name for your custom font.`);
      e.code = "DUP_FAMILY"; throw e;
    }
    // Merge: append/replace the weight's file in files_json.
    const files = JSON.parse(existing.files_json || "[]");
    const at = files.findIndex((f) => f.weight === cleanWeight);
    if (at >= 0) {
      // Remove the old file from disk before overwriting.
      try { unlinkSync(join(CUSTOM_FONTS_DIR, files[at].file)); } catch (_) {}
      files[at] = { weight: cleanWeight, file: filename };
    } else {
      files.push({ weight: cleanWeight, file: filename });
    }
    files.sort((a, b) => a.weight - b.weight);
    const weightsCsv = files.map((f) => f.weight).join(",");
    db.prepare("UPDATE fonts SET files_json = ?, weights_csv = ? WHERE id = ?")
      .run(JSON.stringify(files), weightsCsv, existing.id);
    return getFontById(existing.id);
  }

  // New custom family.
  const files = [{ weight: cleanWeight, file: filename }];
  const fallback = cleanRole === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  const info = db
    .prepare(
      "INSERT INTO fonts (family, role, weights_csv, source, files_json, fallback_stack, is_active) " +
        "VALUES (?, ?, ?, 'custom', ?, ?, 0)",
    )
    .run(cleanFamily, cleanRole, String(cleanWeight), JSON.stringify(files), fallback);
  return getFontById(info.lastInsertRowid);
}

export function deleteCustomFont(id) {
  const font = getFontById(id);
  if (!font) return false;
  if (font.source !== "custom") {
    const e = new Error("Only custom fonts can be deleted."); e.code = "NOT_CUSTOM"; throw e;
  }
  // Refuse if currently active.
  const activeSans = getSettingNum("font_sans_id");
  const activeMono = getSettingNum("font_mono_id");
  if (font.id === activeSans || font.id === activeMono) {
    const e = new Error("Cannot delete the active font. Pick a different font first."); e.code = "ACTIVE"; throw e;
  }
  const db = getDb();
  const files = font.files || [];
  for (const f of files) {
    try { unlinkSync(join(CUSTOM_FONTS_DIR, f.file)); } catch (_) {}
  }
  db.prepare("DELETE FROM fonts WHERE id = ?").run(font.id);
  return true;
}

export function fontFileSourcePath(font, file) {
  // Where on disk does this font's woff2 live? Bundled fonts live in
  // source-assets/fonts/, custom uploads in uploads/fonts/.
  const SOURCE_FONTS = resolve(REPO_ROOT, "source-assets", "fonts");
  return font.source === "custom" ? join(CUSTOM_FONTS_DIR, file) : join(SOURCE_FONTS, file);
}

let registryCache = null;

export function getRegistry() {
  if (!registryCache) {
    registryCache = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  }
  return registryCache;
}

const ROLE_TO_SETTING = { sans: "font_sans_id", mono: "font_mono_id", header: "font_header_id" };

export function seedFonts() {
  const db = getDb();
  const registry = getRegistry();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO fonts (family, role, weights_csv, source, files_json, fallback_stack, is_active) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  let inserted = 0;
  for (const role of FONT_ROLES) {
    const list = registry[role] || [];
    // Per-role "is this the first time we've seeded this role?" check —
    // lets us add 'header' to an existing install that already has sans + mono.
    const rowsAlreadyInRole = db.prepare("SELECT COUNT(*) AS n FROM fonts WHERE role = ?").get(role).n;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const isDefault = i === 0 && rowsAlreadyInRole === 0;
      const info = insert.run(
        f.family,
        role,
        f.weights.join(","),
        f.source,
        f.files ? JSON.stringify(f.files) : null,
        f.fallback_stack,
        isDefault ? 1 : 0,
      );
      if (info.changes) inserted++;
    }
    // If the active-id for this role isn't set yet, set it to whichever
    // row currently carries is_active=1 (either marked just now, or pre-existing).
    const settingKey = ROLE_TO_SETTING[role];
    if (settingKey && getSettingNum(settingKey) === null) {
      const activeRow = db.prepare("SELECT id FROM fonts WHERE role = ? AND is_active = 1 LIMIT 1").get(role);
      if (activeRow) setSetting(settingKey, activeRow.id);
    }
  }
  return inserted;
}

export function listFonts(role) {
  const db = getDb();
  const activeByRole = {
    sans: getSettingNum("font_sans_id"),
    mono: getSettingNum("font_mono_id"),
    header: getSettingNum("font_header_id"),
  };
  const where = role ? "WHERE role = ?" : "";
  const params = role ? [role] : [];
  const rows = db
    .prepare(
      `SELECT * FROM fonts ${where} ORDER BY role, CASE source WHEN 'bundled' THEN 0 ELSE 1 END, id`,
    )
    .all(...params);
  return rows.map((r) => ({
    ...r,
    files: r.files_json ? JSON.parse(r.files_json) : null,
    is_active: r.id === activeByRole[r.role],
  }));
}

export function getFontById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM fonts WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { ...row, files: row.files_json ? JSON.parse(row.files_json) : null };
}

export function getActiveFont(role) {
  const key = ROLE_TO_SETTING[role];
  if (!key) return null;
  const id = getSettingNum(key);
  if (!id) return null;
  return getFontById(id);
}

export function setActiveFont(role, fontId) {
  const key = ROLE_TO_SETTING[role];
  if (!key) return null;
  const font = getFontById(fontId);
  if (!font || font.role !== role) return null;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE fonts SET is_active = 0 WHERE role = ?").run(role);
    db.prepare("UPDATE fonts SET is_active = 1 WHERE id = ?").run(font.id);
    setSetting(key, font.id);
  })();
  return font;
}

export function familyCssValue(font) {
  if (!font) return "system-ui, sans-serif";
  const family = font.source === "system" ? font.fallback_stack : `"${font.family}", ${font.fallback_stack}`;
  return family;
}
