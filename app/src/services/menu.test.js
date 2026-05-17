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
    ["Work", "Writing", "About", "Now", "Contact"],
  );
  const reseed = menu.seedDefaultMenu();
  assert.equal(reseed, 0);
  assert.equal(menu.listAllForAdmin().length, 5);
});

test("validateHref accepts safe relative + https + mailto", () => {
  assert.equal(menu.validateHref("work/"), "work/");
  assert.equal(menu.validateHref("about.html"), "about.html");
  assert.equal(menu.validateHref("writing/feed.xml"), "writing/feed.xml");
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
  const writing = all.find((m) => m.label === "Writing");
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
