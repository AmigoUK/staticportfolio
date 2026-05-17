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
      error: req.query.err || null,
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
    // Validate Google Analytics ID specifically: empty OR G-XXXXXXX format.
    if (Object.prototype.hasOwnProperty.call(updates, "analytics.ga_id")) {
      const gaId = updates["analytics.ga_id"].trim().toUpperCase();
      if (gaId !== "" && !/^G-[A-Z0-9]{4,12}$/.test(gaId)) {
        reply.redirect(`${ADMIN_BASE}/settings/?err=${encodeURIComponent("Google Analytics ID must be empty or in the form G-XXXXXXXXXX (4–12 letters/digits).")}`);
        return reply;
      }
      updates["analytics.ga_id"] = gaId;
    }
    setMultipleSettings(updates);
    reply.redirect(`${ADMIN_BASE}/settings/?msg=saved`);
    return reply;
  });
}
