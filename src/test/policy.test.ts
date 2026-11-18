import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, fileBlockReason, inQuietHours, partnerMayCall, policyOfPair, policyToPair } from "@/lib/policy";

const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);

describe("quiet hours", () => {
  const q = { on: true, from: "23:00", to: "06:00" };
  it("is active late at night and early morning (crosses midnight)", () => {
    expect(inQuietHours(q, at(23, 30))).toBe(true);
    expect(inQuietHours(q, at(2))).toBe(true);
  });
  it("is off during the day and when switched off", () => {
    expect(inQuietHours(q, at(12))).toBe(false);
    expect(inQuietHours(q, at(6))).toBe(false);
    expect(inQuietHours({ ...q, on: false }, at(2))).toBe(false);
  });
});

describe("partner calls", () => {
  it("blocks every call when partners may not start calls", () => {
    expect(partnerMayCall({ ...DEFAULT_POLICY, callOut: false }, "voice", at(12))).toBe(false);
  });
  it("voice-only mode blocks video but allows voice", () => {
    const p = { ...DEFAULT_POLICY, callMode: "voice" as const };
    expect(partnerMayCall(p, "voice", at(12))).toBe(true);
    expect(partnerMayCall(p, "video", at(12))).toBe(false);
  });
  it("blocks calls during quiet hours", () => {
    const p = { ...DEFAULT_POLICY, quiet: { on: true, from: "23:00", to: "06:00" } };
    expect(partnerMayCall(p, "voice", at(1))).toBe(false);
  });
});

describe("file limits", () => {
  it("rejects files above the max size", () => {
    const p = { ...DEFAULT_POLICY, maxMb: 10 };
    expect(fileBlockReason(p, { size: 11 * 1024 * 1024, type: "image/png" })).toBe("size");
    expect(fileBlockReason(p, { size: 9 * 1024 * 1024, type: "image/png" })).toBeNull();
  });
  it("rejects videos and documents when blocked", () => {
    const p = { ...DEFAULT_POLICY, blockVideo: true, blockDocs: true };
    expect(fileBlockReason(p, { size: 1, type: "video/mp4" })).toBe("video");
    expect(fileBlockReason(p, { size: 1, type: "application/pdf" })).toBe("docs");
    expect(fileBlockReason(p, { size: 1, type: "image/jpeg" })).toBeNull();
  });
});

describe("policy <-> pair settings", () => {
  it("round-trips admin rules through a pair's controls row", () => {
    const patch = policyToPair({ freeze: true, disappearing: 86400, noCopy: true, callMode: "video", maxMb: 25 });
    const back = policyOfPair({ ...patch.cols, settings: patch.settings });
    expect(back.freeze).toBe(true);
    expect(back.disappearing).toBe(86400);
    expect(back.noCopy).toBe(true);
    expect(back.callMode).toBe("video");
    expect(back.maxMb).toBe(25);
  });
});
