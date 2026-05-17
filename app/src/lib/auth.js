import bcrypt from "bcrypt";
import { getDb } from "../db/connect.js";

export const BCRYPT_COST = 12;

export async function verifyCredentials({ username, password }) {
  if (!username || !password) return null;
  const db = getDb();
  const row = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(String(username));
  if (!row) return null;
  const ok = await bcrypt.compare(String(password), row.password_hash);
  return ok ? { id: row.id, username: row.username } : null;
}

export function recordLogin(userId) {
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function getUserById(userId) {
  if (!userId) return null;
  const db = getDb();
  return db.prepare("SELECT id, username FROM users WHERE id = ?").get(userId) || null;
}

export function createUser({ username, passwordHash }) {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(String(username), String(passwordHash));
  return { id: info.lastInsertRowid, username };
}

export function updatePassword({ username, passwordHash }) {
  const db = getDb();
  const info = db
    .prepare("UPDATE users SET password_hash = ? WHERE username = ?")
    .run(String(passwordHash), String(username));
  return info.changes;
}

export function countUsers() {
  const db = getDb();
  return db.prepare("SELECT COUNT(*) as n FROM users").get().n;
}

export function requireAdmin(loginPath = "/admin/login") {
  return async function preHandler(req, reply) {
    const userId = req.session?.userId;
    if (!userId) {
      reply.redirect(loginPath);
      return reply;
    }
    const user = getUserById(userId);
    if (!user) {
      req.session.destroy?.();
      reply.redirect(loginPath);
      return reply;
    }
    req.currentUser = user;
  };
}
