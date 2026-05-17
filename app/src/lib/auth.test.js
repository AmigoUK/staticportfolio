import { test, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

process.env.DB_PATH = ":memory:";

const { hashPassword, verifyCredentials, createUser, countUsers, updatePassword, getUserById, BCRYPT_COST } =
  await import("./auth.js");

before(() => {
  // Schema is applied lazily by getDb on first access.
});

test("hashPassword produces a verifiable bcrypt hash", async () => {
  const hash = await hashPassword("hunter2-correct-horse");
  assert.match(hash, /^\$2[aby]\$/);
  assert.ok(await bcrypt.compare("hunter2-correct-horse", hash));
  assert.equal(await bcrypt.compare("wrong-password", hash), false);
});

test("BCRYPT_COST is at least 12", () => {
  assert.ok(BCRYPT_COST >= 12, `expected BCRYPT_COST >= 12, got ${BCRYPT_COST}`);
});

test("createUser then verifyCredentials roundtrip", async () => {
  assert.equal(countUsers(), 0);
  const hash = await hashPassword("correct-horse-battery");
  const created = createUser({ username: "amigo", passwordHash: hash });
  assert.equal(created.username, "amigo");
  assert.equal(countUsers(), 1);

  const verified = await verifyCredentials({ username: "amigo", password: "correct-horse-battery" });
  assert.equal(verified?.username, "amigo");
  assert.equal(verified?.id, created.id);

  const bad = await verifyCredentials({ username: "amigo", password: "wrong" });
  assert.equal(bad, null);

  const missing = await verifyCredentials({ username: "nobody", password: "whatever" });
  assert.equal(missing, null);

  const empty = await verifyCredentials({ username: "", password: "" });
  assert.equal(empty, null);
});

test("updatePassword replaces the stored hash", async () => {
  const newHash = await hashPassword("new-password-string");
  const changes = updatePassword({ username: "amigo", passwordHash: newHash });
  assert.equal(changes, 1);
  assert.equal((await verifyCredentials({ username: "amigo", password: "correct-horse-battery" })), null);
  const ok = await verifyCredentials({ username: "amigo", password: "new-password-string" });
  assert.ok(ok?.id);
});

test("getUserById returns user or null", () => {
  const u = getUserById(1);
  assert.equal(u?.username, "amigo");
  assert.equal(getUserById(9999), null);
  assert.equal(getUserById(null), null);
});
