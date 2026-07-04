import { cookies } from "next/headers";
import crypto from "crypto";

// Minimal HMAC-signed cookie auth for the single admin (you). No DB sessions.
// Runs in the Node runtime (server components + route handlers), not edge
// middleware — so node:crypto is available.
export const COOKIE_NAME = "wo_admin";
const PAYLOAD = "admin";

// Fail closed in production: a missing secret must never silently fall back
// to a value anyone can read in this repo and use to forge the admin cookie.
// Missing secret => no session can be signed or verified (login shows an
// error, dashboard pages treat everyone as signed out — no crash loop).
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "insecure-dev-secret-change-me";
  return null;
}

export function signToken(): string {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  const mac = crypto.createHmac("sha256", key).update(PAYLOAD).digest("hex");
  return `${PAYLOAD}.${mac}`;
}

export function verifyToken(token?: string | null): boolean {
  if (!token) return false;
  const key = secret();
  if (!key) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;
  const value = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  if (value !== PAYLOAD) return false;
  const expected = crypto.createHmac("sha256", key).update(value).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE_NAME)?.value);
}
