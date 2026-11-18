import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellOff, Copy, EyeOff, Moon, Pause, ShieldCheck, Timer, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useBackClose } from "@/components/fp/PrivacyShield";
import { applyTiming, clockTarget, parseRule, type TimeRule } from "@/lib/timing";

type Ctl = { chat_paused?: boolean | null; disappearing_seconds?: number | null; save_to_gallery_blocked?: boolean | null; settings?: unknown } | null | undefined;
type Key = "pause" | "timer" | "nosave" | "nocopy" | "stealth" | "quiet" | "mute";

const TIMERS = [0, 30, 300, 3600, 86400, 604800];
const fmtT = (s: number) => (s >= 86400 ? `${Math.round(s / 86400)}d` : s >= 3600 ? `${Math.round(s / 3600)}h` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`);

/** Which owner controls are switched on right now (pure, for tests). */
export function activeControls(ctl: Ctl, muted: boolean): Key[] {
  const s = (ctl?.settings ?? {}) as Record<string, unknown>;
  const out: Key[] = [];
  if (ctl?.chat_paused) out.push("pause");
  if ((ctl?.disappearing_seconds ?? 0) > 0) out.push("timer");
  if (ctl?.save_to_gallery_blocked) out.push("nosave");
  if (s["g_no_copy"] === true) out.push("nocopy");
  if (s["g_stealth"] === true) out.push("stealth");
  if (s["g_quiet_on"] === true) out.push("quiet");
  if (muted) out.push("mute");
  return out;
}

/** Owner-only slim row of pills under the chat header, one per switched-on control. */
export function ControlPills({ pairId, ctl, muted, onMute, bn }: { pairId: string; ctl: Ctl; muted: boolean; onMute: (ms: number) => void; bn: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Key | null>(null);
  useBackClose(!!open, () => setOpen(null));
  const s = (ctl?.settings ?? {}) as Record<string, Json>;
  const active = activeControls(applyTiming(ctl), muted);
  const shown = open && !active.includes(open) ? [...active, open] : active;
  if (!shown.length) return null;

  const meta: Record<Key, { icon: LucideIcon; label: string }> = {
    pause: { icon: Pause, label: bn ? "চ্যাট পজ" : "Paused" },
    timer: { icon: Timer, label: ctl?.disappearing_seconds ? fmtT(ctl.disappearing_seconds) : bn ? "টাইমার" : "Timer" },
    nosave: { icon: ShieldCheck, label: "No-save" },
    nocopy: { icon: Copy, label: "No-copy" },
    stealth: { icon: EyeOff, label: "Stealth" },
    quiet: { icon: Moon, label: bn ? "কোয়াইট" : "Quiet" },
    mute: { icon: BellOff, label: bn ? "মিউট" : "Muted" },
  };

  async function patch(cols: { chat_paused?: boolean; disappearing_seconds?: number; save_to_gallery_blocked?: boolean }, set?: Record<string, Json>) {
    const { error } = await supabase.from("pair_controls").upsert({
      pair_id: pairId,
      chat_paused: ctl?.chat_paused ?? false,
      disappearing_seconds: ctl?.disappearing_seconds ?? 0,
      save_to_gallery_blocked: ctl?.save_to_gallery_blocked ?? false,
      ...cols,
      settings: { ...s, ...(set ?? {}) } as Json,
      updated_at: new Date().toISOString(),
    });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["controls", pairId] });
  }
  function toggle(k: Key, on: boolean) {
    // Manual on/off clears any old time rule so the switch does exactly what was tapped.
    const t = { [`t_${k}`]: null } as Record<string, Json>;
    if (k === "pause") return patch({ chat_paused: on }, t);
    if (k === "timer") return patch({ disappearing_seconds: on ? 3600 : 0 }, t);
    if (k === "nosave") return patch({ save_to_gallery_blocked: on }, t);
    if (k === "nocopy") return patch({}, { g_no_copy: on, ...t });
    if (k === "stealth") return patch({}, { g_stealth: on, ...t });
    if (k === "quiet") return patch({}, { g_quiet_on: on, ...t });
    onMute(on ? 8 * 3600e3 : 0);
    return undefined;
  }

  return (
    <>
      <div aria-label="Active controls" className="no-scrollbar pointer-events-none absolute inset-x-0 top-2 z-20 flex gap-1.5 overflow-x-auto px-3">
        {shown.map((k) => {
          const M = meta[k]; const on = active.includes(k);
          return (
            <button key={k} type="button" onClick={() => setOpen(k)}
              className={`pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border border-border/40 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur-md ${on ? "bg-background/70 text-primary" : "bg-muted/70 text-muted-foreground"}`}>
              <M.icon className="h-3.5 w-3.5" /> {M.label}
            </button>
          );
        })}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30" onClick={() => setOpen(null)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-4 pb-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {(() => { const M = meta[open]; const on = active.includes(open); return (
              <>
                <div className="flex items-center gap-3">
                  <M.icon className="h-5 w-5 text-primary" />
                  <p className="flex-1 text-[15px] font-bold">{M.label}</p>
                  <button type="button" role="switch" aria-checked={on} aria-label="Toggle" onClick={() => toggle(open, !on)}
                    className={`relative h-7 w-12 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
                {open === "timer" && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {TIMERS.slice(1).map((t) => (
                      <button key={t} type="button" onClick={() => patch({ disappearing_seconds: t })}
                        className={`rounded-full px-3 py-1 text-sm ${ctl?.disappearing_seconds === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{fmtT(t)}</button>
                    ))}
                  </div>
                )}
                <TimePanel key={open} bn={bn} noSchedule={open === "mute"} rule={open === "mute" ? null : parseRule(s[`t_${open}`])}
                  onSave={(rule) => {
                    if (open === "mute") { onMute(rule.mode === "unlimited" ? -1 : rule.mode === "until" ? Math.max(60e3, new Date(rule.until).getTime() - Date.now()) : 8 * 3600e3); setOpen(null); return; }
                    const t = { [`t_${open}`]: rule as unknown as Json };
                    const cols = open === "pause" ? { chat_paused: true } : open === "timer" ? { disappearing_seconds: ctl?.disappearing_seconds || 3600 } : open === "nosave" ? { save_to_gallery_blocked: true } : {};
                    const set = open === "nocopy" ? { g_no_copy: true } : open === "stealth" ? { g_stealth: true } : open === "quiet" ? { g_quiet_on: true } : {};
                    void patch(cols, { ...set, ...t });
                    toast.success(bn ? "সেভ হয়েছে" : "Saved");
                    setOpen(null);
                  }} />
                {false && open === "mute" && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[[8 * 3600e3, "8h"], [7 * 86400e3, "1 week"], [-1, "Always"]].map(([ms, l]) => (
                      <button key={String(l)} type="button" onClick={() => onMute(ms as number)} className="rounded-full bg-muted px-3 py-1 text-sm">{l}</button>
                    ))}
                  </div>
                )}
              </>
            ); })()}
          </div>
        </div>
      )}
    </>
  );
}

const PRESETS: [number, string, string][] = [[5 * 60e3, "৫ মিনিট", "5 min"], [3600e3, "১ ঘণ্টা", "1 hour"], [86400e3, "২৪ ঘণ্টা", "24 hours"], [7 * 86400e3, "১ সপ্তাহ", "1 week"]];
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

/** 4-in-1 timing: quick preset, custom clock time (hour/minute/AM-PM), unlimited, or date schedule. */
function TimePanel({ bn, rule, noSchedule, onSave }: { bn: boolean; rule: TimeRule | null; noSchedule?: boolean; onSave: (r: TimeRule) => void }) {
  type Tab = "quick" | "custom" | "unlimited" | "schedule";
  const [tab, setTab] = useState<Tab>(rule?.mode === "schedule" ? "schedule" : rule?.mode === "unlimited" ? "unlimited" : "quick");
  const [preset, setPreset] = useState(3600e3);
  const [h, setH] = useState(10); const [m, setM] = useState(30); const [pm, setPm] = useState(true);
  const now = new Date();
  const [start, setStart] = useState(rule?.mode === "schedule" ? localInput(new Date(rule.start)) : localInput(now));
  const [end, setEnd] = useState(rule?.mode === "schedule" ? localInput(new Date(rule.end)) : localInput(new Date(now.getTime() + 86400e3)));
  const [daily, setDaily] = useState(rule?.mode === "schedule" ? rule.daily : false);
  const tabs: [Tab, string][] = [["quick", bn ? "সময়" : "Quick"], ["custom", bn ? "কাস্টম" : "Custom"], ["unlimited", bn ? "আনলিমিটেড" : "Unlimited"], ...(noSchedule ? [] : [["schedule", bn ? "সিডিউল" : "Schedule"]] as [Tab, string][])];
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`;
  const field = "rounded-xl border border-border bg-muted px-2 py-2 text-[15px]";
  const status = rule?.mode === "until" ? `${bn ? "চলবে" : "Until"} ${new Date(rule.until).toLocaleString(bn ? "bn-BD" : "en-US", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}` : rule?.mode === "unlimited" ? (bn ? "আনলিমিটেড চলছে" : "Unlimited") : rule?.mode === "schedule" ? (bn ? "সিডিউল সেট আছে" : "Scheduled") : null;
  function save() {
    if (tab === "unlimited") return onSave({ mode: "unlimited" });
    if (tab === "quick") return onSave({ mode: "until", until: new Date(Date.now() + preset).toISOString() });
    if (tab === "custom") return onSave({ mode: "until", until: clockTarget(h, m, pm).toISOString() });
    const s = new Date(start), e = new Date(end);
    if (!(e > s)) { toast.error(bn ? "শেষের সময় শুরুর পরে দিন" : "End must be after start"); return; }
    onSave({ mode: "schedule", start: s.toISOString(), end: e.toISOString(), daily });
  }
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      {status && <p className="text-sm font-semibold text-primary">⏱ {status}</p>}
      <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
        {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full py-1.5 text-xs font-bold ${tab === k ? "bg-background text-primary shadow" : "text-muted-foreground"}`}>{l}</button>)}
      </div>
      {tab === "quick" && <div className="flex flex-wrap gap-1.5">{PRESETS.map(([ms, b, e]) => <button key={ms} type="button" onClick={() => setPreset(ms)} className={chip(preset === ms)}>{bn ? b : e}</button>)}</div>}
      {tab === "custom" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{bn ? "কখন পর্যন্ত চালু থাকবে:" : "Keep on until:"}</p>
          <div className="flex items-center gap-2">
            <select aria-label="Hour" value={h} onChange={(e) => setH(+e.target.value)} className={field}>{Array.from({ length: 12 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <span className="font-bold">:</span>
            <select aria-label="Minute" value={m} onChange={(e) => setM(+e.target.value)} className={field}>{Array.from({ length: 60 }, (_, i) => i).map((v) => <option key={v} value={v}>{String(v).padStart(2, "0")}</option>)}</select>
            <div className="flex rounded-full bg-muted p-1">
              {[false, true].map((v) => <button key={String(v)} type="button" onClick={() => setPm(v)} className={`rounded-full px-3 py-1 text-sm font-bold ${pm === v ? "bg-primary text-primary-foreground" : ""}`}>{v ? "PM" : "AM"}</button>)}
            </div>
          </div>
        </div>
      )}
      {tab === "unlimited" && <p className="text-sm text-muted-foreground">{bn ? "নিজে বন্ধ না করা পর্যন্ত চালু থাকবে।" : "Stays on until you turn it off."}</p>}
      {tab === "schedule" && (
        <div className="space-y-2">
          <label className="block text-sm">{bn ? "শুরু (তারিখ ও সময়)" : "Start (date & time)"}<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1 w-full ${field}`} /></label>
          <label className="block text-sm">{bn ? "শেষ (তারিখ ও সময়)" : "End (date & time)"}<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={`mt-1 w-full ${field}`} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} className="h-5 w-5 accent-primary" />{bn ? "এই তারিখগুলোতে প্রতিদিন একই সময়ে" : "Repeat daily at these times"}</label>
        </div>
      )}
      <button type="button" onClick={save} className="w-full rounded-full bg-primary py-3 text-[15px] font-bold text-primary-foreground">{bn ? "সেভ / চালু করুন" : "Save / turn on"}</button>
    </div>
  );
}
