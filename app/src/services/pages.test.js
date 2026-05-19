import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";

const pages = await import("./pages.js");

test("createPage accepts a normal slug and returns the row", () => {
  const p = pages.createPage({ slug: "resume", title: "Résumé", body_html: "<p>hi</p>" });
  assert.equal(p.slug, "resume");
  assert.equal(p.title, "Résumé");
  assert.equal(p.published, 1);
});

test("createPage rejects reserved slug '404'", () => {
  assert.throws(() => pages.createPage({ slug: "404", title: "404" }), /reserved/);
});

test("createPage rejects forbidden slug 'admin'", () => {
  assert.throws(() => pages.createPage({ slug: "admin", title: "admin" }), /collides/);
});

test("createPage rejects bad slug formats", () => {
  assert.throws(() => pages.createPage({ slug: "Has Spaces", title: "x" }), /kebab/);
  assert.throws(() => pages.createPage({ slug: "-leading-dash", title: "x" }), /kebab/);
  assert.throws(() => pages.createPage({ slug: "trailing-dash-", title: "x" }), /kebab/);
  assert.throws(() => pages.createPage({ slug: "underscore_not_dash", title: "x" }), /kebab/);
  assert.throws(() => pages.createPage({ slug: "", title: "x" }), /required/);
});

test("createPage normalizes case (UPPER → upper)", () => {
  const p = pages.createPage({ slug: "MIXED-Case", title: "x" });
  assert.equal(p.slug, "mixed-case");
});

test("createPage rejects duplicate slug", () => {
  pages.createPage({ slug: "uses", title: "Uses" });
  assert.throws(() => pages.createPage({ slug: "uses", title: "Uses 2" }), /already exists/);
});

test("upsertPage allows reserved slug 404 (seed path)", () => {
  const p = pages.upsertPage({ slug: "404", title: "Not found", body_html: "<p>404</p>" });
  assert.equal(p.slug, "404");
  // Re-upsert updates rather than throwing DUP_SLUG
  const updated = pages.upsertPage({ slug: "404", title: "Page not found" });
  assert.equal(updated.title, "Page not found");
});

test("deletePage refuses to delete system pages", () => {
  pages.upsertPage({ slug: "about", title: "About" });
  assert.throws(() => pages.deletePage("about"), /system page/);
  assert.throws(() => pages.deletePage("404"), /system page/);
});

test("deletePage removes a user-created page", () => {
  const p = pages.createPage({ slug: "doomed", title: "Doomed" });
  assert.ok(p);
  assert.ok(pages.deletePage("doomed"));
  assert.equal(pages.getPageBySlug("doomed"), null);
});

test("updatePage applies sanitization to the body", () => {
  pages.createPage({ slug: "sanitized", title: "X", body_html: "<p>safe</p>" });
  const u = pages.updatePage("sanitized", { body_html: '<p>hi</p><script>alert(1)</script>' });
  assert.equal(u.body_html.includes("<script>"), false);
  assert.match(u.body_html, /<p>hi<\/p>/);
});

test("listPages marks system pages with is_system", () => {
  const list = pages.listPages();
  const about = list.find((p) => p.slug === "about");
  assert.equal(about?.is_system, true);
  const resume = list.find((p) => p.slug === "resume");
  assert.equal(resume?.is_system, false);
});

test("createPage stores published_at when given", () => {
  const future = "2030-01-01T00:00:00.000Z";
  const p = pages.createPage({ slug: "future-page", title: "F", published: 1, published_at: future });
  assert.equal(p.published_at, future);
});

test("createPage defaults published_at to null", () => {
  const p = pages.createPage({ slug: "now-page", title: "N" });
  assert.equal(p.published_at, null);
});

test("updatePage can set and clear published_at", () => {
  pages.createPage({ slug: "togglable", title: "T" });
  const scheduled = pages.updatePage("togglable", { published: 1, published_at: "2030-06-01T12:00:00.000Z" });
  assert.equal(scheduled.published_at, "2030-06-01T12:00:00.000Z");
  const cleared = pages.updatePage("togglable", { published: 1, published_at: null });
  assert.equal(cleared.published_at, null);
});

test("updatePage preserves published_at when field omitted", () => {
  pages.createPage({ slug: "preserve", title: "P", published_at: "2030-01-01T00:00:00.000Z" });
  const updated = pages.updatePage("preserve", { title: "P2" });
  assert.equal(updated.published_at, "2030-01-01T00:00:00.000Z");
});
