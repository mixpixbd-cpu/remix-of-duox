import { describe, expect, it } from "vitest";
import { applyTiming, clockTarget, ruleActive } from "@/lib/timing";

const at = (s: string) => new Date(s);
describe("4-in-1 control timing", () => {
  it("unlimited stays on", () => expect(ruleActive({ mode: "unlimited" }, at("2030-01-01T00:00"))).toBe(true));
  it("until switches off after the time", () => {
    const r = { mode: "until" as const, until: at("2026-11-17T22:30").toISOString() };
    expect(ruleActive(r, at("2026-11-17T22:00"))).toBe(true);
    expect(ruleActive(r, at("2026-11-17T22:31"))).toBe(false);
  });
  it("custom 10:30 PM targets tonight, or tomorrow if passed", () => {
    expect(clockTarget(10, 30, true, at("2026-11-17T08:00")).getHours()).toBe(22);
    expect(clockTarget(10, 30, true, at("2026-11-17T23:00")).getDate()).toBe(18);
  });
  it("date schedule is on only between start and end", () => {
    const r = { mode: "schedule" as const, start: at("2026-11-20T09:00").toISOString(), end: at("2026-11-21T09:00").toISOString(), daily: false };
    expect(ruleActive(r, at("2026-11-19T12:00"))).toBe(false);
    expect(ruleActive(r, at("2026-11-20T23:00"))).toBe(true);
  });
  it("daily schedule repeats overnight window", () => {
    const r = { mode: "schedule" as const, start: at("2026-11-17T23:00").toISOString(), end: at("2026-11-30T06:00").toISOString(), daily: true };
    expect(ruleActive(r, at("2026-11-20T02:00"))).toBe(true);
    expect(ruleActive(r, at("2026-11-20T12:00"))).toBe(false);
  });
  it("expired pause no longer pauses the partner", () => {
    const ctl = { chat_paused: true, settings: { t_pause: { mode: "until", until: at("2026-11-17T10:00").toISOString() } } };
    expect(applyTiming(ctl, at("2026-11-17T11:00")).chat_paused).toBe(false);
    expect(applyTiming(ctl, at("2026-11-17T09:00")).chat_paused).toBe(true);
  });
});
