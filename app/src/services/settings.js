import { getDb } from "../db/connect.js";

export const DEFAULT_SETTINGS = {
  "site.title": "John Doe — ML Engineer · LLMs & Eval Infrastructure",
  "site.brand": "John Doe",
  "site.tagline": "ML Engineer · LLMs & Eval Infrastructure",
  "site.lede": "I build retrieval and evaluation systems for language models — most of my work is making sure the smart-sounding answer is also the right one.",
  "site.contact_email": "hello@johndoe.ml",
  "site.base_url": "",
  "social.github": "https://github.com/",
  "social.huggingface": "https://huggingface.co/",
  "social.linkedin": "https://linkedin.com/",
  "social.calendar": "https://cal.com/",
};

export function seedDefaults() {
  const db = getDb();
  const stmt = db.prepare("INSERT OR IGNORE INTO settings (key, value_json) VALUES (?, ?)");
  let inserted = 0;
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    const info = stmt.run(k, JSON.stringify(v));
    if (info.changes) inserted++;
  }
  return inserted;
}

export function getSetting(key, fallback = null) {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
}

export function getSettingNum(key) {
  const v = getSetting(key);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function setSetting(key, value) {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
  ).run(key, JSON.stringify(value));
}

export function getAllSettings() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value_json FROM settings").all();
  const out = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value_json);
    } catch {
      out[r.key] = null;
    }
  }
  return out;
}

export function setMultipleSettings(map) {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
  );
  const txn = db.transaction((entries) => {
    for (const [k, v] of entries) stmt.run(k, JSON.stringify(v));
  });
  txn(Object.entries(map));
}
