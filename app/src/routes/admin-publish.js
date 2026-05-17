import { requireAdmin } from "../lib/auth.js";
import { publish } from "../services/publish.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

function safeReferer(req, fallback) {
  const ref = req.headers.referer || "";
  try {
    const url = new URL(ref);
    if (url.host === req.headers.host && url.pathname.startsWith(`${ADMIN_BASE}/`)) {
      return url.pathname + url.search;
    }
  } catch (_) { /* not a URL */ }
  return fallback;
}

export default async function adminPublishRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.post(`${ADMIN_BASE}/publish`, csrfPre, async (req, reply) => {
    const dest = safeReferer(req, `${ADMIN_BASE}/`);
    try {
      const result = await publish({ logger: req.log });
      const sep = dest.includes("?") ? "&" : "?";
      reply.redirect(`${dest}${sep}msg=published&pages=${result.pagesWritten}`);
    } catch (err) {
      req.log.error(err);
      const sep = dest.includes("?") ? "&" : "?";
      reply.redirect(`${dest}${sep}err=${encodeURIComponent("Publish failed: " + err.message)}`);
    }
    return reply;
  });
}
