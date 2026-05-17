import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { ingestUpload, ingestFile, listMedia, getMediaById, updateAlt, deleteMedia, uploadsDir } from "../services/media.js";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import CSRF from "@fastify/csrf";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";
const csrfTokens = new CSRF();

export default async function adminMediaRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });

  await app.register(fastifyStatic, {
    root: uploadsDir(),
    prefix: `${ADMIN_BASE}/uploads/`,
    decorateReply: false,
  });

  app.get(`${ADMIN_BASE}/media/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/media.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      images: listMedia("image"),
      files: listMedia("file"),
      flash: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  app.get(`${ADMIN_BASE}/api/media.json`, { preHandler: gate }, async () => {
    return { media: listMedia("image") };
  });

  app.get(`${ADMIN_BASE}/api/files.json`, { preHandler: gate }, async () => {
    return { media: listMedia("file") };
  });

  // Upload uses multipart, so CSRF can't live in the standard preHandler
  // (the global preHandler runs before the multipart body is parsed). We
  // verify the token manually after reading the parts.
  app.post(`${ADMIN_BASE}/media/upload`, { preHandler: gate }, async (req, reply) => {
    const part = await req.file();
    if (!part) {
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent("No file in request.")}`);
      return reply;
    }
    const secret = req.session?._csrf;
    const submittedToken = part.fields?._csrf?.value;
    if (!secret || !submittedToken || !csrfTokens.verify(secret, submittedToken)) {
      reply.code(403);
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent("Invalid CSRF token.")}`);
      return reply;
    }
    try {
      const buffer = await part.toBuffer();
      const media = await ingestUpload({
        buffer,
        originalFilename: part.filename,
        alt: typeof part.fields?.alt?.value === "string" ? part.fields.alt.value : null,
      });
      reply.redirect(`${ADMIN_BASE}/media/?msg=uploaded&id=${media.id}`);
    } catch (err) {
      req.log.warn({ err }, "media upload failed");
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/media/upload-file`, { preHandler: gate }, async (req, reply) => {
    const part = await req.file();
    if (!part) {
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent("No file in request.")}`);
      return reply;
    }
    const secret = req.session?._csrf;
    const submittedToken = part.fields?._csrf?.value;
    if (!secret || !submittedToken || !csrfTokens.verify(secret, submittedToken)) {
      reply.code(403);
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent("Invalid CSRF token.")}`);
      return reply;
    }
    try {
      const buffer = await part.toBuffer();
      const media = await ingestFile({
        buffer,
        originalFilename: part.filename,
        alt: typeof part.fields?.alt?.value === "string" ? part.fields.alt.value : null,
      });
      reply.redirect(`${ADMIN_BASE}/media/?msg=uploaded&id=${media.id}`);
    } catch (err) {
      req.log.warn({ err }, "file upload failed");
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/media/:id/alt`, csrfPre, async (req, reply) => {
    const { alt } = req.body || {};
    const ok = updateAlt(req.params.id, alt);
    if (!ok) {
      reply.code(404);
      return "Not found.";
    }
    reply.redirect(`${ADMIN_BASE}/media/?msg=alt-saved`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/media/:id/delete`, csrfPre, async (req, reply) => {
    try {
      const ok = deleteMedia(req.params.id);
      if (!ok) {
        reply.code(404);
        return "Not found.";
      }
      reply.redirect(`${ADMIN_BASE}/media/?msg=deleted`);
    } catch (err) {
      reply.code(err.code === "IN_USE" ? 409 : 500);
      reply.redirect(`${ADMIN_BASE}/media/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });
}
