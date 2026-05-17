import { getDb } from "../db/connect.js";

export const MENU_STYLES = ["underline-slide", "pill-fill", "spotlight-glow"];

export const DEFAULT_MENU = [
  { label: "Work", href: "work/" },
  { label: "Writing", href: "writing/" },
  { label: "About", href: "about.html" },
  { label: "Now", href: "now.html" },
  { label: "Contact", href: "contact.html" },
];

const HREF_RELATIVE_RE = /^[a-z0-9][a-z0-9\-/.]{0,200}$/i;
const MAX_ITEMS = 20;

export function validateHref(raw) {
  const href = String(raw || "").trim();
  if (!href) {
    const e = new Error("Href is required."); e.code = "BAD_HREF"; throw e;
  }
  if (href.includes("..")) {
    const e = new Error("Href must not contain '..'"); e.code = "BAD_HREF"; throw e;
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    if (/^http:/i.test(href)) {
      const e = new Error("External URLs must use https:// (or mailto:)."); e.code = "BAD_HREF"; throw e;
    }
    if (/^(javascript:|data:|vbscript:|file:)/i.test(href)) {
      const e = new Error("Disallowed URL scheme."); e.code = "BAD_HREF"; throw e;
    }
    return href;
  }
  if (href.startsWith("/")) {
    const e = new Error("Relative href must not start with '/'."); e.code = "BAD_HREF"; throw e;
  }
  if (!HREF_RELATIVE_RE.test(href)) {
    const e = new Error("Href has disallowed characters."); e.code = "BAD_HREF"; throw e;
  }
  return href;
}

function validateLabel(raw) {
  const label = String(raw || "").trim();
  if (!label) {
    const e = new Error("Label is required."); e.code = "BAD_LABEL"; throw e;
  }
  if (label.length > 50) {
    const e = new Error("Label must be 50 characters or fewer."); e.code = "BAD_LABEL"; throw e;
  }
  return label;
}

export function listMenu() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM menu_items WHERE is_visible = 1 ORDER BY sort_order, id")
    .all();
}

export function listAllForAdmin() {
  const db = getDb();
  return db.prepare("SELECT * FROM menu_items ORDER BY sort_order, id").all();
}

export function getMenuItem(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM menu_items WHERE id = ?").get(Number(id)) || null;
}

export function createMenuItem(input) {
  const label = validateLabel(input.label);
  const href = validateHref(input.href);
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS n FROM menu_items").get().n;
  if (count >= MAX_ITEMS) {
    const e = new Error(`Maximum ${MAX_ITEMS} menu items.`); e.code = "TOO_MANY"; throw e;
  }
  const nextSort = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM menu_items").get().n;
  const info = db
    .prepare(
      "INSERT INTO menu_items (label, href, sort_order, open_new_tab, is_visible) VALUES (?, ?, ?, ?, ?)",
    )
    .run(label, href, nextSort, input.open_new_tab ? 1 : 0, input.is_visible === false ? 0 : 1);
  return getMenuItem(info.lastInsertRowid);
}

export function updateMenuItem(id, input) {
  const existing = getMenuItem(id);
  if (!existing) return null;
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const href = input.href !== undefined ? validateHref(input.href) : existing.href;
  const db = getDb();
  db.prepare(
    "UPDATE menu_items SET label = ?, href = ?, open_new_tab = ?, is_visible = ?, " +
      "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(
    label,
    href,
    input.open_new_tab !== undefined ? (input.open_new_tab ? 1 : 0) : existing.open_new_tab,
    input.is_visible !== undefined ? (input.is_visible ? 1 : 0) : existing.is_visible,
    existing.id,
  );
  return getMenuItem(existing.id);
}

export function deleteMenuItem(id) {
  const db = getDb();
  return db.prepare("DELETE FROM menu_items WHERE id = ?").run(Number(id)).changes > 0;
}

function swapSort(idA, idB) {
  const db = getDb();
  const txn = db.transaction(() => {
    const a = db.prepare("SELECT sort_order FROM menu_items WHERE id = ?").get(idA);
    const b = db.prepare("SELECT sort_order FROM menu_items WHERE id = ?").get(idB);
    if (!a || !b) return false;
    db.prepare("UPDATE menu_items SET sort_order = ? WHERE id = ?").run(b.sort_order, idA);
    db.prepare("UPDATE menu_items SET sort_order = ? WHERE id = ?").run(a.sort_order, idB);
    return true;
  });
  return txn();
}

export function moveUp(id) {
  const db = getDb();
  const me = getMenuItem(id);
  if (!me) return false;
  const above = db
    .prepare("SELECT id FROM menu_items WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1")
    .get(me.sort_order);
  if (!above) return false;
  return swapSort(me.id, above.id);
}

export function moveDown(id) {
  const db = getDb();
  const me = getMenuItem(id);
  if (!me) return false;
  const below = db
    .prepare("SELECT id FROM menu_items WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1")
    .get(me.sort_order);
  if (!below) return false;
  return swapSort(me.id, below.id);
}

export function seedDefaultMenu() {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) AS n FROM menu_items").get().n;
  if (existing > 0) return 0;
  const stmt = db.prepare(
    "INSERT INTO menu_items (label, href, sort_order, open_new_tab, is_visible) VALUES (?, ?, ?, 0, 1)",
  );
  let inserted = 0;
  DEFAULT_MENU.forEach((item, idx) => {
    stmt.run(item.label, item.href, idx);
    inserted++;
  });
  return inserted;
}
