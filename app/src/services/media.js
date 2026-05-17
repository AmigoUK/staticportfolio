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

export function detectMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (matchSig(buf, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchSig(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matchSig(buf, 0, [0x52, 0x49, 0x46, 0x46]) && matchSig(buf, 8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  // PDF: %PDF-
  if (matchSig(buf, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  // ZIP (also DOCX/XLSX/PPTX, ODT, JAR, etc.): "PK\x03\x04" or "PK\x05\x06" or "PK\x07\x08"
  if (matchSig(buf, 0, [0x50, 0x4b, 0x03, 0x04]) || matchSig(buf, 0, [0x50, 0x4b, 0x05, 0x06]) || matchSig(buf, 0, [0x50, 0x4b, 0x07, 0x08])) return "application/zip";
  // MP3 ID3: "ID3"
  if (matchSig(buf, 0, [0x49, 0x44, 0x33])) return "audio/mpeg";
  // MP3 frame sync: 0xFF 0xFB / 0xFA / 0xF3 / 0xF2
  if (buf[0] === 0xff && (buf[1] === 0xfb || buf[1] === 0xfa || buf[1] === 0xf3 || buf[1] === 0xf2)) return "audio/mpeg";
  // MP4 / MOV: "....ftyp" at offset 4
  if (matchSig(buf, 4, [0x66, 0x74, 0x79, 0x70])) return "video/mp4";
  return null;
}

function matchSig(buf, offset, sig) {
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

function extensionForMime(mime) {
  return ({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "audio/mpeg": ".mp3",
    "video/mp4": ".mp4",
  })[mime] || ".bin";
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_MIMES = new Set(["application/pdf", "application/zip", "audio/mpeg", "video/mp4"]);
const FILE_MAX_BYTES = 32 * 1024 * 1024;

export async function ingestUpload({ buffer, originalFilename, alt = null }) {
  if (!buffer || buffer.length === 0) {
    const e = new Error("Empty upload."); e.code = "EMPTY"; throw e;
  }
  if (buffer.length > MAX_BYTES) {
    const e = new Error(`Upload too large: ${buffer.length} > ${MAX_BYTES} bytes.`); e.code = "TOO_LARGE"; throw e;
  }
  const detectedMime = detectMime(buffer);
  if (!detectedMime || !IMAGE_MIMES.has(detectedMime)) {
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
      "INSERT INTO media (filename, original_filename, mime_type, width, height, bytes, alt, kind) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'image')",
    )
    .run(filename, originalFilename || null, detectedMime, info.width, info.height, info.size || data.length, alt);
  return getMediaById(result.lastInsertRowid);
}

// Generic file upload (PDF, ZIP, MP3, MP4). Stored under uploads/, copied
// to public/assets/files/ on publish.
export async function ingestFile({ buffer, originalFilename, alt = null }) {
  if (!buffer || buffer.length === 0) {
    const e = new Error("Empty upload."); e.code = "EMPTY"; throw e;
  }
  if (buffer.length > FILE_MAX_BYTES) {
    const e = new Error(`Upload too large: ${buffer.length} > ${FILE_MAX_BYTES} bytes.`); e.code = "TOO_LARGE"; throw e;
  }
  const detectedMime = detectMime(buffer);
  if (!detectedMime || !FILE_MIMES.has(detectedMime)) {
    const e = new Error("Unsupported file type. Allowed: PDF, ZIP, MP3, MP4."); e.code = "BAD_MAGIC"; throw e;
  }
  mkdirSync(UPLOADS, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}${extensionForMime(detectedMime)}`;
  const fullPath = join(UPLOADS, filename);
  writeFileSync(fullPath, buffer);

  const db = getDb();
  const label = (alt && alt.trim()) || originalFilename || filename;
  const result = db
    .prepare(
      "INSERT INTO media (filename, original_filename, mime_type, width, height, bytes, alt, kind) " +
        "VALUES (?, ?, ?, NULL, NULL, ?, ?, 'file')",
    )
    .run(filename, originalFilename || null, detectedMime, buffer.length, label);
  return getMediaById(result.lastInsertRowid);
}

export function listMedia(kind) {
  const db = getDb();
  if (kind === "image" || kind === "file") {
    return db.prepare("SELECT * FROM media WHERE kind = ? ORDER BY uploaded_at DESC, id DESC").all(kind);
  }
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
