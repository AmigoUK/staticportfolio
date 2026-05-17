import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.SESSION_SECRET = "test-secret-must-be-at-least-32-chars-long-test";
process.env.ADMIN_BASE_PATH = "/admin";
process.env.LOG_LEVEL = "silent";

const { buildServer } = await import("../server.js");
const { hashPassword, createUser, countUsers } = await import("../lib/auth.js");

let app;

before(async () => {
  if (countUsers() === 0) {
    const hash = await hashPassword("test-pass-1234-correct");
    createUser({ username: "csrftest", passwordHash: hash });
  }
  app = await buildServer();
  await app.ready();
});

async function login() {
  const res = await app.inject({
    method: "POST",
    url: "/admin/login",
    payload: "username=csrftest&password=test-pass-1234-correct",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal(res.statusCode, 302, `login failed: ${res.statusCode} ${res.payload}`);
  return res.headers["set-cookie"];
}

test("POST /admin/logout without _csrf → 403", async () => {
  const cookie = await login();
  const res = await app.inject({
    method: "POST",
    url: "/admin/logout",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    payload: "",
  });
  assert.equal(res.statusCode, 403);
});

test("POST /admin/logout with valid _csrf → 302", async () => {
  const cookie = await login();
  const dash = await app.inject({ method: "GET", url: "/admin/", headers: { cookie } });
  assert.equal(dash.statusCode, 200);
  const tokenMatch = dash.payload.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(tokenMatch, "expected a _csrf token in dashboard payload");
  const token = tokenMatch[1];

  // Cookie from the dashboard reply (in case it changed).
  const dashCookie = dash.headers["set-cookie"] || cookie;
  const res = await app.inject({
    method: "POST",
    url: "/admin/logout",
    headers: { cookie: dashCookie, "content-type": "application/x-www-form-urlencoded" },
    payload: `_csrf=${encodeURIComponent(token)}`,
  });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "/admin/login");
});

test("GET /admin/ without session → 302 to /admin/login", async () => {
  const res = await app.inject({ method: "GET", url: "/admin/" });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "/admin/login");
});
