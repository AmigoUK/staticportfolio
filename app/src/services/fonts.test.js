import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";

const fonts = await import("./fonts.js");
const settings = await import("./settings.js");

test("seedFonts inserts all registry entries and activates the first of each role", () => {
  const inserted = fonts.seedFonts();
  // 4 sans + 4 mono + 4 header = 12 total. (sans-style families seeded into header too.)
  assert.equal(inserted, 12);
  const sans = fonts.listFonts("sans");
  const mono = fonts.listFonts("mono");
  const header = fonts.listFonts("header");
  assert.equal(sans.length, 4);
  assert.equal(mono.length, 4);
  assert.equal(header.length, 4);
  assert.equal(sans.filter((f) => f.is_active).length, 1);
  assert.equal(mono.filter((f) => f.is_active).length, 1);
  assert.equal(header.filter((f) => f.is_active).length, 1);
});

test("setActiveFont('header', id) requires a header-role row", () => {
  const header = fonts.listFonts("header");
  const target = header.find((f) => !f.is_active);
  const updated = fonts.setActiveFont("header", target.id);
  assert.equal(updated?.id, target.id);
  assert.equal(fonts.listFonts("header").find((f) => f.is_active).id, target.id);

  // Trying to set a mono-role row as header → null.
  const monoFont = fonts.listFonts("mono")[0];
  assert.equal(fonts.setActiveFont("header", monoFont.id), null);
});

test("FONT_ROLES export lists exactly sans, mono, header", () => {
  assert.deepEqual([...fonts.FONT_ROLES].sort(), ["header", "mono", "sans"]);
});

test("seedFonts is idempotent", () => {
  const before = fonts.listFonts().length;
  const inserted = fonts.seedFonts();
  assert.equal(inserted, 0);
  assert.equal(fonts.listFonts().length, before);
});

test("listFonts orders bundled before system", () => {
  const sans = fonts.listFonts("sans");
  const firstSystem = sans.findIndex((f) => f.source === "system");
  const lastBundled = sans.map((f) => f.source).lastIndexOf("bundled");
  assert.ok(lastBundled < firstSystem, "bundled entries should come before system entries");
});

test("setActiveFont switches active and rejects role mismatch", () => {
  const sans = fonts.listFonts("sans");
  const target = sans.find((f) => !f.is_active);
  const updated = fonts.setActiveFont("sans", target.id);
  assert.equal(updated?.id, target.id);
  const after = fonts.listFonts("sans");
  assert.equal(after.find((f) => f.is_active).id, target.id);
  assert.equal(settings.getSettingNum("font_sans_id"), target.id);

  const monoFont = fonts.listFonts("mono")[0];
  const mismatch = fonts.setActiveFont("sans", monoFont.id);
  assert.equal(mismatch, null);
});

test("familyCssValue wraps bundled families in quotes; system uses fallback only", () => {
  const sans = fonts.listFonts("sans");
  const bundled = sans.find((f) => f.source === "bundled");
  const system = sans.find((f) => f.source === "system");
  const bundledCss = fonts.familyCssValue(bundled);
  const systemCss = fonts.familyCssValue(system);
  assert.match(bundledCss, new RegExp(`"${bundled.family}"`));
  assert.ok(!systemCss.includes(`"${system.family}"`), "system stack should not include the system pseudo-family name in quotes");
});
