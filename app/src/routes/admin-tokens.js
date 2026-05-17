import { getActiveTheme } from "../services/themes.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function adminTokensRoutes(app) {
  // Live theme tokens for the admin. Mirrors the same shape as
  // public/assets/css/tokens.css so the admin can inherit colors
  // without needing a publish. Cache for 5 seconds — short enough that
  // saving a theme reflects immediately on the next page load.
  //
  // Not auth-gated: color values aren't secret (the public site
  // already exposes the same palette via /assets/css/tokens.css after
  // publish), and the login page needs to read this to match the
  // active theme.
  app.get(`${ADMIN_BASE}/tokens.css`, async (_req, reply) => {
    const theme = getActiveTheme();
    reply.type("text/css; charset=utf-8");
    reply.header("cache-control", "private, max-age=5");
    if (!theme) {
      return "/* No active theme — seed presets first. */\n";
    }
    const t = theme.tokens;
    function decl(map) {
      return Object.entries(map).map(([k, v]) => `  --${k}: ${v};`).join("\n");
    }
    return [
      "/* admin: live theme tokens (mirrors public theme, color only) */",
      ":root {",
      decl(t.light),
      "  color-scheme: light dark;",
      "}",
      ':root[data-theme="light"] {',
      decl(t.light),
      "  color-scheme: light;",
      "}",
      ':root[data-theme="dark"] {',
      decl(t.dark),
      "  color-scheme: dark;",
      "}",
      "",
    ].join("\n");
  });
}
