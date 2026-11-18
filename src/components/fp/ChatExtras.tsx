import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X, ZoomIn, ZoomOut } from "lucide-react";

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export type Reactions = Record<string, string[]>;

/** One reaction per user: picking the same emoji again removes it. */
export function toggleReaction(r: Reactions | null | undefined, emoji: string, userId: string): Reactions {
  const had = (r?.[emoji] ?? []).includes(userId);
  const next: Reactions = {};
  for (const [k, v] of Object.entries(r ?? {})) {
    const list = v.filter((u) => u !== userId);
    if (list.length) next[k] = list;
  }
  if (!had) next[emoji] = [...(next[emoji] ?? []), userId];
  return next;
}

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export function canEdit(m: { kind: string; body: string | null; file_path: string | null; created_at: string; deleted_at: string | null }, now = Date.now()) {
  return m.kind !== "call" && !!m.body && !m.file_path && !m.deleted_at && now - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function sameDay(a: string, b: string) {
  return dayKey(new Date(a)) === dayKey(new Date(b));
}
export function dayLabel(iso: string, bn: boolean, now = new Date()) {
  const d = new Date(iso);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return bn ? "আজ" : "Today";
  if (dayKey(d) === dayKey(y)) return bn ? "গতকাল" : "Yesterday";
  return d.toLocaleDateString(bn ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function DateDivider({ iso, bn }: { iso: string; bn: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-background/90 px-3 py-1 text-[11px] font-bold text-muted-foreground shadow-sm">{dayLabel(iso, bn)}</span>
    </div>
  );
}

/** "Active now" within 2 minutes, otherwise "X min ago" etc. */
export function lastSeenText(iso: string | null | undefined, bn: boolean, now = Date.now()) {
  if (!iso) return bn ? "অফলাইন" : "Offline";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 120) return bn ? "সক্রিয়" : "Active now";
  const m = Math.floor(s / 60);
  if (m < 60) return bn ? `${m} মিনিট আগে সক্রিয়` : `Active ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return bn ? `${h} ঘণ্টা আগে সক্রিয়` : `Active ${h} h ago`;
  const d = Math.floor(h / 24);
  return bn ? `${d} দিন আগে সক্রিয়` : `Active ${d} d ago`;
}

export function TypingDots({ bn }: { bn: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {bn ? "টাইপ করছেন" : "typing"}
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
    </span>
  );
}

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
const SPEEDS = [1, 1.5, 2];

export function VoicePlayer({ src, mine }: { src: string; mine: boolean }) {
  const a = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  useEffect(() => { if (a.current) a.current.playbackRate = speed; }, [speed]);
  const toggle = () => {
    const el = a.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };
  return (
    <div className="flex w-60 items-center gap-2">
      <audio
        ref={a}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
      />
      <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mine ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <Waveform seed={src.split("?")[0] ?? src} progress={dur > 0 ? cur / dur : 0} playing={playing}
          onSeek={(f) => { if (a.current && dur > 0) { a.current.currentTime = f * dur; setCur(f * dur); } }} />
        <p className="mt-0.5 text-[10px] opacity-80">{fmt(cur)} / {fmt(dur)}</p>
      </div>
      <button type="button" aria-label="Playback speed" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1)}
        className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-bold">
        {speed}x
      </button>
    </div>
  );
}

/** Fullscreen image with pinch / wheel / double-tap zoom and drag-to-pan. */
export function MediaViewer({ src, onClose, blockSave, onPrev, onNext, index, total }: { src: string; onClose: () => void; blockSave?: boolean; onPrev?: (() => void) | undefined; onNext?: (() => void) | undefined; index?: number; total?: number }) {
  const swipe = useRef<number | null>(null);
  const [sx, setSx] = useState(0);
  const [z, setZ] = useState(1);
  const [p, setP] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const clamp = (v: number) => Math.min(5, Math.max(1, v));
  const setZoom = (v: number) => { const n = clamp(v); setZ(n); if (n === 1) setP({ x: 0, y: 0 }); };
  const dist = (t: React.TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
  return (
    <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overflow-hidden bg-foreground"
      onWheel={(e) => setZoom(z - e.deltaY * 0.002)}
      onTouchStart={(e) => {
        if (e.touches.length === 2) pinch.current = { d: dist(e.touches), z };
        else { drag.current = { x: e.touches[0]!.clientX - p.x, y: e.touches[0]!.clientY - p.y }; if (z === 1) swipe.current = e.touches[0]!.clientX; }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 2 && pinch.current) setZoom(pinch.current.z * (dist(e.touches) / pinch.current.d));
        else if (drag.current && z > 1) setP({ x: e.touches[0]!.clientX - drag.current.x, y: e.touches[0]!.clientY - drag.current.y });
        else if (swipe.current !== null) setSx(e.touches[0]!.clientX - swipe.current);
      }}
      onTouchEnd={() => {
        pinch.current = null; drag.current = null;
        if (swipe.current !== null) { if (sx < -60) onNext?.(); else if (sx > 60) onPrev?.(); }
        swipe.current = null; setSx(0);
      }}
      onMouseDown={(e) => { drag.current = { x: e.clientX - p.x, y: e.clientY - p.y }; }}
      onMouseMove={(e) => { if (drag.current && z > 1) setP({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
      onMouseUp={() => { drag.current = null; }}
    >
      <img src={src} alt="" draggable={false} onContextMenu={blockSave ? (e) => e.preventDefault() : undefined}
        onDoubleClick={() => setZoom(z > 1 ? 1 : 2.5)}
        style={{ transform: `translate(${p.x + sx}px, ${p.y}px) scale(${z})` }}
        className="max-h-full max-w-full select-none object-contain transition-transform duration-75" />
      <div className="absolute right-3 top-3 flex gap-2 text-background">
        <button aria-label="Zoom out" onClick={() => setZoom(z - 0.5)} className="rounded-full bg-background/20 p-2"><ZoomOut className="h-5 w-5" /></button>
        <button aria-label="Zoom in" onClick={() => setZoom(z + 0.5)} className="rounded-full bg-background/20 p-2"><ZoomIn className="h-5 w-5" /></button>
        <button aria-label="Close" onClick={onClose} className="rounded-full bg-background/20 p-2"><X className="h-5 w-5" /></button>
      </div>
      {total !== undefined && total > 1 && index !== undefined && index >= 0 && (
        <>
          {onPrev && <button aria-label="Previous photo" onClick={onPrev} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/20 p-2 text-background"><ChevronLeft className="h-6 w-6" /></button>}
          {onNext && <button aria-label="Next photo" onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/20 p-2 text-background"><ChevronRight className="h-6 w-6" /></button>}
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-background/20 px-3 py-1 text-sm text-background">{index + 1} / {total}</span>
        </>
      )}
    </div>
  );
}


/** Stable pseudo-random bar heights for a voice note, derived from its file path. */
export function waveBars(seed: string, n = 32) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    const env = Math.sin((Math.PI * (i + 1)) / (n + 1));
    out.push(Math.round(20 + 80 * (0.35 * env + 0.65 * r)));
  }
  return out;
}

function Waveform({ seed, progress, playing, onSeek }: { seed: string; progress: number; playing: boolean; onSeek: (f: number) => void }) {
  const bars = waveBars(seed);
  return (
    <div role="slider" aria-label="Seek" aria-valuenow={Math.round(progress * 100)} tabIndex={0}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); }}
      className="flex h-7 cursor-pointer items-center gap-[2px]">
      {bars.map((b, i) => {
        const on = i / bars.length < progress;
        return <span key={i} className={`w-[3px] flex-1 rounded-full bg-current transition-opacity ${on ? "opacity-100" : "opacity-35"} ${playing && on && i === Math.floor(progress * bars.length) - 1 ? "animate-pulse" : ""}`} style={{ height: `${b}%` }} />;
      })}
    </div>
  );
}

/** Starred messages, kept per user on this device. */
export function useStarred(userId: string | undefined) {
  const key = `fp-starred-${userId ?? "anon"}`;
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setIds(new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[])); } catch { setIds(new Set()); }
  }, [key]);
  function toggle(id: string) {
    setIds((old) => {
      const n = new Set(old);
      if (n.has(id)) n.delete(id); else n.add(id);
      localStorage.setItem(key, JSON.stringify([...n]));
      return n;
    });
  }
  return { starred: ids, toggleStar: toggle };
}

export const firstUrl = (t: string | null | undefined) => t?.match(/https?:\/\/[^\s<>"]+/)?.[0] ?? null;

/** True when a message's self-destruct time has passed. */
export const isExpired = (m: { expires_at?: string | null }, now = Date.now()) => !!m.expires_at && new Date(m.expires_at).getTime() <= now;
