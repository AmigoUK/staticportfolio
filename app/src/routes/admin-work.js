import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listWork, getWorkById, createWork, updateWork, deleteWork } from "../services/work.js";
import { listMedia } from "../services/media.js";
import { derivePublishFields, statusFromRow, isoToDatetimeLocal } from "../lib/publish-status.js";

function decorate(row) {
  if (!row) return row;
  return { ...row, status: statusFromRow(row), published_at_local: isoToDatetimeLocal(row.published_at) };
}

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminWorkRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/work/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/work-list.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      work: listWork(),
      flash: req.query.msg || null,
    });
  });

  app.get(`${ADMIN_BASE}/work/new`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/work-edit.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      entry: { id: null, slug: "", title: "", kicker: "", eyebrow: "", lede: "", article_meta: "", body_html: "", cover_media_id: null, cover_filename: null, cover_alt: "", tags_csv: "", sort_order: 0, is_disabled: 0, meta_description: "", published: 1, published_at: null, status: "published", published_at_local: "" },
      media: listMedia(),
      mode: "new",
    });
  });

  app.get(`${ADMIN_BASE}/work/:id/edit`, { preHandler: gate }, async (req, reply) => {
    const entry = getWorkById(req.params.id);
    if (!entry) { reply.code(404); return "Not found."; }
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/work-edit.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      entry: decorate(entry),
      media: listMedia(),
      mode: "edit",
    });
  });

  app.post(`${ADMIN_BASE}/work/new`, csrfPre, async (req, reply) => {
    try {
      const created = createWork(normalize(req.body));
      reply.redirect(`${ADMIN_BASE}/work/?msg=created&slug=${encodeURIComponent(created.slug)}`);
    } catch (err) {
      reply.code(err.code === "DUP_SLUG" || err.code === "BAD_SLUG" ? 400 : 500);
      return err.message;
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/work/:id`, csrfPre, async (req, reply) => {
    try {
      const updated = updateWork(req.params.id, normalize(req.body));
      if (!updated) { reply.code(404); return "Not found."; }
      reply.redirect(`${ADMIN_BASE}/work/?msg=saved&slug=${encodeURIComponent(updated.slug)}`);
    } catch (err) {
      reply.code(err.code === "DUP_SLUG" || err.code === "BAD_SLUG" ? 400 : 500);
      return err.message;
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/work/:id/delete`, csrfPre, async (req, reply) => {
    deleteWork(req.params.id);
    reply.redirect(`${ADMIN_BASE}/work/?msg=deleted`);
    return reply;
  });
}

function normalize(body) {
  const { published, published_at } = derivePublishFields(body);
  return {
    slug: body.slug,
    title: body.title,
    kicker: body.kicker,
    eyebrow: body.eyebrow,
    lede: body.lede,
    article_meta: body.article_meta,
    body_html: body.body_html,
    cover_media_id: body.cover_media_id ? Number(body.cover_media_id) : null,
    cover_filename: body.cover_filename || null,
    cover_alt: body.cover_alt,
    tags_csv: body.tags_csv,
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
    is_disabled: body.is_disabled === "1" || body.is_disabled === "on",
    meta_description: body.meta_description,
    published,
    published_at,
  };
}
