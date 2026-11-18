import { describe, expect, it } from "vitest";
import { rankQuick } from "@/routes/_authenticated/chat.$pairId";

describe("imo-style frequent emojis", () => {
  it("one use does not replace the default emojis", () => {
    expect(rankQuick({ "🐶": 1 }).emojis).toEqual(["❤️", "😂", "😍", "👍", "🙏"]);
  });
  it("often-used emoji moves to the front", () => {
    expect(rankQuick({ "🐶": 5 }).emojis[0]).toBe("🐶");
  });
});
