import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Link2 } from "lucide-react";
import { FpAvatar } from "@/components/fp/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { lastSeenText } from "@/components/fp/ChatExtras";

/* ---------- Wallpaper ---------- */
export const WALLPAPERS = ["plain", "doodle", "dots", "soft"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];
export const WALL_LABEL: Record<Wallpaper, { bn: string; en: string }> = {
  plain: { bn: "সাধারণ", en: "Plain" },
  doodle: { bn: "ডুডল", en: "Doodle" },
  dots: { bn: "ডট", en: "Dots" },
  soft: { bn: "সফট গ্রেডিয়েন্ট", en: "Soft gradient" },
};
export function useWallpaper(): [Wallpaper, (w: Wallpaper) => void] {
  const [w, setW] = useState<Wallpaper>("doodle");
  useEffect(() => {
    const v = localStorage.getItem("fp-wallpaper") as Wallpaper | null;
    if (v && WALLPAPERS.includes(v)) setW(v);
  }, []);
  return [w, (v) => { localStorage.setItem("fp-wallpaper", v); setW(v); }];
}
export function WallpaperLayer({ kind }: { kind: Wallpaper }) {
  if (kind === "plain") return null;
  if (kind === "soft") return <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-accent/40" />;
  return <div aria-hidden className={`pointer-events-none absolute inset-0 bg-foreground/[0.07] ${kind === "doodle" ? "chat-doodle" : "chat-dots"}`} />;
}

/* ---------- Delete for me (stored on this device) ---------- */
export function useHiddenMessages(userId: string | undefined) {
  const key = `fp-hidden-${userId ?? "x"}`;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setHidden(new Set(JSON.parse(localStorage.getItem(key) ?? "[]"))); } catch { setHidden(new Set()); }
  }, [key]);
  function hide(ids: string[]) {
    setHidden((old) => {
      const n = new Set(old); ids.forEach((i) => n.add(i));
      localStorage.setItem(key, JSON.stringify([...n].slice(-2000)));
      return n;
    });
  }
  return { hidden, hide };
}

