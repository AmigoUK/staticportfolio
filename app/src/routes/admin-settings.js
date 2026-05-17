import { requireAdmin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";
import { getAllSettings, setMultipleSettings, DEFAULT_SETTINGS } from "../services/settings.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

const EDITABLE_KEYS = Object.keys(DEFAULT_SETTINGS);

export default async function adminSettingsRoutes(app) {
  const gate = requireAdmin(`${ADMIN_BASE}/login`);
  const csrfPre = { preHandler: [gate, app.csrfProtection] };

  app.get(`${ADMIN_BASE}/settings/`, { preHandler: gate }, async (req, reply) => {
    const csrfToken = await reply.generateCsrf();
    return renderHtml(reply, "admin/settings.eta", {
      adminBase: ADMIN_BASE,
      user: req.currentUser,
      csrfToken,
      settings: { ...DEFAULT_SETTINGS, ...getAllSettings() },
      editableKeys: EDITABLE_KEYS,
      flash: req.query.msg || null,
    });
  });

  app.post(`${ADMIN_BASE}/settings/`, csrfPre, async (req, reply) => {
    const body = req.body || {};
    const updates = {};
    for (const key of EDITABLE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        updates[key] = String(body[key]).slice(0, 1000);
      }
    }
    setMultipleSettings(updates);
    reply.redirect(`${ADMIN_BASE}/settings/?msg=saved`);
    return reply;
  });
}
