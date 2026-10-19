// The /go campaign link. Two things here are security-relevant rather than
// cosmetic: the redirect target must never be caller-controlled (an open
// redirect on our own domain is a phishing primitive), and the campaign value
// arrives from the open internet before it becomes a database row.
import { describe, expect, it } from "vitest";
import {
  appleCampaign,
  appStoreURL,
  cleanCampaign,
  clipFromCampaign,
  isAndroid,
  platformFromCampaign,
  playStoreURL,
  storeURL,
} from "../socialLinks";

describe("appStoreURL", () => {
  it("always lands on our App Store listing", () => {
    expect(appStoreURL("ig_12_scan_item", null)).toBe(
      "https://apps.apple.com/us/app/whichoutfit/id6778094125?ct=instagram&mt=8"
    );
  });

  it("adds the provider token so Apple counts it as a campaign", () => {
    expect(appStoreURL("ig_12_scan_item", "123456")).toBe(
      "https://apps.apple.com/us/app/whichoutfit/id6778094125?pt=123456&ct=instagram&mt=8"
    );
  });

  it("gives Apple the platform, not the post, so campaigns clear Apple's 5-download floor", () => {
    expect(appleCampaign("ig_12_scan_item")).toBe("instagram");
    expect(appleCampaign("ig_bio")).toBe("instagram");
    expect(appleCampaign("tt_05_trip_packing")).toBe("tiktok");
    expect(appleCampaign("newsletter_oct")).toBe("newsletter_oct");
  });

  it("carries no ct or pt when there is no campaign", () => {
    expect(appStoreURL(null, "123456")).toBe("https://apps.apple.com/us/app/whichoutfit/id6778094125?mt=8");
  });

  it("cannot be pointed at another host", () => {
    for (const hostile of ["https://evil.test", "//evil.test", "evil.test/path"]) {
      expect(appStoreURL(cleanCampaign(hostile), null)).toBe(
        "https://apps.apple.com/us/app/whichoutfit/id6778094125?mt=8"
      );
    }
  });
});

describe("playStoreURL", () => {
  it("passes the campaign through Play's install referrer", () => {
    const u = new URL(playStoreURL("ig_12_scan_item"));
    expect(u.host).toBe("play.google.com");
    expect(u.searchParams.get("id")).toBe("app.whichoutfit");
    const ref = new URLSearchParams(u.searchParams.get("referrer") ?? "");
    expect(ref.get("utm_campaign")).toBe("ig_12_scan_item");
    expect(ref.get("utm_source")).toBe("instagram");
  });

  it("has no referrer without a campaign", () => {
    expect(playStoreURL(null)).toBe("https://play.google.com/store/apps/details?id=app.whichoutfit");
  });
});

describe("storeURL", () => {
  it("sends Android to Play and everyone else to the App Store", () => {
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Instagram 300.0";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0";
    expect(isAndroid(android)).toBe(true);
    expect(isAndroid(iphone)).toBe(false);
    expect(storeURL("ig_bio", android)).toMatch(/^https:\/\/play\.google\.com\//);
    expect(storeURL("ig_bio", iphone)).toMatch(/^https:\/\/apps\.apple\.com\//);
    expect(storeURL("ig_bio", null)).toMatch(/^https:\/\/apps\.apple\.com\//);
  });
});

describe("cleanCampaign", () => {
  it("accepts the calendar's own names", () => {
    expect(cleanCampaign("ig_12_scan_item")).toBe("ig_12_scan_item");
    expect(cleanCampaign("tiktok-bio")).toBe("tiktok-bio");
    expect(cleanCampaign(" IG_12_Scan_Item ")).toBe("ig_12_scan_item");
  });

  it("rejects anything that isn't a plain token", () => {
    for (const bad of ["", " ", "a b", "a/b", "a?b", "a'b", "../etc", "_leading", "-leading", "a".repeat(65)]) {
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
