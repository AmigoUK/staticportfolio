import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import staticPlugin from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db/connect.js";
import authRoutes from "./routes/auth.js";
import adminPagesRoutes from "./routes/admin-pages.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const APP_SRC = __dirname;
export const APP_ROOT = join(__dirname, "..");
export const REPO_ROOT = join(APP_ROOT, "..");
export const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR || join(REPO_ROOT, "public"));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_BASE = process.env.ADMIN_BASE_PATH || "/admin";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";

function requireSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET env var must be set to at least 32 characters. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
  return s;
}

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    disableRequestLogging: false,
    trustProxy: true,
  });

  getDb();

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body)));
      } catch (e) {
        done(e);
      }
    },
  );

  await app.register(cookie);
  await app.register(session, {
    secret: requireSecret(),
    cookieName: "jd_session",
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      maxAge: 24 * 60 * 60 * 1000,
    },
    saveUninitialized: false,
  });
  await app.register(rateLimit, { global: false });

  await app.register(staticPlugin, {
    root: join(APP_SRC, "public-assets"),
    prefix: `${ADMIN_BASE}/static/`,
    decorateReply: false,
  });

  await app.register(authRoutes);
  await app.register(adminPagesRoutes);

  app.get("/healthz", async () => ({ ok: true }));

  await app.register(staticPlugin, {
    root: PUBLIC_DIR,
    prefix: "/",
    decorateReply: true,
    index: ["index.html"],
    extensions: ["html"],
    serveDotFiles: false,
  });

  app.setNotFoundHandler(async (_req, reply) => {
    const fourOhFour = join(PUBLIC_DIR, "404.html");
    reply.code(404);
    return reply.sendFile ? reply.sendFile("404.html") : "Not found";
  });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
