import { describe, expect, it } from "vitest";
import { presenceOf } from "@/lib/fp";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe("presenceOf", () => {
  it("is online when seen within 2 minutes", () => expect(presenceOf(ago(1))).toBe("online"));
  it("is recently active within 1 hour", () => expect(presenceOf(ago(45))).toBe("away"));
  it("is offline after more than 1 hour", () => expect(presenceOf(ago(61))).toBe("offline"));
});
