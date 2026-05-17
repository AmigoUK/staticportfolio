import { getDb } from "../db/connect.js";
import { setSetting, getSettingNum } from "./settings.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, "font-registry.json");

let registryCache = null;

export function getRegistry() {
  if (!registryCache) {
    registryCache = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  }
  return registryCache;
}

export function seedFonts() {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) AS n FROM fonts").get().n;
  const registry = getRegistry();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO fonts (family, role, weights_csv, source, files_json, fallback_stack, is_active) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  let inserted = 0;
  for (const role of ["sans", "mono"]) {
    const list = registry[role];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const isDefault = i === 0 && existing === 0;
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
  }
  if (existing === 0) {
    const sansRow = db.prepare("SELECT id FROM fonts WHERE role = 'sans' AND is_active = 1 LIMIT 1").get();
    const monoRow = db.prepare("SELECT id FROM fonts WHERE role = 'mono' AND is_active = 1 LIMIT 1").get();
    if (sansRow && getSettingNum("font_sans_id") === null) setSetting("font_sans_id", sansRow.id);
    if (monoRow && getSettingNum("font_mono_id") === null) setSetting("font_mono_id", monoRow.id);
  }
  return inserted;
}

export function listFonts(role) {
  const db = getDb();
  const sansActive = getSettingNum("font_sans_id");
  const monoActive = getSettingNum("font_mono_id");
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
    is_active: r.role === "sans" ? r.id === sansActive : r.id === monoActive,
  }));
}

export function getFontById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM fonts WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { ...row, files: row.files_json ? JSON.parse(row.files_json) : null };
}

export function getActiveFont(role) {
  const key = role === "sans" ? "font_sans_id" : "font_mono_id";
  const id = getSettingNum(key);
  if (!id) return null;
  return getFontById(id);
}

export function setActiveFont(role, fontId) {
  const font = getFontById(fontId);
  if (!font || font.role !== role) return null;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE fonts SET is_active = 0 WHERE role = ?").run(role);
    db.prepare("UPDATE fonts SET is_active = 1 WHERE id = ?").run(font.id);
    setSetting(role === "sans" ? "font_sans_id" : "font_mono_id", font.id);
  })();
  return font;
}

export function familyCssValue(font) {
  if (!font) return "system-ui, sans-serif";
  const family = font.source === "system" ? font.fallback_stack : `"${font.family}", ${font.fallback_stack}`;
  return family;
}
