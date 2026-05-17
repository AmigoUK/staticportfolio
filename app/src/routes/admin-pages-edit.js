import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listPages, getPageBySlug, upsertPage } from "../services/pages.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminPagesEditRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/pages/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/pages-list.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      pages: listPages(),
      flash: req.query.msg || null,
    });
  });

  app.get(`${ADMIN_BASE}/pages/:slug/edit`, { preHandler: gate }, async (req, reply) => {
    const page = getPageBySlug(req.params.slug);
    if (!page) {
      reply.code(404);
      return "Page not found.";
    }
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/page-edit.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      page,
    });
  });

  app.post(`${ADMIN_BASE}/pages/:slug`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    try {
      upsertPage({
        slug: req.params.slug,
        title: body.title,
        meta_description: body.meta_description,
        body_html: body.body_html,
        published: body.published === "1" || body.published === "on" ? 1 : 0,
      });
      reply.redirect(`${ADMIN_BASE}/pages/?msg=saved&slug=${encodeURIComponent(req.params.slug)}`);
    } catch (err) {
      reply.code(400);
      return `Save failed: ${err.message}`;
    }
    return reply;
  });
}
