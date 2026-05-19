import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listPosts, getPostById, createPost, updatePost, deletePost } from "../services/posts.js";
import { derivePublishFields, statusFromRow, isoToDatetimeLocal } from "../lib/publish-status.js";

function decorate(row) {
  if (!row) return row;
  return { ...row, status: statusFromRow(row), published_at_local: isoToDatetimeLocal(row.published_at) };
}

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminWritingRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/blog/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/writing-list.eta", {
      adminBase: ADMIN_BASE, user: req.currentUser, csrfToken,
      posts: listPosts(), flash: req.query.msg || null,
    });
  });

  app.get(`${ADMIN_BASE}/blog/new`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/writing-edit.eta", {
      adminBase: ADMIN_BASE, user: req.currentUser, csrfToken,
      post: { id: null, slug: "", title: "", dek: "", body_html: "", meta_description: "", published: 0, published_at: null, status: "draft", published_at_local: "" },
      mode: "new",
    });
  });

  app.get(`${ADMIN_BASE}/blog/:id/edit`, { preHandler: gate }, async (req, reply) => {
    const post = getPostById(req.params.id);
    if (!post) { reply.code(404); return "Not found."; }
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/writing-edit.eta", {
      adminBase: ADMIN_BASE, user: req.currentUser, csrfToken, post: decorate(post), mode: "edit",
    });
  });

  app.post(`${ADMIN_BASE}/blog/new`, csrfPre, async (req, reply) => {
    try {
      const created = createPost(normalize(req.body));
      reply.redirect(`${ADMIN_BASE}/blog/?msg=created&slug=${encodeURIComponent(created.slug)}`);
    } catch (err) {
      reply.code(err.code === "DUP_SLUG" || err.code === "BAD_SLUG" ? 400 : 500);
      return err.message;
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/blog/:id`, csrfPre, async (req, reply) => {
    try {
      const updated = updatePost(req.params.id, normalize(req.body));
      if (!updated) { reply.code(404); return "Not found."; }
      reply.redirect(`${ADMIN_BASE}/blog/?msg=saved&slug=${encodeURIComponent(updated.slug)}`);
    } catch (err) {
      reply.code(err.code === "DUP_SLUG" || err.code === "BAD_SLUG" ? 400 : 500);
      return err.message;
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/blog/:id/delete`, csrfPre, async (req, reply) => {
    deletePost(req.params.id);
    reply.redirect(`${ADMIN_BASE}/blog/?msg=deleted`);
    return reply;
  });
}

function normalize(body) {
  const { published, published_at } = derivePublishFields(body);
  return {
    slug: body.slug,
    title: body.title,
    dek: body.dek,
    body_html: body.body_html,
    meta_description: body.meta_description,
    published,
    published_at,
  };
}
