import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminPagesRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);

  app.get(`${ADMIN_BASE}/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/dashboard.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
    });
  });

  for (const slug of ["pages", "work", "writing"]) {
    app.get(`${ADMIN_BASE}/${slug}/`, { preHandler: gate }, async (_req, reply) => {
      const csrfToken = await reply.generateCsrf();
      reply.type("text/html; charset=utf-8");
      return `<!doctype html><meta charset="utf-8"><title>${slug}</title>
<p>Section "${slug}" lands in a later checkpoint. Token: <code>${csrfToken.slice(0, 12)}…</code></p>
<p><a href="${ADMIN_BASE}/">back to dashboard</a></p>`;
    });
  }
}
