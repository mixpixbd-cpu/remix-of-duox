/**
 * Every owner control from the chat's 3-dot menu, as one list.
 * `isOn` reads a controls row; `controlPatch` returns the columns/settings that switch one on or off.
 * Pure helpers only (used by the pill bar, the 3-dot menu, the device page and timing).
 */
export type ControlKey =
  | "pause" | "timer" | "nosave" | "nocopy" | "calloff" | "stealth" | "quiet"
  | "bedtime" | "safezone" | "keywords" | "route" | "speed" | "mute";

export type CtlRow = {
  chat_paused?: boolean | null;
  disappearing_seconds?: number | null;
  save_to_gallery_blocked?: boolean | null;
  settings?: unknown;
} | null | undefined;

export type Cols = { chat_paused?: boolean; disappearing_seconds?: number; save_to_gallery_blocked?: boolean };
export type Patch = { cols: Cols; settings: Record<string, string | number | boolean | null> };

/** Controls stored on the pair (everything except the local-only chat mute). */
export const STORED_KEYS: Exclude<ControlKey, "mute">[] = [
  "pause", "timer", "nosave", "nocopy", "calloff", "stealth", "quiet", "bedtime", "safezone", "keywords", "route", "speed",
];
export const ALL_KEYS: ControlKey[] = [...STORED_KEYS, "mute"];

const settingsOf = (ctl: CtlRow) => ((ctl?.settings ?? {}) as Record<string, unknown>) || {};
const str = (v: unknown) => (v == null ? "" : String(v));

export function isOn(k: Exclude<ControlKey, "mute">, ctl: CtlRow): boolean {
  const s = settingsOf(ctl);
  switch (k) {
    case "pause": return !!ctl?.chat_paused;
    case "timer": return (ctl?.disappearing_seconds ?? 0) > 0;
    case "nosave": return !!ctl?.save_to_gallery_blocked;
    case "nocopy": return s["g_no_copy"] === true;
    case "calloff": return s["g_call_out"] === false;
    case "stealth": return s["g_stealth"] === true;
    case "quiet": return s["g_quiet_on"] === true;
    case "bedtime": return str(s["bedtime_from"]) !== "" && str(s["bedtime_to"]) !== "";
    case "safezone": return Number(s["geofence_m"]) > 0;
    case "keywords": return str(s["keywords"]).trim() !== "";
    case "route": return s["g_route_on"] === true;
    case "speed": return Number(s["speed_limit_kmh"]) > 0;
  }
}

/** Remembers a value while its switch is off so switching back on restores it. */
function keep(s: Record<string, unknown>, name: string, on: boolean, fallback: string | number) {
  const bak = `bak_${name}`;
  if (on) {
    const prev = s[bak] ?? s[name];
    const cur = s[name];
    const empty = cur == null || cur === "" || cur === 0;
    return empty ? (prev == null || prev === "" || prev === 0 ? fallback : (prev as string | number)) : (cur as string | number);
  }
  return null;
}

export function controlPatch(k: Exclude<ControlKey, "mute">, on: boolean, ctl: CtlRow): Patch {
  const s = settingsOf(ctl);
  const cols: Cols = {};
  const set: Patch["settings"] = {};
  switch (k) {
    case "pause": cols.chat_paused = on; break;
    case "timer": cols.disappearing_seconds = on ? ((ctl?.disappearing_seconds ?? 0) || 3600) : 0; break;
    case "nosave": cols.save_to_gallery_blocked = on; break;
    case "nocopy": set["g_no_copy"] = on; break;
    case "calloff": set["g_call_out"] = !on; break;
    case "stealth": set["g_stealth"] = on; break;
    case "quiet": set["g_quiet_on"] = on; break;
    case "route": set["g_route_on"] = on; break;
    case "bedtime":
      if (on) { set["bedtime_from"] = str(s["bedtime_from"]) || str(s["bak_bedtime_from"]) || "23:00"; set["bedtime_to"] = str(s["bedtime_to"]) || str(s["bak_bedtime_to"]) || "06:00"; }
      else { if (str(s["bedtime_from"])) set["bak_bedtime_from"] = str(s["bedtime_from"]); if (str(s["bedtime_to"])) set["bak_bedtime_to"] = str(s["bedtime_to"]); set["bedtime_from"] = ""; set["bedtime_to"] = ""; }
      break;
    case "safezone":
      if (on) set["geofence_m"] = Number(keep(s, "geofence_m", true, 200));
      else { if (Number(s["geofence_m"]) > 0) set["bak_geofence_m"] = Number(s["geofence_m"]); set["geofence_m"] = 0; }
      break;
    case "keywords":
      if (on) set["keywords"] = String(keep(s, "keywords", true, "help"));
      else { if (str(s["keywords"]).trim()) set["bak_keywords"] = str(s["keywords"]); set["keywords"] = ""; }
      break;
    case "speed":
      if (on) set["speed_limit_kmh"] = Number(keep(s, "speed_limit_kmh", true, 80));
      else { if (Number(s["speed_limit_kmh"]) > 0) set["bak_speed_limit_kmh"] = Number(s["speed_limit_kmh"]); set["speed_limit_kmh"] = 0; }
      break;
  }
  return { cols, settings: set };
}

/** Which owner controls are switched on right now. */
export function activeKeys(ctl: CtlRow, muted: boolean): ControlKey[] {
  const out: ControlKey[] = STORED_KEYS.filter((k) => isOn(k, ctl));
  if (muted) out.push("mute");
  return out;
}

/** Turns a time rule into a number of seconds for one-off sessions (0 = no limit, null = not valid now). */
export function sessionSeconds(rule: { mode: "unlimited" } | { mode: "until"; until: string } | { mode: "schedule"; start: string; end: string; daily: boolean }, now: Date = new Date()): number | null {
  if (rule.mode === "unlimited") return 0;
  if (rule.mode === "until") return Math.max(30, Math.round((new Date(rule.until).getTime() - now.getTime()) / 1000));
  const s = new Date(rule.start).getTime(), e = new Date(rule.end).getTime();
  if (now.getTime() < s || now.getTime() >= e) return null;
  return Math.max(30, Math.round((e - now.getTime()) / 1000));
}