/* ---------- Emoji panel ---------- */
export const EMOJI_CATS: { icon: string; bn: string; list: string[] }[] = [
  { icon: "😀", bn: "স্মাইলি", list: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🥵 🥶 😎 🤓 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬".split(" ") },
  { icon: "👍", bn: "হাত", list: "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 👀 💋".split(" ") },
  { icon: "❤️", bn: "ভালোবাসা", list: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 🌹 🌷 🌸 💐 💌".split(" ") },
  { icon: "🐶", bn: "প্রকৃতি", list: "🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦋 🐝 🌙 ☀️ ⭐ 🌟 ✨ 🔥 🌈 ☁️ ⛈️ ❄️ 🌊 🍀 🌴".split(" ") },
  { icon: "🍕", bn: "খাবার", list: "🍎 🍊 🍋 🍌 🍉 🍇 🍓 🥭 🍍 🥥 🍅 🌶️ 🌽 🍞 🧀 🍗 🍖 🍔 🍟 🍕 🌭 🍜 🍛 🍚 🍰 🎂 🍫 🍩 🍪 ☕ 🍵 🥤 🧃".split(" ") },
  { icon: "🎉", bn: "অন্যান্য", list: "🎉 🎊 🎁 🎈 🏆 ⚽ 🏏 🎮 🎵 🎶 📞 📱 💻 📷 🎥 📚 ✏️ 💡 💰 🕌 🕋 ⏰ ✅ ❌ ⚠️ ❓ ❗ 💯 🆗 🇧🇩".split(" ") },
];
export function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const [cat, setCat] = useState(0);
  return (
    <div className="flex h-[148px] shrink-0 flex-col overflow-hidden border-t border-border" role="region" aria-label="Emoji picker">
      <div className="flex gap-1 overflow-x-auto px-2 pt-1.5">
        {EMOJI_CATS.map((c, i) => (
          <button key={c.icon} type="button" aria-label={c.bn} onClick={() => setCat(i)}
            className={`shrink-0 rounded-full px-3 py-1 text-xl ${cat === i ? "bg-primary/15" : ""}`}>{c.icon}</button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-8 content-start gap-1 overflow-y-auto px-2 pb-2 pt-1 text-2xl">
        {(EMOJI_CATS[cat]?.list ?? []).map((em) => (
          <button key={em} type="button" onClick={() => onPick(em)} className="rounded-lg p-1 active:bg-muted">{em}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Hold-to-record voice ---------- */
export function useHoldRecorder(onDone: (f: File) => void, onError: () => void) {
  const rec = useRef<MediaRecorder | null>(null);
  const cancel = useRef(false);
  const startX = useRef(0);
  const [secs, setSecs] = useState(0);
  const [active, setActive] = useState(false);
  const [drag, setDrag] = useState(0);
  const [locked, setLocked] = useState(false);
  const startY = useRef(0);
  const preview = useRef(false);
  const startedAt = useRef(0);
  const [draft, setDraft] = useState<File | null>(null);
  useEffect(() => {
    if (!active) return;
    setSecs(0);
    const i = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [active]);
  async function start(x: number, y = 0) {
    if (rec.current) return;
    cancel.current = false; preview.current = true; startedAt.current = Date.now(); startX.current = x; startY.current = y; setDrag(0); setLocked(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (ev) => chunks.push(ev.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        rec.current = null; setActive(false); setDrag(0); setLocked(false);
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        if (cancel.current || !blob.size) return;
        const f = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        if (preview.current) setDraft(f); else onDone(f);
      };
      rec.current = r; r.start(); setActive(true);
    } catch { onError(); }
  }
  function move(x: number, y = 0) {
    if (!rec.current || lockedRef.current) return;
    if (y && startY.current - y > 70) { lockedRef.current = true; setLocked(true); setDrag(0); return; }
    const d = Math.min(0, x - startX.current);
    setDrag(d);
    if (d < -100) { cancel.current = true; rec.current.stop(); }
  }
  const lockedRef = useRef(false);
  useEffect(() => { if (!active) lockedRef.current = false; }, [active]);
  /** Finger lifted: sends unless hands-free lock is on. */
  function release() {
    if (lockedRef.current) return;
    // Quick tap = hands-free mode; keeps recording until the user stops or cancels.
    if (Date.now() - startedAt.current < 400) { lockedRef.current = true; setLocked(true); setDrag(0); return; }
    rec.current?.stop();
  }
  function stop() { rec.current?.stop(); }
  /** Stop a locked recording and keep it for listening before sending. */
  function stopToPreview() { preview.current = true; rec.current?.stop(); }
  function abort() { cancel.current = true; rec.current?.stop(); }
  function sendDraft() { if (draft) onDone(draft); setDraft(null); }
  return { active, secs, drag, locked, draft, start, move, release, stop, stopToPreview, abort, sendDraft, discardDraft: () => setDraft(null) };
}
export const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* ---------- Contact info + shared media ---------- */
type MediaMsg = { id: string; body: string | null; file_path: string | null; file_name: string | null; file_type: string | null; deleted_at: string | null; created_at: string };
export function ContactInfo({
  name, photo, lastSeen, code, messages, bn, onClose, onImage, wallpaper, setWallpaper, starred,
}: {
  name: string; photo?: string | null | undefined; lastSeen?: string | null | undefined; code?: string | null | undefined;
  messages: MediaMsg[]; bn: boolean; onClose: () => void; onImage: (u: string) => void;
  wallpaper: Wallpaper; setWallpaper: (w: Wallpaper) => void; starred?: Set<string>;
}) {
  const [tab, setTab] = useState<"media" | "docs" | "links" | "starred">("media");
  const live = messages.filter((m) => !m.deleted_at);
  const media = live.filter((m) => m.file_path && /^(image|video)\//.test(m.file_type ?? ""));
  const docs = live.filter((m) => m.file_path && !/^(image|video)\//.test(m.file_type ?? ""));
  const stars = live.filter((m) => starred?.has(m.id));
  const links = live.flatMap((m) => (m.body?.match(/https?:\/\/\S+/g) ?? []).map((u) => ({ id: m.id + u, u })));
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 bg-primary px-2 py-2.5 text-primary-foreground">
        <button aria-label="Back" onClick={onClose} className="rounded-full p-1.5"><ArrowLeft className="h-5 w-5" /></button>
        <p className="font-bold">{bn ? "কন্টাক্ট ইনফো" : "Contact info"}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-1 p-6">
          <FpAvatar name={name} photo={photo} size={112} />
          <p className="mt-2 text-xl font-extrabold">{name}</p>
          <p className="text-sm text-muted-foreground">{lastSeenText(lastSeen, bn)}</p>
          {code && <p className="mt-1 rounded-full bg-muted px-3 py-1 font-mono text-xs">{code}</p>}
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-sm font-bold">{bn ? "চ্যাট ওয়ালপেপার" : "Chat wallpaper"}</p>
          <div className="grid grid-cols-4 gap-2">
            {WALLPAPERS.map((w) => (
              <button key={w} onClick={() => setWallpaper(w)}
                className={`relative h-16 overflow-hidden rounded-xl border-2 bg-chat-bg ${wallpaper === w ? "border-primary" : "border-border"}`}>
                <WallpaperLayer kind={w} />
                <span className="absolute inset-x-0 bottom-0 bg-background/80 text-[10px] font-semibold">{bn ? WALL_LABEL[w].bn : WALL_LABEL[w].en}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-border">
          <div className="flex">
            {([["media", bn ? "মিডিয়া" : "Media", media.length], ["docs", bn ? "ফাইল" : "Docs", docs.length], ["links", bn ? "লিংক" : "Links", links.length], ["starred", "⭐", stars.length]] as const).map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 border-b-2 py-2.5 text-sm font-semibold ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{l} ({n})</button>
            ))}
          </div>
          {tab === "media" && (media.length ? (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">{media.map((m) => <MediaThumb key={m.id} m={m} onImage={onImage} />)}</div>
          ) : <Empty bn={bn} icon={<ImageIcon className="h-8 w-8" />} />)}
          {tab === "docs" && (docs.length ? docs.map((m) => <DocRow key={m.id} m={m} bn={bn} />) : <Empty bn={bn} icon={<FileText className="h-8 w-8" />} />)}
          {tab === "links" && (links.length ? links.map((l) => (
            <a key={l.id} href={l.u} target="_blank" rel="noreferrer" className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-primary">
              <Link2 className="h-4 w-4 shrink-0" /><span className="truncate">{l.u}</span>
            </a>
          )) : <Empty bn={bn} icon={<Link2 className="h-8 w-8" />} />)}
          {tab === "starred" && (stars.length ? stars.map((m) => (
            <div key={m.id} className="border-b border-border px-4 py-3 text-sm">
              <p className="line-clamp-3 break-words">{m.body ?? `📎 ${m.file_name ?? ""}`}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">⭐ {new Date(m.created_at).toLocaleString(bn ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
          )) : <Empty bn={bn} icon={<span className="text-3xl">⭐</span>} />)}
        </div>
      </div>
    </div>
  );
}
function Empty({ bn, icon }: { bn: boolean; icon: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">{icon}<p className="text-sm">{bn ? "এখনো কিছু নেই" : "Nothing yet"}</p></div>;
}
function useSigned(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    supabase.storage.from("fixedpair-files").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url;
}
function MediaThumb({ m, onImage }: { m: MediaMsg; onImage: (u: string) => void }) {
  const url = useSigned(m.file_path);
  const video = (m.file_type ?? "").startsWith("video/");
  return (
    <button onClick={() => url && (video ? window.open(url, "_blank") : onImage(url))} className="relative aspect-square overflow-hidden bg-muted">
      {url && (video ? <video src={url} preload="metadata" className="h-full w-full object-cover" /> : <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />)}
      {video && <span className="absolute bottom-1 right-1 rounded bg-foreground/60 px-1 text-[10px] text-background">▶</span>}
    </button>
  );
}
function DocRow({ m, bn }: { m: MediaMsg; bn: boolean }) {
  const url = useSigned(m.file_path);
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 border-b border-border px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary"><FileText className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{m.file_name}</p>
        <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString(bn ? "bn-BD" : "en-GB")}</p>
      </div>
    </a>
  );
}
