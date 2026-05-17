import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listFonts, setActiveFont, getActiveFont } from "../services/fonts.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminFontsRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/fonts/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/fonts.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      sansFonts: listFonts("sans"),
      monoFonts: listFonts("mono"),
      activeSans: getActiveFont("sans"),
      activeMono: getActiveFont("mono"),
      flash: req.query.msg || null,
    });
  });

  app.post(`${ADMIN_BASE}/fonts/`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    if (body.sans_id) setActiveFont("sans", body.sans_id);
    if (body.mono_id) setActiveFont("mono", body.mono_id);
    reply.redirect(`${ADMIN_BASE}/fonts/?msg=saved`);
    return reply;
  });
}
