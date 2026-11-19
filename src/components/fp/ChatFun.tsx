import { useEffect, useRef, useState } from "react";
import { Gift, Heart, Play, Gamepad2, Disc3, X } from "lucide-react";
import { GIFTS, WHEEL, parse, play, turnOf, watchOffset, winner, type FunKind, type Game } from "@/lib/chat-fun";

type Msg = { id: string; kind: string; body: string | null; sender_id: string; created_at: string };
type Send = (kind: FunKind, body: string) => void;

/** Menu opened from the chat "+" sheet. */
export function FunMenu({ bn, me, other, onSend, onClose }: { bn: boolean; me: string; other: string; onSend: Send; onClose: () => void }) {
  const [view, setView] = useState<"main" | "gift" | "watch">("main");
  const [url, setUrl] = useState("");
  const done = (k: FunKind, b: string) => { onSend(k, b); onClose(); };
  if (view === "gift")
    return (
      <div className="grid grid-cols-3 gap-2">
        {GIFTS.map((g) => (
          <button key={g.e} onClick={() => done("gift", g.e)} className="flex flex-col items-center gap-1 rounded-2xl bg-accent p-3 text-ui font-semibold active:scale-95">
            <span className="text-4xl">{g.e}</span>{bn ? g.bn : g.en}
          </button>
        ))}
      </div>
    );
  if (view === "watch")
    return (
      <div className="space-y-2">
        <p className="text-ui font-bold">{bn ? "ভিডিও বা অডিও লিংক দিন" : "Paste a video or audio link"}</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/video.mp4" className="w-full rounded-xl border bg-background px-3 py-2.5 text-ui" />
        <button disabled={!/^https:\/\//.test(url)} onClick={() => done("watch", JSON.stringify({ url, at: Date.now() }))} className="w-full rounded-full bg-primary py-2.5 text-ui font-bold text-primary-foreground disabled:opacity-50">
          {bn ? "একসাথে চালু করুন" : "Start together"}
        </button>
      </div>
    );
  const items = [
    { icon: Heart, bn: "লাভ ট্যাপ", en: "Love tap", run: () => done("love", "❤️") },
    { icon: Gift, bn: "উপহার", en: "Gift", run: () => setView("gift") },
    { icon: Gamepad2, bn: "টিক-ট্যাক-টো", en: "Tic-tac-toe", run: () => done("game", JSON.stringify({ b: "---------", x: me, o: other, id: crypto.randomUUID() } satisfies Game)) },
    { icon: Disc3, bn: "স্পিন হুইল", en: "Spin wheel", run: () => done("spin", String(Math.floor(Math.random() * WHEEL.length))) },
    { icon: Play, bn: "একসাথে দেখি", en: "Watch together", run: () => setView("watch") },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((o) => (
        <button key={o.en} onClick={o.run} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold active:bg-muted">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><o.icon className="h-6 w-6" /></span>
          {bn ? o.bn : o.en}
        </button>
      ))}
    </div>
  );
}

