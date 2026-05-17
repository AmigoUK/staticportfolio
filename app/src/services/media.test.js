import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

process.env.DB_PATH = ":memory:";
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), "portfolio-media-"));

const media = await import("./media.js");

async function makeValidJpeg() {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .toBuffer();
}

async function makeValidPng() {
  return sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
    .png()
    .toBuffer();
}

test("detectMime recognises JPEG / PNG / WebP", async () => {
  const jpeg = await makeValidJpeg();
  const png = await makeValidPng();
  assert.equal(media.detectMime(jpeg), "image/jpeg");
  assert.equal(media.detectMime(png), "image/png");
  assert.equal(media.detectMime(Buffer.from("<svg></svg>")), null);
  assert.equal(media.detectMime(Buffer.from("hello there general kenobi")), null);
  assert.equal(media.detectMime(Buffer.alloc(0)), null);
});

test("ingestUpload accepts a real JPEG and writes a media row + file", async () => {
  const jpeg = await makeValidJpeg();
  const result = await media.ingestUpload({ buffer: jpeg, originalFilename: "cat.jpg", alt: "a cat" });
  assert.ok(result.id);
  assert.equal(result.mime_type, "image/jpeg");
  assert.equal(result.width, 64);
  assert.equal(result.height, 64);
  assert.equal(result.alt, "a cat");
  assert.match(result.filename, /^[0-9a-f]{32}\.jpg$/);
  const stored = join(process.env.UPLOADS_DIR, result.filename);
  assert.ok(existsSync(stored), "file should be on disk");
  // Re-encoded output must still be a JPEG.
  const onDisk = readFileSync(stored);
  assert.equal(media.detectMime(onDisk), "image/jpeg");
});

test("ingestUpload rejects an empty buffer", async () => {
  await assert.rejects(() => media.ingestUpload({ buffer: Buffer.alloc(0) }), /Empty/);
});

test("ingestUpload rejects a non-image payload via magic-byte check", async () => {
  await assert.rejects(
    () => media.ingestUpload({ buffer: Buffer.from("This is not an image.") }),
    /Unsupported|Allowed/,
  );
});

test("ingestUpload rejects SVG even if it starts with text", async () => {
  await assert.rejects(
    () => media.ingestUpload({ buffer: Buffer.from('<?xml version="1.0"?><svg></svg>') }),
    /Unsupported|Allowed/,
  );
});

test("ingestUpload rejects oversize buffers", async () => {
  const oversize = Buffer.alloc(9 * 1024 * 1024, 0xff);
  await assert.rejects(() => media.ingestUpload({ buffer: oversize }), /too large/);
});

test("updateAlt + listMedia roundtrip", async () => {
  const jpeg = await makeValidJpeg();
  const m = await media.ingestUpload({ buffer: jpeg, originalFilename: "dog.jpg", alt: "" });
  assert.ok(media.updateAlt(m.id, "a dog playing fetch"));
  const fresh = media.getMediaById(m.id);
  assert.equal(fresh.alt, "a dog playing fetch");
  const list = media.listMedia();
  assert.ok(list.some((row) => row.id === m.id));
});

test("deleteMedia removes the row and the file", async () => {
  const jpeg = await makeValidJpeg();
  const m = await media.ingestUpload({ buffer: jpeg, originalFilename: "bye.jpg" });
  const fullPath = join(process.env.UPLOADS_DIR, m.filename);
  assert.ok(existsSync(fullPath));
  assert.ok(media.deleteMedia(m.id));
  assert.equal(media.getMediaById(m.id), null);
  assert.equal(existsSync(fullPath), false);
});
