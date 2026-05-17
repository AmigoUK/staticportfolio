import { getDb } from "../db/connect.js";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, statSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const UPLOADS = process.env.UPLOADS_DIR ? resolve(process.env.UPLOADS_DIR) : join(REPO_ROOT, "uploads");
const MAX_BYTES = 8 * 1024 * 1024;

const SIGS = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/webp": [
    // RIFF....WEBP
    [
      [0x52, 0x49, 0x46, 0x46],
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  ],
};

export function detectMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (matchSig(buf, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchSig(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matchSig(buf, 0, [0x52, 0x49, 0x46, 0x46]) && matchSig(buf, 8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

function matchSig(buf, offset, sig) {
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

function extensionForMime(mime) {
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" })[mime] || ".bin";
}

export async function ingestUpload({ buffer, originalFilename, alt = null }) {
  if (!buffer || buffer.length === 0) {
    const e = new Error("Empty upload."); e.code = "EMPTY"; throw e;
  }
  if (buffer.length > MAX_BYTES) {
    const e = new Error(`Upload too large: ${buffer.length} > ${MAX_BYTES} bytes.`); e.code = "TOO_LARGE"; throw e;
  }
  const detectedMime = detectMime(buffer);
  if (!detectedMime) {
    const e = new Error("Unsupported or unrecognised image format. Allowed: JPEG, PNG, WebP."); e.code = "BAD_MAGIC"; throw e;
  }

  let pipeline = sharp(buffer, { failOn: "error" }).rotate();
  if (detectedMime === "image/jpeg") pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  else if (detectedMime === "image/png") pipeline = pipeline.png({ palette: true });
  else if (detectedMime === "image/webp") pipeline = pipeline.webp({ quality: 82 });

  const sharpOutput = await pipeline.toBuffer({ resolveWithObject: true });
  const { data, info } = sharpOutput;

  mkdirSync(UPLOADS, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}${extensionForMime(detectedMime)}`;
  const fullPath = join(UPLOADS, filename);
  writeFileSync(fullPath, data);

  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO media (filename, original_filename, mime_type, width, height, bytes, alt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(filename, originalFilename || null, detectedMime, info.width, info.height, info.size || data.length, alt);
  return getMediaById(result.lastInsertRowid);
}

export function listMedia() {
  const db = getDb();
  return db.prepare("SELECT * FROM media ORDER BY uploaded_at DESC, id DESC").all();
}

export function getMediaById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM media WHERE id = ?").get(Number(id)) || null;
}

export function updateAlt(id, alt) {
  const db = getDb();
  const info = db.prepare("UPDATE media SET alt = ? WHERE id = ?").run(String(alt || "").slice(0, 500), Number(id));
  return info.changes > 0;
}

export function deleteMedia(id) {
  const db = getDb();
  const media = getMediaById(id);
  if (!media) return false;

  const inUse = db.prepare("SELECT 1 FROM work_entries WHERE cover_media_id = ? LIMIT 1").get(media.id);
  if (inUse) {
    const e = new Error("Cannot delete media: it's the cover of a work entry. Replace the cover first."); e.code = "IN_USE"; throw e;
  }

  db.prepare("DELETE FROM media WHERE id = ?").run(media.id);
  const fullPath = join(UPLOADS, media.filename);
  if (existsSync(fullPath)) {
    try {
      unlinkSync(fullPath);
    } catch (_) { /* tolerate already-gone */ }
  }
  return true;
}

export function uploadsDir() {
  return UPLOADS;
}
