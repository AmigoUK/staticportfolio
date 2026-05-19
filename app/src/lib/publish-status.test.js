import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePublishFields, statusFromRow, isoToDatetimeLocal } from "./publish-status.js";

test("derivePublishFields: draft clears published_at", () => {
  assert.deepEqual(derivePublishFields({ status: "draft", published_at: "2030-01-01" }), {
    published: 0,
    published_at: null,
  });
});

test("derivePublishFields: published with no date → published_at null", () => {
  assert.deepEqual(derivePublishFields({ status: "published" }), {
    published: 1,
    published_at: null,
  });
});

test("derivePublishFields: published with past date keeps it", () => {
  const out = derivePublishFields({ status: "published", published_at: "2020-06-01T12:00:00Z" });
  assert.equal(out.published, 1);
  assert.equal(out.published_at, "2020-06-01T12:00:00.000Z");
});

test("derivePublishFields: scheduled with future date stores UTC ISO", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const out = derivePublishFields({ status: "scheduled", published_at: future });
  assert.equal(out.published, 1);
  assert.equal(out.published_at, future);
});

test("derivePublishFields: scheduled with missing date rejects", () => {
  assert.throws(() => derivePublishFields({ status: "scheduled", published_at: "" }), /future publish date/);
});

test("derivePublishFields: scheduled with past date rejects", () => {
  assert.throws(
    () => derivePublishFields({ status: "scheduled", published_at: "2020-01-01T00:00:00Z" }),
    /must be in the future/,
  );
});

test("derivePublishFields: unrecognized status falls back to published", () => {
  assert.deepEqual(derivePublishFields({ status: undefined }), { published: 1, published_at: null });
});

test("statusFromRow: published=0 → draft", () => {
  assert.equal(statusFromRow({ published: 0, published_at: null }), "draft");
});

test("statusFromRow: published=1 + null date → published", () => {
  assert.equal(statusFromRow({ published: 1, published_at: null }), "published");
});

test("statusFromRow: published=1 + past date → published", () => {
  assert.equal(statusFromRow({ published: 1, published_at: "2020-06-01T00:00:00Z" }), "published");
});

test("statusFromRow: published=1 + future date → scheduled", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  assert.equal(statusFromRow({ published: 1, published_at: future }), "scheduled");
});

test("isoToDatetimeLocal: null/empty → empty string", () => {
  assert.equal(isoToDatetimeLocal(null), "");
  assert.equal(isoToDatetimeLocal(""), "");
  assert.equal(isoToDatetimeLocal(undefined), "");
});

test("isoToDatetimeLocal: round-trip a known timestamp", () => {
  const d = new Date(2030, 5, 1, 14, 30); // local June 1 2030 14:30
  const out = isoToDatetimeLocal(d.toISOString());
  assert.equal(out, "2030-06-01T14:30");
});
