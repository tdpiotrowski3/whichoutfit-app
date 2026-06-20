import { cookies } from "next/headers";
import crypto from "crypto";

// Minimal HMAC-signed cookie auth for the single admin (you). No DB sessions.
// Runs in the Node runtime (server components + route handlers), not edge
// middleware — so node:crypto is available.
export const COOKIE_NAME = "wo_admin";
const PAYLOAD = "admin";

function secret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
}

export function signToken(): string {
  const mac = crypto.createHmac("sha256", secret()).update(PAYLOAD).digest("hex");
  return `${PAYLOAD}.${mac}`;
}

export function verifyToken(token?: string | null): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;
  const value = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  if (value !== PAYLOAD) return false;
  const expected = crypto.createHmac("sha256", secret()).update(value).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE_NAME)?.value);
}
