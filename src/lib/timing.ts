/**
 * Universal 4-in-1 timing for partner controls: quick preset / custom clock time (both "until"),
 * unlimited, or a date+time schedule (optionally repeating daily). Pure helpers only.
 * A switch stored ON is only *effective* while its rule says so; rules live in settings `t_<key>`.
 */
export type TimeRule =
  | { mode: "unlimited" }
  | { mode: "until"; until: string }
  | { mode: "schedule"; start: string; end: string; daily: boolean };

export type TimedKey = "pause" | "timer" | "nosave" | "nocopy" | "stealth" | "quiet";
export const TIMED_KEYS: TimedKey[] = ["pause", "timer", "nosave", "nocopy", "stealth", "quiet"];

export function parseRule(v: unknown): TimeRule | null {
  if (!v || typeof v !== "object") return null;
  const r = v as { mode?: unknown; until?: unknown; start?: unknown; end?: unknown; daily?: unknown };
  if (r.mode === "unlimited") return { mode: "unlimited" };
  if (r.mode === "until" && typeof r.until === "string") return { mode: "until", until: r.until };
  if (r.mode === "schedule" && typeof r.start === "string" && typeof r.end === "string") return { mode: "schedule", start: r.start, end: r.end, daily: r.daily === true };
  return null;
}

const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function ruleActive(rule: TimeRule | null, now: Date = new Date()): boolean {
  if (!rule || rule.mode === "unlimited") return true;
  if (rule.mode === "until") return now.getTime() < new Date(rule.until).getTime();
  const s = new Date(rule.start), e = new Date(rule.end);
  if (!rule.daily) return now >= s && now < e;
  if (day(now) < day(s) || day(now) > day(e)) return false;
  const a = mins(s), b = mins(e), n = mins(now);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}

/** Next moment (after now) a 12-hour clock time happens, e.g. 10:30 PM. */
export function clockTarget(h12: number, m: number, pm: boolean, now: Date = new Date()): Date {
  const h = (h12 % 12) + (pm ? 12 : 0);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

type Ctl = { chat_paused?: boolean | null; disappearing_seconds?: number | null; save_to_gallery_blocked?: boolean | null; settings?: unknown };
const SETTING: Partial<Record<TimedKey, string>> = { nocopy: "g_no_copy", stealth: "g_stealth", quiet: "g_quiet_on" };

/** Returns the controls row as it must be obeyed right now (switches whose time is up count as off). */
export function applyTiming<T extends Ctl | null | undefined>(ctl: T, now: Date = new Date()): T {
  if (!ctl) return ctl;
  const s = { ...((ctl.settings ?? {}) as Record<string, unknown>) };
  const out = { ...ctl } as Ctl;
  for (const k of TIMED_KEYS) {
    if (ruleActive(parseRule(s[`t_${k}`]), now)) continue;
    if (k === "pause") out.chat_paused = false;
    else if (k === "timer") out.disappearing_seconds = 0;
    else if (k === "nosave") out.save_to_gallery_blocked = false;
    else s[SETTING[k]!] = false;
  }
  out.settings = s;
  return out as T;
}
