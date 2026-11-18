import { describe, expect, it } from "vitest";
import { canEdit, lastSeenText, toggleReaction } from "@/components/fp/ChatExtras";

const base = { kind: "text", body: "hi", file_path: null, deleted_at: null };

describe("chat rules", () => {
  it("text can be edited within 15 minutes, not after", () => {
    const now = Date.now();
    expect(canEdit({ ...base, created_at: new Date(now - 14 * 60_000).toISOString() }, now)).toBe(true);
    expect(canEdit({ ...base, created_at: new Date(now - 16 * 60_000).toISOString() }, now)).toBe(false);
  });
  it("one reaction per user, same emoji toggles off", () => {
    const a = toggleReaction({}, "👍", "u1");
    expect(a).toEqual({ "👍": ["u1"] });
    expect(toggleReaction(a, "❤️", "u1")).toEqual({ "❤️": ["u1"] });
    expect(toggleReaction(a, "👍", "u1")).toEqual({});
  });
  it("last seen shows active or minutes ago", () => {
    const now = Date.now();
    expect(lastSeenText(new Date(now - 30_000).toISOString(), false, now)).toBe("Active now");
    expect(lastSeenText(new Date(now - 5 * 60_000).toISOString(), false, now)).toBe("Active 5 min ago");
  });
});
