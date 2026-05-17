import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import {
  listThemes,
  getThemeById,
  cloneTheme,
  updateTheme,
  activateTheme,
  deleteTheme,
  TOKEN_KEYS,
} from "../services/themes.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminThemesRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/themes/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/theme-list.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      themes: listThemes(),
      flash: req.query.msg || null,
    });
  });

  app.get(`${ADMIN_BASE}/themes/:id/edit`, { preHandler: gate }, async (req, reply) => {
    const theme = getThemeById(req.params.id);
    if (!theme) {
      reply.code(404);
      return "Theme not found.";
    }
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/theme-edit.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      theme,
      tokenKeys: TOKEN_KEYS,
    });
  });

  app.post(`${ADMIN_BASE}/themes/:id/clone`, csrfPre, async (req, reply) => {
    const cloned = cloneTheme(req.params.id);
    if (!cloned) {
      reply.code(404);
      return "Theme not found.";
    }
    reply.redirect(`${ADMIN_BASE}/themes/${cloned.id}/edit`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/themes/:id`, csrfPre, async (req, reply) => {
    const { name, tokens_json } = req.body || {};
    let tokens;
    try {
      tokens = JSON.parse(tokens_json);
    } catch {
      reply.code(400);
      return "tokens_json invalid";
    }
    try {
      updateTheme(req.params.id, { name, tokens });
    } catch (e) {
      reply.code(e.code === "PRESET_LOCKED" ? 403 : 400);
      return e.message;
    }
    reply.redirect(`${ADMIN_BASE}/themes/?msg=saved`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/themes/:id/activate`, csrfPre, async (req, reply) => {
    const t = activateTheme(req.params.id);
    if (!t) {
      reply.code(404);
      return "Theme not found.";
    }
    reply.redirect(`${ADMIN_BASE}/themes/?msg=activated`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/themes/:id/delete`, csrfPre, async (req, reply) => {
    try {
      const ok = deleteTheme(req.params.id);
      if (!ok) {
        reply.code(404);
        return "Theme not found.";
      }
    } catch (e) {
      reply.code(e.code === "PRESET_LOCKED" || e.code === "ACTIVE_LOCKED" ? 403 : 400);
      return e.message;
    }
    reply.redirect(`${ADMIN_BASE}/themes/?msg=deleted`);
    return reply;
  });
}
