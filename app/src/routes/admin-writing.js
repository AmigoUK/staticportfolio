import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { listPosts, getPostById, createPost, updatePost, deletePost } from "../services/posts.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminWritingRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/writing/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/writing-list.eta", {
      adminBase: ADMIN_BASE, user: req.currentUser, csrfToken,
      posts: listPosts(), flash: req.query.msg || null,
    });
  });

  app.get(`${ADMIN_BASE}/writing/new`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/writing-edit.eta", {
      adminBase: ADMIN_BASE, user: req.currentUser, csrfToken,
      post: { id: null, slug: "", title: "", dek: "", body_html: "", meta_description: "", published: 0, published_at: new Date().toISOString().slice(0, 10) },
      mode: "new",
    });
  });

  app.get(`${ADMIN_BASE}/writing/:id/edit`, { preHandler: gate }, async (req, reply) => {
    const post = getPostById(req.params.id);
    if (!post) { reply.code(404); return "Not found."; }
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/writing-edit.eta", {
      adminBase: ADMIN_BASE, user: req.currentUser, csrfToken, post, mode: "edit",
    });
  });

  app.post(`${ADMIN_BASE}/writing/new`, csrfPre, async (req, reply) => {
    try {
      const created = createPost(normalize(req.body));
      reply.redirect(`${ADMIN_BASE}/writing/?msg=created&slug=${encodeURIComponent(created.slug)}`);
    } catch (err) {
      reply.code(err.code === "DUP_SLUG" || err.code === "BAD_SLUG" ? 400 : 500);
      return err.message;
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/writing/:id`, csrfPre, async (req, reply) => {
    try {
      const updated = updatePost(req.params.id, normalize(req.body));
      if (!updated) { reply.code(404); return "Not found."; }
      reply.redirect(`${ADMIN_BASE}/writing/?msg=saved&slug=${encodeURIComponent(updated.slug)}`);
    } catch (err) {
      reply.code(err.code === "DUP_SLUG" || err.code === "BAD_SLUG" ? 400 : 500);
      return err.message;
    }
    return reply;
  });

  app.post(`${ADMIN_BASE}/writing/:id/delete`, csrfPre, async (req, reply) => {
    deletePost(req.params.id);
    reply.redirect(`${ADMIN_BASE}/writing/?msg=deleted`);
    return reply;
  });
}

function normalize(body) {
  return {
    slug: body.slug,
    title: body.title,
    dek: body.dek,
    body_html: body.body_html,
    meta_description: body.meta_description,
    published: body.published === "1" || body.published === "on",
    published_at: body.published_at || null,
  };
}
