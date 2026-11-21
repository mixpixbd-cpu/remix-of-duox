import { describe, expect, it } from "vitest";
import { carePet, careGarden, petHappiness, petLevel, todaysDates, onThisDay } from "@/lib/corner";

describe("couple pet", () => {
  it("is fully happy after feed, bath and pat", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    let p = carePet({}, "fed", now); p = carePet(p, "bath", now); p = carePet(p, "pat", now);
    expect(petHappiness(p, now.getTime())).toBe(3);
    expect(petHappiness(p, now.getTime() + 13 * 3600e3)).toBe(0);
  });
  it("levels up every 10 care actions", () => { expect(petLevel({ xp: 10 })).toBe(2); });
});
describe("garden", () => {
  it("blooms one flower per day when watered and sunned", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    let g = careGarden({}, "water", now); g = careGarden(g, "sun", now); g = careGarden(g, "water", now);
    expect(g.flowers).toBe(1);
  });
});
describe("memories", () => {
  it("finds anniversary and on-this-day media", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    expect(todaysDates({ anniversary: "2020-11-21" }, now)).toEqual([{ key: "anniversary", years: 6 }]);
    expect(onThisDay([{ created_at: "2025-11-21T01:00:00Z" }, { created_at: "2026-11-21T01:00:00Z" }], now)).toHaveLength(1);
  });
});
import { socialEmbed } from "@/lib/chat-fun";
describe("watch together social links", () => {
  it("embeds facebook and instagram reels", () => {
    expect(socialEmbed("https://www.facebook.com/watch/?v=123")).toContain("facebook.com/plugins/video.php");
    expect(socialEmbed("https://www.instagram.com/reels/AbC_1/")).toBe("https://www.instagram.com/reel/AbC_1/embed");
    expect(socialEmbed("https://example.com/a.mp4")).toBeNull();
  });
});
