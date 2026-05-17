import Fastify from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const APP_ROOT = join(__dirname, "..", "..");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    disableRequestLogging: false,
    trustProxy: true,
  });

  app.get("/admin/health", async () => ({ ok: true, version: "0.1.0" }));

  app.get("/admin/", async (_req, reply) => {
    reply.type("text/html; charset=utf-8");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Portfolio CMS</title></head>
<body><h1>Portfolio CMS</h1><p>Scaffold running. Auth + dashboard land in the next checkpoint.</p></body></html>`;
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
