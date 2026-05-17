import { getDb } from "../db/connect.js";
import { setSetting, getSettingNum } from "./settings.js";

export const TOKEN_KEYS = [
  "bg",
  "bg-elevated",
  "fg",
  "fg-muted",
  "fg-subtle",
  "border",
  "accent",
  "accent-hover",
  "accent-subtle",
  "code-bg",
];

export const PRESET_THEMES = [
  {
    name: "Cream Light + Indigo Dark",
    tokens: {
      light: {
        bg: "#F7F5F0",
        "bg-elevated": "#FFFFFF",
        fg: "#111111",
        "fg-muted": "#5A5A5A",
        "fg-subtle": "#8A8A8A",
        border: "#E5E1D8",
        accent: "#7C3AED",
        "accent-hover": "#6D28D9",
        "accent-subtle": "#EDE9FE",
        "code-bg": "#F0EDE5",
      },
      dark: {
        bg: "#0F0E12",
        "bg-elevated": "#17161C",
        fg: "#F5F4F0",
        "fg-muted": "#A8A5A0",
        "fg-subtle": "#6E6B66",
        border: "#26242C",
        accent: "#A78BFA",
        "accent-hover": "#C4B5FD",
        "accent-subtle": "#2A1F4A",
        "code-bg": "#1C1B22",
      },
    },
  },
  {
    name: "Paper Light + Ink Dark",
    tokens: {
      light: {
        bg: "#FAFAFA",
        "bg-elevated": "#FFFFFF",
        fg: "#18181B",
        "fg-muted": "#52525B",
        "fg-subtle": "#71717A",
        border: "#E4E4E7",
        accent: "#475569",
        "accent-hover": "#334155",
        "accent-subtle": "#F1F5F9",
        "code-bg": "#F4F4F5",
      },
      dark: {
        bg: "#18181B",
        "bg-elevated": "#27272A",
        fg: "#FAFAFA",
        "fg-muted": "#A1A1AA",
        "fg-subtle": "#71717A",
        border: "#3F3F46",
        accent: "#94A3B8",
        "accent-hover": "#CBD5E1",
        "accent-subtle": "#1E293B",
        "code-bg": "#27272A",
      },
    },
  },
  {
    name: "Solarized",
    tokens: {
      light: {
        bg: "#FDF6E3",
        "bg-elevated": "#EEE8D5",
        fg: "#586E75",
        "fg-muted": "#93A1A1",
        "fg-subtle": "#93A1A1",
        border: "#EEE8D5",
        accent: "#268BD2",
        "accent-hover": "#2AA198",
        "accent-subtle": "#EEE8D5",
        "code-bg": "#EEE8D5",
      },
      dark: {
        bg: "#002B36",
        "bg-elevated": "#073642",
        fg: "#93A1A1",
        "fg-muted": "#839496",
        "fg-subtle": "#586E75",
        border: "#073642",
        accent: "#268BD2",
        "accent-hover": "#2AA198",
        "accent-subtle": "#073642",
        "code-bg": "#073642",
      },
    },
  },
  {
    name: "Nord",
    tokens: {
      light: {
        bg: "#ECEFF4",
        "bg-elevated": "#FFFFFF",
        fg: "#2E3440",
        "fg-muted": "#4C566A",
        "fg-subtle": "#4C566A",
        border: "#D8DEE9",
        accent: "#5E81AC",
        "accent-hover": "#81A1C1",
        "accent-subtle": "#E5E9F0",
        "code-bg": "#E5E9F0",
      },
      dark: {
        bg: "#2E3440",
        "bg-elevated": "#3B4252",
        fg: "#ECEFF4",
        "fg-muted": "#D8DEE9",
        "fg-subtle": "#4C566A",
        border: "#434C5E",
        accent: "#88C0D0",
        "accent-hover": "#8FBCBB",
        "accent-subtle": "#434C5E",
        "code-bg": "#3B4252",
      },
    },
  },
  {
    name: "Warm Sepia",
    tokens: {
      light: {
        bg: "#F5EFE0",
        "bg-elevated": "#FAF5E6",
        fg: "#3D2E1A",
        "fg-muted": "#6B5641",
        "fg-subtle": "#8B7355",
        border: "#D9C9A8",
        accent: "#B8743D",
        "accent-hover": "#9C5E2E",
        "accent-subtle": "#ECDEC0",
        "code-bg": "#ECDEC0",
      },
      dark: {
        bg: "#1F1810",
        "bg-elevated": "#2B2117",
        fg: "#E8DCBF",
        "fg-muted": "#C4B189",
        "fg-subtle": "#8B7355",
        border: "#3D3023",
        accent: "#D4965C",
        "accent-hover": "#E8AA70",
        "accent-subtle": "#3D3023",
        "code-bg": "#2B2117",
      },
    },
  },
];

export function seedPresets() {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) AS n FROM themes WHERE is_preset = 1").get().n;
  if (existing > 0) return 0;

  const insert = db.prepare(
    "INSERT INTO themes (name, is_preset, tokens_json) VALUES (?, 1, ?)",
  );
  let firstId = null;
  for (const preset of PRESET_THEMES) {
    const info = insert.run(preset.name, JSON.stringify(preset.tokens));
    if (firstId === null) firstId = info.lastInsertRowid;
  }
  if (firstId !== null && getSettingNum("active_theme_id") === null) {
    setSetting("active_theme_id", firstId);
  }
  return PRESET_THEMES.length;
}

