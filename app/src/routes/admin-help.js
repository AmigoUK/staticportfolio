import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminHelpRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);

  app.get(`${ADMIN_BASE}/help/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/help.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      anchor: req.query.q || null,
    });
  });
}
