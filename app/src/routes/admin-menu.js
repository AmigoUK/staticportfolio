import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import {
  listAllForAdmin,
  listPotentialParents,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  moveUp,
  moveDown,
  MENU_STYLES,
  FEATURED_STYLES,
} from "../services/menu.js";
import { getSetting, setSetting } from "../services/settings.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminMenuRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/menu/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/menu.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      items: listAllForAdmin(),
      parents: listPotentialParents(),
      activeStyle: getSetting("menu.style") || "underline-slide",
      activeFeaturedStyle: getSetting("featured.style") || "star-prefix",
      styles: MENU_STYLES,
      featuredStyles: FEATURED_STYLES,
      flash: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  app.post(`${ADMIN_BASE}/menu/style`, csrfPre, async (req, reply) => {
    const { style } = req.body || {};
    if (!MENU_STYLES.includes(style)) {
      reply.redirect(`${ADMIN_BASE}/menu/?err=${encodeURIComponent("Unknown menu style.")}`);
      return reply;
    }
    setSetting("menu.style", style);
    reply.redirect(`${ADMIN_BASE}/menu/?msg=style-saved`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/menu/featured-style`, csrfPre, async (req, reply) => {
    const { style } = req.body || {};
    if (!FEATURED_STYLES.includes(style)) {
      reply.redirect(`${ADMIN_BASE}/menu/?err=${encodeURIComponent("Unknown featured style.")}`);
      return reply;
    }
    setSetting("featured.style", style);
    reply.redirect(`${ADMIN_BASE}/menu/?msg=featured-style-saved`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/menu/new`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    try {
      createMenuItem({
        label: body.label,
        href: body.href,
        open_new_tab: body.open_new_tab === "1" || body.open_new_tab === "on",
        is_visible: body.is_visible === undefined ? true : (body.is_visible === "1" || body.is_visible === "on"),
        parent_id: body.parent_id || null,
        is_featured: body.is_featured === "1" || body.is_featured === "on",
      });
      reply.redirect(`${ADMIN_BASE}/menu/?msg=created`);
    } catch (err) {
      reply.redirect(`${ADMIN_BASE}/menu/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/menu/:id`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    try {
      const updated = updateMenuItem(req.params.id, {
        label: body.label,
        href: body.href,
        open_new_tab: body.open_new_tab === "1" || body.open_new_tab === "on",
        is_visible: body.is_visible === "1" || body.is_visible === "on",
        parent_id: body.parent_id || null,
        is_featured: body.is_featured === "1" || body.is_featured === "on",
      });
      if (!updated) { reply.code(404); return "Not found."; }
      reply.redirect(`${ADMIN_BASE}/menu/?msg=saved`);
    } catch (err) {
      reply.redirect(`${ADMIN_BASE}/menu/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/menu/:id/delete`, csrfPre, async (req, reply) => {
    deleteMenuItem(req.params.id);
    reply.redirect(`${ADMIN_BASE}/menu/?msg=deleted`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/menu/:id/up`, csrfPre, async (req, reply) => {
    moveUp(req.params.id);
    reply.redirect(`${ADMIN_BASE}/menu/?msg=reordered`);
    return reply;
  });

  app.post(`${ADMIN_BASE}/menu/:id/down`, csrfPre, async (req, reply) => {
    moveDown(req.params.id);
    reply.redirect(`${ADMIN_BASE}/menu/?msg=reordered`);
    return reply;
  });
}