export function listThemes() {
  const db = getDb();
  const activeId = getSettingNum("active_theme_id");
  const rows = db
    .prepare("SELECT id, name, is_preset, updated_at FROM themes ORDER BY is_preset DESC, name ASC")
    .all();
  return rows.map((r) => ({ ...r, is_active: r.id === activeId }));
}

export function getThemeById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM themes WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { ...row, tokens: JSON.parse(row.tokens_json) };
}

export function getActiveTheme() {
  const activeId = getSettingNum("active_theme_id");
  if (!activeId) return null;
  return getThemeById(activeId);
}

export function cloneTheme(sourceId) {
  const src = getThemeById(sourceId);
  if (!src) return null;
  const db = getDb();
  const newName = nextCloneName(src.name);
  const info = db
    .prepare("INSERT INTO themes (name, is_preset, tokens_json) VALUES (?, 0, ?)")
    .run(newName, src.tokens_json);
  return getThemeById(info.lastInsertRowid);
}

function nextCloneName(base) {
  const db = getDb();
  const stem = base.startsWith("Copy of ") ? base : `Copy of ${base}`;
  let candidate = stem;
  let n = 2;
  while (db.prepare("SELECT 1 FROM themes WHERE name = ?").get(candidate)) {
    candidate = `${stem} (${n++})`;
  }
  return candidate;
}

function nextNameWithStem(stem) {
  const db = getDb();
  let candidate = stem;
  let n = 2;
  while (db.prepare("SELECT 1 FROM themes WHERE name = ?").get(candidate)) {
    candidate = `${stem} (${n++})`;
  }
  return candidate;
}

export function createBlankTheme() {
  // Starting point: a copy of the first preset's tokens (Cream + Indigo).
  // Users tweak from here rather than starting from black & white.
  const tokens = JSON.parse(JSON.stringify(PRESET_THEMES[0].tokens));
  const db = getDb();
  const name = nextNameWithStem("New theme");
  const info = db
    .prepare("INSERT INTO themes (name, is_preset, tokens_json) VALUES (?, 0, ?)")
    .run(name, JSON.stringify(tokens));
  return getThemeById(info.lastInsertRowid);
}

export function exportThemeAsJson(id) {
  const theme = getThemeById(id);
  if (!theme) return null;
  return {
    name: theme.name,
    tokens: theme.tokens,
  };
}

export function importThemeFromJson(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    const err = new Error("Not valid JSON."); err.code = "BAD_JSON"; throw err;
  }
  if (!parsed || typeof parsed !== "object") {
    const e = new Error("JSON must be an object."); e.code = "BAD_JSON"; throw e;
  }
  if (!parsed.tokens || typeof parsed.tokens !== "object") {
    const e = new Error("JSON must have a 'tokens' object."); e.code = "BAD_JSON"; throw e;
  }
  validateTokens(parsed.tokens);
  const requestedName = String(parsed.name || "Imported theme").trim().slice(0, 100);
  const name = nextNameWithStem(requestedName);
  const db = getDb();
  const info = db
    .prepare("INSERT INTO themes (name, is_preset, tokens_json) VALUES (?, 0, ?)")
    .run(name, JSON.stringify(parsed.tokens));
  return getThemeById(info.lastInsertRowid);
}

export function updateTheme(id, { name, tokens }) {
  const db = getDb();
  const theme = getThemeById(id);
  if (!theme) return null;
  if (theme.is_preset) {
    const err = new Error("Cannot edit preset theme — clone it first.");
    err.code = "PRESET_LOCKED";
    throw err;
  }
  validateTokens(tokens);
  db.prepare("UPDATE themes SET name = ?, tokens_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    String(name).slice(0, 100),
    JSON.stringify(tokens),
    Number(id),
  );
  return getThemeById(id);
}

export function activateTheme(id) {
  const theme = getThemeById(id);
  if (!theme) return null;
  setSetting("active_theme_id", theme.id);
  return theme;
}

export function deleteTheme(id) {
  const db = getDb();
  const theme = getThemeById(id);
  if (!theme) return false;
  if (theme.is_preset) {
    const err = new Error("Cannot delete preset theme.");
    err.code = "PRESET_LOCKED";
    throw err;
  }
  const activeId = getSettingNum("active_theme_id");
  if (activeId === theme.id) {
    const err = new Error("Cannot delete the active theme. Activate another theme first.");
    err.code = "ACTIVE_LOCKED";
    throw err;
  }
  db.prepare("DELETE FROM themes WHERE id = ?").run(theme.id);
  return true;
}

function validateTokens(tokens) {
  if (!tokens || typeof tokens !== "object") throw new Error("tokens must be an object");
  for (const mode of ["light", "dark"]) {
    if (!tokens[mode] || typeof tokens[mode] !== "object") {
      throw new Error(`tokens.${mode} missing`);
    }
    for (const key of TOKEN_KEYS) {
      const v = tokens[mode][key];
      if (typeof v !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(v)) {
        throw new Error(`tokens.${mode}.${key} must be a 6-digit hex color, got ${JSON.stringify(v)}`);
      }
    }
  }
}
