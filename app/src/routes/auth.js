import { verifyCredentials, recordLogin } from "../lib/auth.js";
import { renderHtml } from "../lib/render.js";

const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";

export default async function authRoutes(app) {
  app.get(`${ADMIN_BASE}/login`, async (req, reply) => {
    if (req.session?.userId) {
      reply.redirect(`${ADMIN_BASE}/`);
      return reply;
    }
    return renderHtml(reply, "admin/login.eta", {
      adminBase: ADMIN_BASE,
      csrfToken: req.session?.csrfToken || "",
      error: null,
      username: "",
    });
  });

  app.post(
    `${ADMIN_BASE}/login`,
    {
      config: {
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
    },
    async (req, reply) => {
      const { username, password } = req.body || {};
      const user = await verifyCredentials({ username, password });
      if (!user) {
        reply.code(401);
        return renderHtml(reply, "admin/login.eta", {
          adminBase: ADMIN_BASE,
          csrfToken: req.session?.csrfToken || "",
          error: "Incorrect username or password.",
          username: typeof username === "string" ? username : "",
        });
      }
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.userId = user.id;
      recordLogin(user.id);
      reply.redirect(`${ADMIN_BASE}/`);
      return reply;
    },
  );

  app.post(`${ADMIN_BASE}/logout`, async (req, reply) => {
    await new Promise((resolve) => {
      if (!req.session) return resolve();
      req.session.destroy(() => resolve());
    });
    reply.redirect(`${ADMIN_BASE}/login`);
    return reply;
  });
}
