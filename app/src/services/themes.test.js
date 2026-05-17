import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";

const themes = await import("./themes.js");
const settings = await import("./settings.js");

before(() => {
  // Force first access; schema applied lazily.
  themes.PRESET_THEMES.length;
});

test("seedPresets inserts 5 presets and activates one on first run", () => {
  const inserted = themes.seedPresets();
  assert.equal(inserted, themes.PRESET_THEMES.length);
  assert.equal(inserted, 5);
  const list = themes.listThemes();
  assert.equal(list.length, 5);
  assert.equal(list.filter((t) => t.is_preset).length, 5);
  assert.equal(list.filter((t) => t.is_active).length, 1);
  assert.ok(settings.getSettingNum("active_theme_id"));
});

test("seedPresets is idempotent", () => {
  const inserted = themes.seedPresets();
  assert.equal(inserted, 0);
  assert.equal(themes.listThemes().length, 5);
});

test("cloneTheme creates an editable non-preset copy", () => {
  const before = themes.listThemes().length;
  const src = themes.listThemes().find((t) => t.is_preset);
  const cloned = themes.cloneTheme(src.id);
  assert.ok(cloned);
  assert.equal(cloned.is_preset, 0);
  assert.match(cloned.name, /^Copy of /);
  assert.equal(themes.listThemes().length, before + 1);
});

test("updateTheme rejects edits to preset themes", () => {
  const preset = themes.listThemes().find((t) => t.is_preset);
  assert.throws(
    () => themes.updateTheme(preset.id, { name: "Hacked", tokens: themes.PRESET_THEMES[0].tokens }),
    /PRESET_LOCKED|preset/i,
  );
});

test("updateTheme rejects invalid hex tokens", () => {
  const clone = themes.cloneTheme(themes.listThemes().find((t) => t.is_preset).id);
  const badTokens = JSON.parse(JSON.stringify(themes.PRESET_THEMES[0].tokens));
  badTokens.light.bg = "rgb(0,0,0)";
  assert.throws(() => themes.updateTheme(clone.id, { name: "ok", tokens: badTokens }), /hex/i);
});

test("activateTheme updates active_theme_id", () => {
  const customs = themes.listThemes().filter((t) => !t.is_preset);
  assert.ok(customs.length > 0);
  const target = customs[0];
  themes.activateTheme(target.id);
  const list = themes.listThemes();
  assert.equal(list.find((t) => t.is_active).id, target.id);
});

test("deleteTheme refuses to delete the active theme", () => {
  const active = themes.listThemes().find((t) => t.is_active);
  if (active.is_preset) return; // skip when active happens to be preset
  assert.throws(() => themes.deleteTheme(active.id), /ACTIVE_LOCKED|active/i);
});

test("deleteTheme refuses to delete a preset", () => {
  const preset = themes.listThemes().find((t) => t.is_preset);
  assert.throws(() => themes.deleteTheme(preset.id), /PRESET_LOCKED|preset/i);
});

test("settings.set + get + getAll roundtrip", () => {
  settings.setSetting("test.string", "hello");
  settings.setSetting("test.num", 42);
  settings.setSetting("test.obj", { a: 1 });
  assert.equal(settings.getSetting("test.string"), "hello");
  assert.equal(settings.getSettingNum("test.num"), 42);
  assert.deepEqual(settings.getSetting("test.obj"), { a: 1 });
  assert.equal(settings.getSetting("test.missing", "fallback"), "fallback");
  const all = settings.getAllSettings();
  assert.equal(all["test.string"], "hello");
});

test("setMultipleSettings is atomic", () => {
  settings.setMultipleSettings({ "bulk.a": "1", "bulk.b": "2", "bulk.c": "3" });
  assert.equal(settings.getSetting("bulk.a"), "1");
  assert.equal(settings.getSetting("bulk.b"), "2");
  assert.equal(settings.getSetting("bulk.c"), "3");
});