/** Full-screen floating hearts when a love tap arrives. */
export function LoveBurst({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} className="absolute bottom-0 animate-[fp-float_2.4s_ease-out_forwards] text-4xl"
          style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 120}ms` }}>{i % 3 ? "❤️" : "🌹"}</span>
      ))}
    </div>
  );
}

/** Renders a fun message card. `latestGame` = newest board for that game id. */
export function FunBubble({ m, mine, bn, me, time, isLatestGame, onSend, onWatch }: {
  m: Msg; mine: boolean; bn: boolean; me: string; time: string; isLatestGame: boolean; onSend: Send; onWatch: (url: string, at: number) => void;
}) {
  const [open, setOpen] = useState(mine);
  const wrap = (c: React.ReactNode) => (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[78%] rounded-2xl bg-background p-3 text-ui shadow-sm">{c}<p className="mt-1 text-right text-[10px] text-muted-foreground">{time}</p></div>
    </div>
  );
  if (m.kind === "love") return wrap(<p className="font-bold">❤️ {mine ? (bn ? "আপনি ভালোবাসা পাঠিয়েছেন" : "You sent a love tap") : bn ? "ভালোবাসা এসেছে!" : "Love tap!"}</p>);
  if (m.kind === "gift") {
    const g = GIFTS.find((x) => x.e === m.body);
    return wrap(open ? (
      <div className="text-center"><span className="block animate-bounce text-6xl">{m.body}</span><p className="font-bold">{g ? (bn ? g.bn : g.en) : ""}</p></div>
    ) : (
      <button onClick={() => { setOpen(true); navigator.vibrate?.(80); }} className="flex flex-col items-center gap-1 font-bold">
        <span className="text-6xl">🎁</span>{bn ? "ট্যাপ করে খুলুন" : "Tap to open"}
      </button>
    ));
  }
  if (m.kind === "spin") {
    const w = WHEEL[Number(m.body) % WHEEL.length]!;
    return wrap(<div><p className="text-xs font-bold text-muted-foreground">🎡 {bn ? "স্পিন হুইলের ফল" : "Wheel result"}</p><p className="font-bold">{bn ? w.bn : w.en}</p></div>);
  }
  if (m.kind === "watch") {
    const v = parse<{ url: string; at: number }>(m.body);
    if (!v) return null;
    return wrap(
      <button onClick={() => onWatch(v.url, v.at)} className="flex items-center gap-2 font-bold">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Play className="h-5 w-5" /></span>
        {bn ? "একসাথে দেখুন · যোগ দিন" : "Watch together · Join"}
      </button>,
    );
  }
  if (m.kind === "game") {
    const g = parse<Game>(m.body);
    if (!g) return null;
    const w = winner(g.b);
    const myTurn = isLatestGame && !w && turnOf(g) === me;
    const status = w === "draw" ? (bn ? "ড্র হয়েছে 🤝" : "Draw 🤝")
      : w ? ((w === "X" ? g.x : g.o) === me ? (bn ? "আপনি জিতেছেন 🏆" : "You won 🏆") : bn ? "সঙ্গী জিতেছে 🏆" : "Partner won 🏆")
      : !isLatestGame ? (bn ? "আগের চাল" : "Earlier move") : myTurn ? (bn ? "আপনার চাল" : "Your turn") : bn ? "সঙ্গীর চাল" : "Partner's turn";
    return wrap(
      <div>
        <p className="mb-2 text-xs font-bold text-muted-foreground">🎮 {status}</p>
        <div className="grid w-40 grid-cols-3 gap-1">
          {[...g.b].map((c, i) => (
            <button key={i} disabled={!myTurn || c !== "-"} onClick={() => { const n = play(g, i, me); if (n) onSend("game", JSON.stringify(n)); }}
              className="flex h-12 items-center justify-center rounded-lg bg-muted text-2xl font-extrabold text-primary disabled:opacity-90">
              {c === "X" ? "❌" : c === "O" ? "⭕" : ""}
            </button>
          ))}
        </div>
      </div>,
    );
  }
  return null;
}

/** Small floating player pinned above the chat; joins at the shared position. */
export function WatchBar({ url, at, onClose }: { url: string; at: number; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const sync = () => { const t = watchOffset(at); if (!v.duration || t < v.duration) v.currentTime = t; v.play().catch(() => {}); };
    v.addEventListener("loadedmetadata", sync, { once: true });
  }, [url, at]);
  return (
    <div className="absolute inset-x-2 top-16 z-40 overflow-hidden rounded-2xl bg-foreground shadow-xl">
      <video ref={ref} src={url} controls playsInline className="max-h-48 w-full" />
      <button aria-label="Close player" onClick={onClose} className="absolute right-2 top-2 rounded-full bg-background/80 p-1"><X className="h-4 w-4" /></button>
    </div>
  );
}
