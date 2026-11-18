import { describe, expect, it } from "vitest";
import { verdictFrom, kindOf, wishText } from "@/lib/feed";

describe("family library", () => {
  it("only a clear SAFE reply lets an item through", () => {
    expect(verdictFrom("SAFE")).toBe("safe");
    expect(verdictFrom("BLOCK")).toBe("blocked");
    expect(verdictFrom("")).toBe("blocked");
    expect(verdictFrom("maybe")).toBe("blocked");
  });
  it("accepts only photo, video and audio", () => {
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("application/pdf")).toBeNull();
  });
  it("wish message names the item", () => {
    expect(wishText("লাল শাড়ি", "fashion")).toBe("❤️ আমার পছন্দ / আবদার: লাল শাড়ি");
  });
});
