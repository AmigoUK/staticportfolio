import { requireAdmin } from "../lib/auth.js";
import { publish } from "../services/publish.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminPublishRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.post(`${ADMIN_BASE}/publish`, csrfPre, async (req, reply) => {
    try {
      const result = await publish({ logger: req.log });
      reply.redirect(
        `${ADMIN_BASE}/?published=${result.pagesWritten}&fonts=${result.fontsCopied}&media=${result.mediaCopied}`,
      );
      return reply;
    } catch (err) {
      req.log.error(err);
      reply.code(err.code === "PUBLISH_BUSY" ? 409 : 500);
      return `Publish failed: ${err.message}`;
    }
  });
}
