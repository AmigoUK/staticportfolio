import { getDb } from "../db/connect.js";

export const MENU_STYLES = [
  "underline-slide",
  "pill-fill",
  "spotlight-glow",
  "magnetic-snap",
  "bracket-frame",
  "bg-slide",
];

export const FEATURED_STYLES = [
  "star-prefix",
  "pill-solid",
  "pill-outline",
  "underline-thick",
  "badge-corner",
];

export const DEFAULT_MENU = [
  { label: "Work", href: "work/" },
  { label: "Blog", href: "blog/" },
  { label: "About", href: "about.html" },
  { label: "Now", href: "now.html" },
  { label: "Contact", href: "contact.html" },
];

const HREF_RELATIVE_RE = /^[a-z0-9][a-z0-9\-/.]{0,200}$/i;
const MAX_ITEMS = 30;
const MAX_DEPTH = 1; // 0 = top-level only, 1 = one level of nesting allowed

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

function validateParentId(parentId) {
  if (parentId === null || parentId === undefined || parentId === "" || parentId === 0) return null;
  const n = Number(parentId);
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error("Invalid parent_id."); e.code = "BAD_PARENT"; throw e;
  }
  const db = getDb();
  const parent = db.prepare("SELECT id, parent_id FROM menu_items WHERE id = ?").get(n);
  if (!parent) {
    const e = new Error("Parent item not found."); e.code = "BAD_PARENT"; throw e;
  }
  if (parent.parent_id !== null && MAX_DEPTH < 2) {
    const e = new Error("Submenus only nest one level deep."); e.code = "BAD_PARENT"; throw e;
  }
  return parent.id;
}

// Flat list, top-level rows first (parent_id IS NULL), then children grouped
// under their parents in the requested sort order.
export function listAllForAdmin() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM menu_items ORDER BY sort_order, id").all();
  const tops = rows.filter((r) => r.parent_id === null);
  const childrenByParent = new Map();
  for (const r of rows) {
    if (r.parent_id !== null) {
      const arr = childrenByParent.get(r.parent_id) || [];
      arr.push(r);
      childrenByParent.set(r.parent_id, arr);
    }
  }
  const flat = [];
  for (const t of tops) {
    flat.push({ ...t, depth: 0 });
    const kids = childrenByParent.get(t.id) || [];
    for (const k of kids) flat.push({ ...k, depth: 1 });
  }
  return flat;
}

// Nested tree (visible items only) used by the publish pipeline.
export function listMenu() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM menu_items WHERE is_visible = 1 ORDER BY sort_order, id")
    .all();
  const childrenByParent = new Map();
  for (const r of rows) {
    if (r.parent_id !== null) {
      const arr = childrenByParent.get(r.parent_id) || [];
      arr.push(r);
      childrenByParent.set(r.parent_id, arr);
    }
  }
  return rows
    .filter((r) => r.parent_id === null)
    .map((r) => ({ ...r, children: childrenByParent.get(r.id) || [] }));
}

export function getMenuItem(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM menu_items WHERE id = ?").get(Number(id)) || null;
}

export function createMenuItem(input) {
  const label = validateLabel(input.label);
  const href = validateHref(input.href);
  const parent_id = validateParentId(input.parent_id);
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS n FROM menu_items").get().n;
  if (count >= MAX_ITEMS) {
    const e = new Error(`Maximum ${MAX_ITEMS} menu items.`); e.code = "TOO_MANY"; throw e;
  }
  const nextSort = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM menu_items").get().n;
  const info = db
    .prepare(
      "INSERT INTO menu_items (label, href, sort_order, open_new_tab, is_visible, parent_id, is_featured) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      label,
      href,
      nextSort,
      input.open_new_tab ? 1 : 0,
      input.is_visible === false ? 0 : 1,
      parent_id,
      input.is_featured ? 1 : 0,
    );
  return getMenuItem(info.lastInsertRowid);
}

export function updateMenuItem(id, input) {
  const existing = getMenuItem(id);
  if (!existing) return null;
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const href = input.href !== undefined ? validateHref(input.href) : existing.href;
  let parent_id = existing.parent_id;
  if (input.parent_id !== undefined) {
    if (Number(input.parent_id) === existing.id) {
      const e = new Error("An item cannot be its own parent."); e.code = "BAD_PARENT"; throw e;
    }
    parent_id = validateParentId(input.parent_id);
    // If this item has children, it cannot itself become a child.
    if (parent_id !== null) {
      const db = getDb();
      const hasChildren = db.prepare("SELECT 1 FROM menu_items WHERE parent_id = ? LIMIT 1").get(existing.id);
      if (hasChildren) {
        const e = new Error("Cannot move an item with children under another parent."); e.code = "BAD_PARENT"; throw e;
      }
    }
  }
  const db = getDb();
  db.prepare(
    "UPDATE menu_items SET label = ?, href = ?, open_new_tab = ?, is_visible = ?, parent_id = ?, " +
      "is_featured = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(
    label,
    href,
    input.open_new_tab !== undefined ? (input.open_new_tab ? 1 : 0) : existing.open_new_tab,
    input.is_visible !== undefined ? (input.is_visible ? 1 : 0) : existing.is_visible,
    parent_id,
    input.is_featured !== undefined ? (input.is_featured ? 1 : 0) : existing.is_featured,
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

// Reorder among siblings (same parent_id).
export function moveUp(id) {
  const db = getDb();
  const me = getMenuItem(id);
  if (!me) return false;
  const above = db
    .prepare(
      "SELECT id FROM menu_items WHERE sort_order < ? AND " +
        "((parent_id IS NULL AND ? IS NULL) OR parent_id = ?) ORDER BY sort_order DESC LIMIT 1",
    )
    .get(me.sort_order, me.parent_id, me.parent_id);
  if (!above) return false;
  return swapSort(me.id, above.id);
}

export function moveDown(id) {
  const db = getDb();
  const me = getMenuItem(id);
  if (!me) return false;
  const below = db
    .prepare(
      "SELECT id FROM menu_items WHERE sort_order > ? AND " +
        "((parent_id IS NULL AND ? IS NULL) OR parent_id = ?) ORDER BY sort_order ASC LIMIT 1",
    )
    .get(me.sort_order, me.parent_id, me.parent_id);
  if (!below) return false;
  return swapSort(me.id, below.id);
}

export function seedDefaultMenu() {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) AS n FROM menu_items").get().n;
  if (existing > 0) return 0;
  const stmt = db.prepare(
    "INSERT INTO menu_items (label, href, sort_order, open_new_tab, is_visible, parent_id, is_featured) " +
      "VALUES (?, ?, ?, 0, 1, NULL, 0)",
  );
  let inserted = 0;
  DEFAULT_MENU.forEach((item, idx) => {
    stmt.run(item.label, item.href, idx);
    inserted++;
  });
  return inserted;
}

// Top-level items only, used to populate the parent dropdown in the admin.
export function listPotentialParents(excludeId = null) {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, label FROM menu_items WHERE parent_id IS NULL ORDER BY sort_order, id")
    .all();
  return excludeId ? rows.filter((r) => r.id !== Number(excludeId)) : rows;
}
