/**
 * Admin-wide partner rules ("Partner Setup").
 * The admin edits ONE Policy; it is copied into every pair's `pair_controls` row
 * (columns + `settings` jsonb with `g_*` keys) so partners' devices can read and obey it.
 * Pure helpers only — no network here.
 */

export type CallMode = "both" | "voice" | "video";

export type Policy = {
  freeze: boolean;
  disappearing: number;
  noSave: boolean;
  noCopy: boolean;
  ghost: boolean;
  stealth: boolean;
  callOut: boolean;
  callMode: CallMode;
  maxMb: number;
  blockVideo: boolean;
  blockDocs: boolean;
  quiet: { on: boolean; from: string; to: string };
  safe: { lat: number | null; lng: number | null; m: number };
  sos: boolean;
  offlineHours: number;
};

export const DEFAULT_POLICY: Policy = {
  freeze: false,
  disappearing: 0,
  noSave: false,
  noCopy: false,
  ghost: false,
  stealth: false,
  callOut: true,
  callMode: "both",
  maxMb: 0,
  blockVideo: false,
  blockDocs: false,
  quiet: { on: false, from: "23:00", to: "06:00" },
  safe: { lat: null, lng: null, m: 0 },
  sos: false,
  offlineHours: 0,
};

export function mergePolicy(raw: unknown): Policy {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<Policy>;
  return {
    ...DEFAULT_POLICY,
    ...c,
    quiet: { ...DEFAULT_POLICY.quiet, ...(c.quiet ?? {}) },
    safe: { ...DEFAULT_POLICY.safe, ...(c.safe ?? {}) },
  };
}

type PairPatch = {
  cols: { chat_paused?: boolean; disappearing_seconds?: number; save_to_gallery_blocked?: boolean };
  settings: Record<string, string | number | boolean | null>;
};

/** Turns (part of) a Policy into the columns/settings stored on each pair. */
export function policyToPair(p: Partial<Policy>): PairPatch {
  const cols: PairPatch["cols"] = {};
  const s: PairPatch["settings"] = {};
  if (p.freeze !== undefined) cols.chat_paused = p.freeze;
  if (p.disappearing !== undefined) cols.disappearing_seconds = p.disappearing;
  if (p.noSave !== undefined) cols.save_to_gallery_blocked = p.noSave;
  if (p.noCopy !== undefined) s["g_no_copy"] = p.noCopy;
  if (p.ghost !== undefined) s["g_ghost"] = p.ghost;
  if (p.stealth !== undefined) s["g_stealth"] = p.stealth;
  if (p.callOut !== undefined) s["g_call_out"] = p.callOut;
  if (p.callMode !== undefined) s["g_call_mode"] = p.callMode;
  if (p.maxMb !== undefined) s["g_max_mb"] = p.maxMb;
  if (p.blockVideo !== undefined) s["g_block_video"] = p.blockVideo;
  if (p.blockDocs !== undefined) s["g_block_docs"] = p.blockDocs;
  if (p.sos !== undefined) s["g_sos"] = p.sos;
  if (p.quiet) {
    s["g_quiet_on"] = p.quiet.on;
    s["g_quiet_from"] = p.quiet.from;
    s["g_quiet_to"] = p.quiet.to;
  }
  if (p.safe) {
    s["geofence_lat"] = p.safe.lat;
    s["geofence_lng"] = p.safe.lng;
    s["geofence_m"] = p.safe.m;
  }
  return { cols, settings: s };
}

type CtlLike = {
  chat_paused?: boolean | null;
  disappearing_seconds?: number | null;
  save_to_gallery_blocked?: boolean | null;
  settings?: unknown;
} | null | undefined;

/** Reads the rules a partner's device must obey from a pair's controls row. */
export function policyOfPair(ctl: CtlLike): Policy {
  const s = ((ctl?.settings ?? {}) as Record<string, unknown>) || {};
  const mode = s["g_call_mode"];
  return {
    ...DEFAULT_POLICY,
    freeze: !!ctl?.chat_paused,
    disappearing: ctl?.disappearing_seconds ?? 0,
    noSave: !!ctl?.save_to_gallery_blocked,
    noCopy: s["g_no_copy"] === true,
    ghost: s["g_ghost"] === true,
    stealth: s["g_stealth"] === true,
    callOut: s["g_call_out"] !== false,
    callMode: mode === "voice" || mode === "video" ? mode : "both",
    maxMb: typeof s["g_max_mb"] === "number" ? (s["g_max_mb"] as number) : 0,
    blockVideo: s["g_block_video"] === true,
    blockDocs: s["g_block_docs"] === true,
    sos: s["g_sos"] === true,
    quiet: {
      on: s["g_quiet_on"] === true,
      from: typeof s["g_quiet_from"] === "string" ? (s["g_quiet_from"] as string) : "23:00",
      to: typeof s["g_quiet_to"] === "string" ? (s["g_quiet_to"] as string) : "06:00",
    },
  };
}

function mins(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True when `now` is inside the quiet window (works across midnight). */
export function inQuietHours(q: Policy["quiet"], now: Date = new Date()) {
  if (!q.on) return false;
  const a = mins(q.from), b = mins(q.to), n = now.getHours() * 60 + now.getMinutes();
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

/** Can a PARTNER start this kind of call right now? */
export function partnerMayCall(p: Policy, type: "voice" | "video", now: Date = new Date()) {
  if (!p.callOut) return false;
  if (inQuietHours(p.quiet, now)) return false;
  return p.callMode === "both" || p.callMode === type;
}

/** Returns a reason when a PARTNER's file may not be sent, otherwise null. */
export function fileBlockReason(p: Policy, file: { size: number; type: string; name?: string }): "size" | "video" | "docs" | null {
  if (p.maxMb > 0 && file.size > p.maxMb * 1024 * 1024) return "size";
  const t = file.type || "";
  if (p.blockVideo && t.startsWith("video/")) return "video";
  const media = t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/");
  if (p.blockDocs && !media) return "docs";
  return null;
}
