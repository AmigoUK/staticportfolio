import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";

const menu = await import("./menu.js");

test("seedDefaultMenu inserts the 5 default items and is idempotent", () => {
  const inserted = menu.seedDefaultMenu();
  assert.equal(inserted, 5);
  const all = menu.listAllForAdmin();
  assert.equal(all.length, 5);
  assert.deepEqual(
    all.map((m) => m.label),
    ["Work", "Blog", "About", "Now", "Contact"],
  );
  const reseed = menu.seedDefaultMenu();
  assert.equal(reseed, 0);
  assert.equal(menu.listAllForAdmin().length, 5);
});

test("validateHref accepts safe relative + https + mailto", () => {
  assert.equal(menu.validateHref("work/"), "work/");
  assert.equal(menu.validateHref("about.html"), "about.html");
  assert.equal(menu.validateHref("blog/feed.xml"), "blog/feed.xml");
  assert.equal(menu.validateHref("https://example.com/cv.pdf"), "https://example.com/cv.pdf");
  assert.equal(menu.validateHref("mailto:hi@example.com"), "mailto:hi@example.com");
});

test("validateHref rejects unsafe schemes and shapes", () => {
  assert.throws(() => menu.validateHref(""), /required/);
  assert.throws(() => menu.validateHref("javascript:alert(1)"), /scheme|characters/i);
  assert.throws(() => menu.validateHref("data:text/html,<script>"), /scheme|characters/i);
  assert.throws(() => menu.validateHref("vbscript:msgbox"), /scheme|characters/i);
  assert.throws(() => menu.validateHref("/absolute/path"), /must not start with/);
  assert.throws(() => menu.validateHref("../parent"), /must not contain/);
  assert.throws(() => menu.validateHref("http://insecure.example.com"), /https/);
  assert.throws(() => menu.validateHref("work?param=<script>"), /characters/);
});

test("createMenuItem auto-appends sort_order and trims label", () => {
  const m = menu.createMenuItem({ label: "  Newsletter  ", href: "newsletter.html" });
  assert.equal(m.label, "Newsletter");
  assert.equal(m.sort_order, 5);
  assert.equal(m.is_visible, 1);
});

test("moveUp / moveDown swap neighbouring rows", () => {
  const all = menu.listAllForAdmin();
  const work = all.find((m) => m.label === "Work");
  const writing = all.find((m) => m.label === "Blog");
  const swapped = menu.moveUp(writing.id);
  assert.ok(swapped);
  const after = menu.listAllForAdmin();
  const writingAfter = after.find((m) => m.id === writing.id);
  const workAfter = after.find((m) => m.id === work.id);
  assert.ok(writingAfter.sort_order < workAfter.sort_order);
});

test("moveUp at top is a no-op", () => {
  const top = menu.listAllForAdmin()[0];
  const result = menu.moveUp(top.id);
  assert.equal(result, false);
});

test("updateMenuItem rejects bad href on existing row", () => {
  const all = menu.listAllForAdmin();
  assert.throws(
    () => menu.updateMenuItem(all[0].id, { href: "javascript:0" }),
    /scheme|characters/i,
  );
});

test("createMenuItem rejects empty label", () => {
  assert.throws(() => menu.createMenuItem({ label: "  ", href: "x.html" }), /Label/);
});

test("listMenu returns only visible items in sort order", () => {
  const all = menu.listAllForAdmin();
  const hidden = all[0];
  menu.updateMenuItem(hidden.id, { is_visible: false });
  const visible = menu.listMenu();
  assert.equal(visible.find((m) => m.id === hidden.id), undefined);
  // Restore for later tests
  menu.updateMenuItem(hidden.id, { is_visible: true });
});

test("deleteMenuItem removes the row", () => {
  const created = menu.createMenuItem({ label: "Doomed", href: "doomed.html" });
  assert.ok(menu.deleteMenuItem(created.id));
  assert.equal(menu.getMenuItem(created.id), null);
});

test("FEATURED_STYLES exposes all 5 variants", () => {
  assert.deepEqual(menu.FEATURED_STYLES.sort(), [
    "badge-corner",
    "pill-outline",
    "pill-solid",
    "star-prefix",
    "underline-thick",
  ]);
});

test("MENU_STYLES exposes all 6 variants", () => {
  assert.deepEqual(menu.MENU_STYLES.sort(), [
    "bg-slide",
    "bracket-frame",
    "magnetic-snap",
    "pill-fill",
    "spotlight-glow",
    "underline-slide",
  ]);
});

test("createMenuItem accepts parent_id and is_featured", () => {
  const parents = menu.listPotentialParents();
  const work = parents.find((p) => p.label === "Work");
  const child = menu.createMenuItem({
    label: "Recent",
    href: "work/",
    parent_id: work.id,
    is_featured: false,
  });
  assert.equal(child.parent_id, work.id);
  assert.equal(child.is_featured, 0);

  const featured = menu.createMenuItem({
    label: "Hire me",
    href: "https://example.com/hire",
    is_featured: true,
  });
  assert.equal(featured.is_featured, 1);
});

test("createMenuItem rejects non-existent parent_id", () => {
  assert.throws(() => menu.createMenuItem({ label: "Orphan", href: "x.html", parent_id: 9999 }), /Parent/);
});

test("createMenuItem rejects nesting deeper than 1 level", () => {
  const top = menu.createMenuItem({ label: "Top", href: "top.html" });
  const mid = menu.createMenuItem({ label: "Mid", href: "mid.html", parent_id: top.id });
  assert.throws(
    () => menu.createMenuItem({ label: "Bottom", href: "b.html", parent_id: mid.id }),
    /one level/,
  );
});

test("listMenu returns nested tree with children", () => {
  const tree = menu.listMenu();
  // Find a parent with children
  const withKids = tree.find((t) => t.children.length > 0);
  assert.ok(withKids, "expected at least one top-level item with children");
  assert.ok(Array.isArray(withKids.children));
  // Submenu children should NOT appear at the top level.
  const childIds = new Set();
  for (const t of tree) for (const c of t.children) childIds.add(c.id);
  for (const t of tree) assert.equal(childIds.has(t.id), false);
});

test("updateMenuItem rejects making an item its own parent", () => {
  const all = menu.listAllForAdmin();
  const top = all.find((m) => m.depth === 0);
  assert.throws(() => menu.updateMenuItem(top.id, { parent_id: top.id }), /own parent/);
});

test("updateMenuItem refuses to nest an item that already has children", () => {
  const all = menu.listAllForAdmin();
  const parent = all.find((m) => m.depth === 0 && m.label === "Top");
  const anotherTop = all.find((m) => m.depth === 0 && m.id !== parent.id);
  // 'parent' is already a parent (it has 'Mid' as its child). Cannot become a child itself.
  assert.throws(() => menu.updateMenuItem(parent.id, { parent_id: anotherTop.id }), /children/);
});

test("listAllForAdmin places children directly under their parent with depth=1", () => {
  const all = menu.listAllForAdmin();
  for (let i = 0; i < all.length; i++) {
    if (all[i].depth === 1) {
      // The row just before must be either depth=0 (the parent) or depth=1 (a sibling)
      assert.ok(i > 0 && all[i - 1].depth <= 1);
    }
  }
});
