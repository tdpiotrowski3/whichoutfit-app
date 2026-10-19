// The /go campaign link. Two things here are security-relevant rather than
// cosmetic: the redirect target must never be caller-controlled (an open
// redirect on our own domain is a phishing primitive), and the campaign value
// arrives from the open internet before it becomes a database row.
import { describe, expect, it } from "vitest";
import { appStoreURL, cleanCampaign, clipFromCampaign, platformFromCampaign } from "../socialLinks";

describe("appStoreURL", () => {
  it("always lands on our App Store listing", () => {
    expect(appStoreURL("ig_12_scan_item")).toBe(
      "https://apps.apple.com/us/app/whichoutfit/id6778094125?ct=ig_12_scan_item&mt=8"
    );
  });

  it("carries no ct when there is no campaign", () => {
    expect(appStoreURL(null)).toBe("https://apps.apple.com/us/app/whichoutfit/id6778094125?mt=8");
  });

  it("cannot be pointed at another host", () => {
    // cleanCampaign is the gate; anything that survives it is a bare token, so
    // the host is fixed no matter what arrives in the query string.
    for (const hostile of ["https://evil.test", "//evil.test", "evil.test/path"]) {
      expect(appStoreURL(cleanCampaign(hostile))).toBe(
        "https://apps.apple.com/us/app/whichoutfit/id6778094125?mt=8"
      );
    }
  });
});

describe("cleanCampaign", () => {
  it("accepts the calendar's own names", () => {
    expect(cleanCampaign("ig_12_scan_item")).toBe("ig_12_scan_item");
    expect(cleanCampaign("tiktok-bio")).toBe("tiktok-bio");
    expect(cleanCampaign("  IG_12_Scan_Item  ")).toBe("ig_12_scan_item");
  });

  it("rejects anything that isn't a plain token", () => {
    for (const bad of ["", "   ", "a b", "a/b", "a?b", "a'b", "../etc", "_leading", "-leading", "a".repeat(65)]) {
      expect(cleanCampaign(bad)).toBeNull();
    }
    expect(cleanCampaign(null)).toBeNull();
    expect(cleanCampaign(undefined)).toBeNull();
  });

  it("accepts exactly 64 characters and no more", () => {
    expect(cleanCampaign("a".repeat(64))).toBe("a".repeat(64));
    expect(cleanCampaign("a".repeat(65))).toBeNull();
  });
});

describe("campaign name parsing", () => {
  it("reads the platform off the prefix", () => {
    expect(platformFromCampaign("ig_12_scan_item")).toBe("instagram");
    expect(platformFromCampaign("tiktok_bio")).toBe("tiktok");
    expect(platformFromCampaign("tt_12_scan_item")).toBe("tiktok");
    expect(platformFromCampaign("newsletter_oct")).toBeNull();
  });

  it("reads the clip off the remainder", () => {
    expect(clipFromCampaign("ig_12_scan_item")).toBe("12_scan_item");
    expect(clipFromCampaign("nounderscore")).toBeNull();
    expect(clipFromCampaign("trailing_")).toBeNull();
  });
});
