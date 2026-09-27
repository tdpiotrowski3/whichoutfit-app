// Security-critical signing: the admin session secret and marketing unsubscribe
// tokens. Both must FAIL CLOSED in production — a missing SESSION_SECRET may never
// fall back to the development string that is published in this repo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionSecret } from "../secret";
import { unsubscribeToken, verifyUnsubscribeToken } from "../unsubscribe";

afterEach(() => vi.unstubAllEnvs());

describe("sessionSecret", () => {
  it("uses SESSION_SECRET when set", () => {
    vi.stubEnv("SESSION_SECRET", "s3cret");
    expect(sessionSecret()).toBe("s3cret");
  });
  it("falls back to a dev value outside production only", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionSecret()).toBe("insecure-dev-secret-change-me");
  });
  it("returns null in production when unset — never the public dev string", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionSecret()).toBeNull();
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a user id", () => {
    vi.stubEnv("SESSION_SECRET", "k1");
    const t = unsubscribeToken("user-123");
    expect(verifyUnsubscribeToken(t)).toBe("user-123");
  });
  it("rejects a token for a different user or a tampered MAC", () => {
    vi.stubEnv("SESSION_SECRET", "k1");
    const t = unsubscribeToken("user-123");
    const mac = t.slice(t.lastIndexOf(".") + 1);
    expect(verifyUnsubscribeToken(`user-456.${mac}`)).toBeNull();
    expect(verifyUnsubscribeToken(t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"))).toBeNull();
    expect(verifyUnsubscribeToken("no-dot-at-all")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
  });
  it("a token minted under one secret does not verify under another", () => {
    vi.stubEnv("SESSION_SECRET", "k1");
    const t = unsubscribeToken("user-123");
    vi.stubEnv("SESSION_SECRET", "k2");
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });
  it("fails closed in production without a secret: minting throws, verifying rejects", () => {
    vi.stubEnv("SESSION_SECRET", "k1");
    const t = unsubscribeToken("user-123");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => unsubscribeToken("user-123")).toThrow(/SESSION_SECRET/);
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });
});
