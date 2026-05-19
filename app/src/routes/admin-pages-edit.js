import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listPages, getPageBySlug, createPage, updatePage, deletePage } from "../services/pages.js";
import { derivePublishFields, statusFromRow, isoToDatetimeLocal } from "../lib/publish-status.js";

function decorate(row) {
  if (!row) return row;
  return { ...row, status: statusFromRow(row), published_at_local: isoToDatetimeLocal(row.published_at) };
}

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
      error: req.query.err || null,
    });
  });

  app.get(`${ADMIN_BASE}/pages/new`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/page-edit.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      page: { slug: "", title: "", meta_description: "", body_html: "", published: 1, published_at: null, status: "published", published_at_local: "" },
      mode: "new",
    });
  });

  app.post(`${ADMIN_BASE}/pages/new`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    try {
      const { published, published_at } = derivePublishFields(body);
      const created = createPage({
        slug: body.slug,
        title: body.title,
        meta_description: body.meta_description,
        body_html: body.body_html,
        published,
        published_at,
      });
      reply.redirect(`${ADMIN_BASE}/pages/?msg=created&slug=${encodeURIComponent(created.slug)}`);
    } catch (err) {
      reply.redirect(`${ADMIN_BASE}/pages/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
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
      page: decorate(page),
      mode: "edit",
    });
  });

  app.post(`${ADMIN_BASE}/pages/:slug`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    try {
      const { published, published_at } = derivePublishFields(body);
      const updated = updatePage(req.params.slug, {
        title: body.title,
        meta_description: body.meta_description,
        body_html: body.body_html,
        published,
        published_at,
      });
      if (!updated) { reply.code(404); return "Page not found."; }
      reply.redirect(`${ADMIN_BASE}/pages/?msg=saved&slug=${encodeURIComponent(req.params.slug)}`);
    } catch (err) {
      reply.redirect(`${ADMIN_BASE}/pages/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/pages/:slug/delete`, csrfPre, async (req, reply) => {
    try {
      const ok = deletePage(req.params.slug);
      if (!ok) {
        reply.redirect(`${ADMIN_BASE}/pages/?err=${encodeURIComponent("Page not found.")}`);
      } else {
        reply.redirect(`${ADMIN_BASE}/pages/?msg=deleted`);
      }
    } catch (err) {
      reply.redirect(`${ADMIN_BASE}/pages/?err=${encodeURIComponent(err.message)}`);
    }
    return reply;
  });
}
