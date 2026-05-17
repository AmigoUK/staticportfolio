import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listFonts, setActiveFont, getActiveFont, ingestFontUpload, deleteCustomFont, customFontsDir } from "../services/fonts.js";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import CSRF from "@fastify/csrf";
import { mkdirSync } from "node:fs";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";
const csrfTokens = new CSRF();

export default async function adminFontsRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  // Multipart for the font-upload route.
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });

  // Ensure the dir exists before mounting the static plugin on it.
  mkdirSync(customFontsDir(), { recursive: true });
  await app.register(fastifyStatic, {
    root: customFontsDir(),
    prefix: `${ADMIN_BASE}/static/custom-fonts/`,
    decorateReply: false,
  });

  app.get(`${ADMIN_BASE}/fonts/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    const sansFonts = listFonts("sans");
    const monoFonts = listFonts("mono");
    const headerFonts = listFonts("header");
    const customCount = sansFonts.concat(monoFonts).concat(headerFonts).filter((f) => f.source === "custom").length;
    const requestedTab = String(req.query.tab || "picker");
    const activeTab = ["picker", "upload"].includes(requestedTab) ? requestedTab : "picker";
    return renderHtml(reply, "admin/fonts.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      sansFonts,
      monoFonts,
      headerFonts,
      activeSans: getActiveFont("sans"),
      activeMono: getActiveFont("mono"),
      activeHeader: getActiveFont("header"),
      customCount,
      activeTab,
      flash: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  app.post(`${ADMIN_BASE}/fonts/`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    if (body.sans_id) setActiveFont("sans", body.sans_id);
    if (body.mono_id) setActiveFont("mono", body.mono_id);
    if (body.header_id) setActiveFont("header", body.header_id);
    reply.redirect(`${ADMIN_BASE}/fonts/?tab=picker&msg=saved`);
    return reply;
  });

  // Custom font upload — multipart, manual CSRF (same pattern as media upload).
  app.post(`${ADMIN_BASE}/fonts/upload`, { preHandler: gate }, async (req, reply) => {
    const part = await req.file();
    if (!part) {
      reply.redirect(`${ADMIN_BASE}/fonts/?err=${encodeURIComponent("No file in request.")}`);
      return reply;
    }
    const secret = req.session?._csrf;
    const submittedToken = part.fields?._csrf?.value;
    if (!secret || !submittedToken || !csrfTokens.verify(secret, submittedToken)) {
      reply.code(403);
      reply.redirect(`${ADMIN_BASE}/fonts/?err=${encodeURIComponent("Invalid CSRF token.")}`);
      return reply;
    }
    try {
      const buffer = await part.toBuffer();
      const family = part.fields?.family?.value;
      const weight = part.fields?.weight?.value;
      const role = part.fields?.role?.value;
      await ingestFontUpload({ buffer, family, weight, role, originalFilename: part.filename });
      reply.redirect(`${ADMIN_BASE}/fonts/?tab=upload&msg=uploaded`);
    } catch (err) {
      req.log.warn({ err }, "font upload failed");
      reply.redirect(`${ADMIN_BASE}/fonts/?tab=upload&err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/fonts/:id/delete`, csrfPre, async (req, reply) => {
    try {
      const ok = deleteCustomFont(req.params.id);
      if (!ok) { reply.code(404); return "Not found."; }
      reply.redirect(`${ADMIN_BASE}/fonts/?tab=upload&msg=deleted`);
    } catch (err) {
      reply.redirect(`${ADMIN_BASE}/fonts/?tab=upload&err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });
}
