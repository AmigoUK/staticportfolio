import { Eta } from "eta";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWS = join(__dirname, "..", "templates");

export const eta = new Eta({
  views: VIEWS,
  cache: process.env.NODE_ENV === "production",
  autoEscape: true,
});

export function renderHtml(reply, template, data = {}) {
  reply.type("text/html; charset=utf-8");
  return eta.render(template, data);
}
