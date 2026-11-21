import { useEffect, useRef, useState } from "react";
import { Gift, Heart, Play, Pause, Gamepad2, Disc3, X, HelpCircle, Dices, Hand, Shield } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  GIFTS, WHEEL, QUIZ, LUDO_END, TAP_SECONDS, parse, parseGift, play, turnOf, winner, quizCorrect, newLudo, ludoMove, ludoWinner, canMove,
  tapResult, youtubeId, socialEmbed, watchPos, type FunKind, type Game, type Quiz, type Ludo, type Tap, type Watch,
} from "@/lib/chat-fun";

type Msg = { id: string; kind: string; body: string | null; sender_id: string; created_at: string };
type Send = (kind: FunKind, body: string) => void;

/** Menu opened from the chat "+" sheet. */
export function FunMenu({ bn, me, other, onSend, onClose, onTap }: { bn: boolean; me: string; other: string; onSend: Send; onClose: () => void; onTap: () => void }) {
  const [view, setView] = useState<"main" | "gift" | "watch" | "quiz">("main");
  const [url, setUrl] = useState("");
  const [gift, setGift] = useState(GIFTS[0]!.e);
  const [note, setNote] = useState("");
  const [q, setQ] = useState<number | null>(null);
  const done = (k: FunKind, b: string) => { onSend(k, b); onClose(); };
  if (view === "gift")
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {GIFTS.map((g) => (
            <button key={g.e} onClick={() => setGift(g.e)} className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-ui font-semibold active:scale-95 ${gift === g.e ? "bg-primary/20 ring-2 ring-primary" : "bg-accent"}`}>
              <span className="text-4xl">{g.e}</span>{bn ? g.bn : g.en}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={3}
          placeholder={bn ? "গোপন লাভ নোট লিখুন (ইচ্ছা হলে) 💌" : "Secret love note (optional) 💌"} className="w-full rounded-xl border bg-background px-3 py-2.5 text-ui" />
        <button onClick={() => done("gift", JSON.stringify({ e: gift, ...(note.trim() ? { note: note.trim() } : {}) }))} className="w-full rounded-full bg-primary py-2.5 text-ui font-bold text-primary-foreground">
          {bn ? "উপহার পাঠান 🎁" : "Send gift 🎁"}
        </button>
      </div>
    );
  if (view === "quiz")
    return q === null ? (
      <div className="space-y-2">
        <p className="text-ui font-bold">{bn ? "একটা প্রশ্ন বেছে নিন" : "Pick a question"}</p>
        {QUIZ.map((z, i) => (
          <button key={i} onClick={() => setQ(i)} className="w-full rounded-xl bg-accent px-3 py-2.5 text-left text-ui font-semibold active:scale-[.98]">{bn ? z.bn : z.en}</button>
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-ui font-bold">{bn ? "আপনার আসল উত্তর কোনটা? (সঙ্গী দেখবে না)" : "Your real answer? (hidden)"}</p>
        <div className="grid grid-cols-2 gap-2">
          {QUIZ[q]!.o.map((o, i) => (
            <button key={o} onClick={() => done("quiz", JSON.stringify({ id: crypto.randomUUID(), q, by: me, a: i } satisfies Quiz))} className="rounded-xl bg-accent px-3 py-3 text-ui font-semibold active:scale-95">{o}</button>
          ))}
        </div>
      </div>
    );
  if (view === "watch")
    return (
      <div className="space-y-2">
        <p className="text-ui font-bold">{bn ? "ভিডিও বা অডিও লিংক দিন" : "Paste a video or audio link"}</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={bn ? "ইউটিউব বা ভিডিও/অডিও লিংক" : "YouTube or video/audio link"} className="w-full rounded-xl border bg-background px-3 py-2.5 text-ui" />
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
    { icon: HelpCircle, bn: "কাপল কুইজ", en: "Couple quiz", run: () => setView("quiz") },
    { icon: Dices, bn: "লুডু", en: "Ludo", run: () => done("ludo", JSON.stringify(newLudo(me, other))) },
    { icon: Hand, bn: "দ্রুত ট্যাপ", en: "Fastest finger", run: () => { onClose(); onTap(); } },
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
export function FunBubble({ m, mine, bn, me, time, isLatestGame, onSend, onWatch, msgs, onTap }: {
  m: Msg; mine: boolean; bn: boolean; me: string; time: string; isLatestGame: boolean; onSend: Send; onWatch: (w: Watch) => void;
  msgs: Msg[]; onTap: (start: Tap) => void;
}) {
  const [open, setOpen] = useState(mine);
  const wrap = (c: React.ReactNode) => (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[78%] rounded-2xl bg-background p-3 text-ui shadow-sm">{c}<p className="mt-1 text-right text-[10px] text-muted-foreground">{time}</p></div>
    </div>
  );
  if (m.kind === "love") return wrap(<p className="font-bold">❤️ {mine ? (bn ? "আপনি ভালোবাসা পাঠিয়েছেন" : "You sent a love tap") : bn ? "ভালোবাসা এসেছে!" : "Love tap!"}</p>);
  if (m.kind === "gift") {
    const gb = parseGift(m.body);
    const g = GIFTS.find((x) => x.e === gb?.e);
    return wrap(open ? (
      <div className="text-center"><span className="block animate-bounce text-6xl">{gb?.e}</span><p className="font-bold">{g ? (bn ? g.bn : g.en) : ""}</p>
        {gb?.note && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-primary/10 p-2 text-ui italic">💌 {gb.note}</p>}</div>
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
    const v = parse<Watch>(m.body);
    if (!v) return null;
    if (v.sync) return <p className="text-center text-[11px] text-muted-foreground">🎬 {v.p !== undefined ? (bn ? "ভিডিও থামানো হয়েছে" : "Paused") : bn ? "ভিডিও চলছে" : "Playing"} · {time}</p>;
    return wrap(
      <button onClick={() => onWatch(v)} className="flex items-center gap-2 font-bold">
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
  if (m.kind === "quiz") {
    const z = parse<Quiz>(m.body);
    const Q = z && QUIZ[z.q];
    if (!z || !Q) return null;
    if (z.g !== undefined) {
      const ok = quizCorrect(z);
      return wrap(<div><p className="text-xs font-bold text-muted-foreground">💞 {bn ? Q.bn : Q.en}</p>
        <p className="font-bold">{bn ? "উত্তর" : "Guess"}: {Q.o[z.g]} {ok ? "✅" : "❌"}</p>
        {!ok && <p className="text-xs">{bn ? "আসল উত্তর" : "Answer"}: {Q.o[z.a]}</p>}
        <p className="mt-1 font-bold">{ok ? (bn ? "দারুণ! মনের মিল 💯❤️" : "Perfect match 💯❤️") : bn ? "আরেকটু চিনতে হবে 😄" : "Almost 😄"}</p></div>);
    }
    const answered = msgs.some((x) => x.kind === "quiz" && parse<Quiz>(x.body)?.id === z.id && parse<Quiz>(x.body)?.g !== undefined);
    return wrap(<div><p className="text-xs font-bold text-muted-foreground">💞 {bn ? "কাপল কুইজ" : "Couple quiz"}</p><p className="mb-2 font-bold">{bn ? Q.bn : Q.en}</p>
      {mine || answered ? <p className="text-xs text-muted-foreground">{answered ? (bn ? "উত্তর দেওয়া হয়েছে" : "Answered") : bn ? "সঙ্গীর উত্তরের অপেক্ষা…" : "Waiting for partner…"}</p> : (
        <div className="grid grid-cols-2 gap-1.5">{Q.o.map((o, i) => (
          <button key={o} onClick={() => onSend("quiz", JSON.stringify({ ...z, g: i }))} className="rounded-lg bg-muted px-2 py-2 text-ui font-semibold active:scale-95">{o}</button>))}</div>)}</div>);
  }
  if (m.kind === "ludo") return wrap(<LudoCard g={parse<Ludo>(m.body)} me={me} bn={bn} latest={isLatestGame} onSend={onSend} />);
  if (m.kind === "tap") {
    const t = parse<Tap>(m.body);
    if (!t) return null;
    if (t.reply) {
      const start = msgs.map((x) => (x.kind === "tap" ? parse<Tap>(x.body) : null)).find((x) => x && x.id === t.id && !x.reply);
      const r = start ? tapResult(start, t, me) : null;
      return wrap(<div className="text-center"><p className="text-xs font-bold text-muted-foreground">👆 {bn ? "দ্রুত ট্যাপ ফলাফল" : "Tap result"}</p>
        {start && <p className="font-bold">{start.by === me ? (bn ? "আপনি" : "You") : bn ? "সঙ্গী" : "Partner"} {start.n} · {t.by === me ? (bn ? "আপনি" : "You") : bn ? "সঙ্গী" : "Partner"} {t.n}</p>}
        <p className="text-lg font-extrabold">{r === "win" ? (bn ? "🎆 আপনি জিতেছেন!" : "🎆 You won!") : r === "lose" ? (bn ? "🎆 সঙ্গী জিতেছে!" : "🎆 Partner won!") : bn ? "🤝 সমান সমান" : "🤝 Draw"}</p></div>);
    }
    const replied = msgs.some((x) => x.kind === "tap" && parse<Tap>(x.body)?.id === t.id && parse<Tap>(x.body)?.reply);
    return wrap(<div className="text-center"><p className="text-xs font-bold text-muted-foreground">👆 {bn ? "দ্রুত ট্যাপ চ্যালেঞ্জ" : "Fastest finger"}</p>
      <p className="font-bold">{mine ? (bn ? `আপনার স্কোর ${t.n}` : `Your score ${t.n}`) : bn ? "সঙ্গী চ্যালেঞ্জ দিয়েছে!" : "You're challenged!"}</p>
      {!mine && !replied && <button onClick={() => onTap(t)} className="mt-2 rounded-full bg-primary px-4 py-2 font-bold text-primary-foreground">{bn ? "খেলুন" : "Play"}</button>}
      {mine && !replied && <p className="text-xs text-muted-foreground">{bn ? "সঙ্গীর অপেক্ষা…" : "Waiting…"}</p>}</div>);
  }
  return null;
}

function LudoCard({ g, me, bn, latest, onSend }: { g: Ludo | null; me: string; bn: boolean; latest: boolean; onSend: Send }) {
  const [roll, setRoll] = useState<number | null>(null);
  if (!g) return null;
  const w = ludoWinner(g);
  const myTurn = latest && !w && g.turn === me;
  const mine = me === g.x ? g.px : g.po;
  const theirs = me === g.x ? g.po : g.px;
  const send = (n: Ludo | null) => { if (n) { onSend("ludo", JSON.stringify(n)); setRoll(null); } };
  const bar = (ps: number[], emoji: string) => (
    <div className="relative h-7 rounded-full bg-muted">
      {ps.map((p, i) => <span key={i} className="absolute top-0 text-xl transition-all" style={{ left: `calc(${(p / LUDO_END) * 88}% + ${i * 6}px)` }}>{p === LUDO_END ? "🏁" : emoji}</span>)}
    </div>
  );
  const status = w ? (w === me ? (bn ? "আপনি জিতেছেন 🏆" : "You won 🏆") : bn ? "সঙ্গী জিতেছে 🏆" : "Partner won 🏆")
    : !latest ? (bn ? "আগের চাল" : "Earlier move") : myTurn ? (bn ? "আপনার চাল — ছক্কা ঘোরান" : "Your turn — roll") : bn ? "সঙ্গীর চাল" : "Partner's turn";
  return (
    <div className="w-56 space-y-2">
      <p className="text-xs font-bold text-muted-foreground">🎲 {bn ? "লুডু" : "Ludo"} · {status}{g.last ? ` · ${g.last}` : ""}</p>
      <p className="text-[11px]">{bn ? "আপনি" : "You"}</p>{bar(mine, "🔴")}
      <p className="text-[11px]">{bn ? "সঙ্গী" : "Partner"}</p>{bar(theirs, "🔵")}
      {myTurn && (roll === null ? (
        <button onClick={() => setRoll(1 + Math.floor(Math.random() * 6))} className="w-full rounded-full bg-primary py-2 font-bold text-primary-foreground">🎲 {bn ? "ছক্কা ঘোরান" : "Roll"}</button>
      ) : (
        <div className="space-y-1">
          <p className="text-center text-2xl font-extrabold">🎲 {roll}</p>
          {mine.some((p) => canMove(p, roll)) ? (
            <div className="flex gap-1">{mine.map((p, i) => (
              <button key={i} disabled={!canMove(p, roll)} onClick={() => send(ludoMove(g, me, roll, i))} className="flex-1 rounded-lg bg-accent py-2 text-ui font-bold disabled:opacity-40">{bn ? `ঘুঁটি ${i + 1}` : `Token ${i + 1}`}</button>))}</div>
          ) : (
            <button onClick={() => send(ludoMove(g, me, roll, null))} className="w-full rounded-lg bg-accent py-2 text-ui font-bold">{bn ? "চাল নেই — পাস" : "No move — pass"}</button>
          )}
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">{bn ? "৬ উঠলে ঘুঁটি বের হয় ও আবার চাল; দুই ঘুঁটি শেষে জয়" : "6 to start & roll again; finish both tokens"}</p>
    </div>
  );
}

/** Full-screen 5-second tap battle. */
export function TapGame({ bn, onDone, onClose }: { bn: boolean; onDone: (n: number) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<number>(3); // 3,2,1 countdown, 0 = playing, -1 = done
  const [n, setN] = useState(0);
  const [left, setLeft] = useState(TAP_SECONDS);
  const nRef = useRef(0);
  useEffect(() => {
    if (phase > 0) { const t = setTimeout(() => setPhase(phase - 1), 800); return () => clearTimeout(t); }
    if (phase === 0) {
      const end = Date.now() + TAP_SECONDS * 1000;
      const t = setInterval(() => {
        const l = Math.max(0, Math.ceil((end - Date.now()) / 1000)); setLeft(l);
        if (Date.now() >= end) { clearInterval(t); setPhase(-1); onDone(nRef.current); }
      }, 100);
      return () => clearInterval(t);
    }
    return undefined;
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-background/95 backdrop-blur">
      <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-muted p-2"><X className="h-5 w-5" /></button>
      {phase > 0 && <p className="text-8xl font-extrabold text-primary">{phase}</p>}
      {phase === 0 && (
        <button onPointerDown={() => { nRef.current += 1; setN(nRef.current); navigator.vibrate?.(10); }}
          className="flex h-72 w-72 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl active:scale-95">
          <span className="text-7xl font-extrabold">{n}</span><span className="text-ui font-bold">{bn ? `ট্যাপ করুন! ${left}s` : `Tap! ${left}s`}</span>
        </button>
      )}
      {phase === -1 && <div className="text-center"><p className="text-6xl">🎆</p><p className="text-3xl font-extrabold">{n}</p><p className="text-ui">{bn ? "স্কোর পাঠানো হয়েছে" : "Score sent"}</p>
        <button onClick={onClose} className="mt-4 rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground">{bn ? "ঠিক আছে" : "OK"}</button></div>}
    </div>
  );
}

/** Owner-only always-visible pill to relax the entertainment filter from the chat. */
export function FeedFilterPill({ pairId, settings, bn }: { pairId: string; settings: Record<string, unknown>; bn: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rule = settings["t_feedrelax"] as { mode?: string; until?: string } | undefined;
  const relaxed = settings["g_feed_relax"] === true && (!rule || rule.mode === "unlimited" || (rule.mode === "until" && new Date(rule.until!).getTime() > Date.now()));
  async function set(mins: number | null | false) {
    const next = { ...settings, g_feed_relax: mins !== false, t_feedrelax: mins === false || mins === null ? { mode: "unlimited" } : { mode: "until", until: new Date(Date.now() + mins * 60000).toISOString() } };
    const { error } = await supabase.from("pair_controls").upsert({ pair_id: pairId, settings: next as Json });
    if (error) { toast.error(error.message); return; }
    toast.success(mins === false ? (bn ? "শালীনতা ফিল্টার আবার চালু" : "Filter back on") : bn ? "ফিল্টার শিথিল করা হলো" : "Filter relaxed");
    setOpen(false);
    qc.invalidateQueries();
  }
  const opts: [string, number | null | false][] = [[bn ? "৩০ মিনিট" : "30 min", 30], [bn ? "১ ঘণ্টা" : "1 hour", 60], [bn ? "আজ রাত পর্যন্ত (৬ ঘণ্টা)" : "6 hours", 360], [bn ? "যতক্ষণ না বন্ধ করি" : "Until I turn off", null]];
  return (
    <div className="absolute right-2 top-16 z-30">
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow ${relaxed ? "bg-destructive text-destructive-foreground" : "bg-background text-foreground"}`}>
        <Shield className="h-3.5 w-3.5" />{relaxed ? (bn ? "ফিল্টার শিথিল" : "Filter relaxed") : bn ? "বিনোদন ফিল্টার" : "Feed filter"}
      </button>
      {open && (
        <div className="mt-1 w-52 space-y-1 rounded-2xl bg-background p-2 shadow-xl">
          <p className="px-1 text-[11px] text-muted-foreground">{bn ? "এআই ফিল্টার সবসময় চলে; সাময়িক শিথিল করুন" : "AI filter stays on; relax temporarily"}</p>
          {opts.map(([l, v]) => <button key={l} onClick={() => set(v)} className="w-full rounded-lg px-2 py-1.5 text-left text-ui active:bg-muted">{l}</button>)}
          {relaxed && <button onClick={() => set(false)} className="w-full rounded-lg bg-primary px-2 py-1.5 text-ui font-bold text-primary-foreground">{bn ? "এখনই কঠোর করুন" : "Strict now"}</button>}
        </div>
      )}
    </div>
  );
}

/** Small floating player pinned above the chat; play/pause/seek is shared with the partner. */
export function WatchBar({ w, bn, onSync, onClose }: { w: Watch; bn: boolean; onSync: (w: Watch) => void; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const quiet = useRef(false);
  const yt = youtubeId(w.url);
  const social = yt ? null : socialEmbed(w.url);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const apply = () => {
      quiet.current = true;
      const t = watchPos(w);
      if (!v.duration || t < v.duration) v.currentTime = t;
      if (w.p !== undefined) v.pause(); else v.play().catch(() => {});
      setTimeout(() => { quiet.current = false; }, 600);
    };
    if (v.readyState >= 1) apply(); else v.addEventListener("loadedmetadata", apply, { once: true });
  }, [w]);
  const share = (paused: boolean, pos: number) => onSync({ url: w.url, at: Date.now() - pos * 1000, ...(paused ? { p: pos } : {}), sync: true });
  const ev = (paused: boolean) => () => { const v = ref.current; if (!v || quiet.current) return; share(paused, v.currentTime); };
  const pos = Math.floor(watchPos(w));
  return (
    <div className="absolute inset-x-2 top-16 z-40 overflow-hidden rounded-2xl bg-foreground shadow-xl">
      {yt ? (
        <>
          {w.p === undefined ? (
            <iframe key={`${w.at}`} title="player" allow="autoplay; encrypted-media" className="aspect-video max-h-48 w-full"
              src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&start=${pos}&rel=0&modestbranding=1&playsinline=1`} />
          ) : (
            <div className="flex aspect-video max-h-48 w-full items-center justify-center text-background">⏸ {bn ? "থামানো" : "Paused"}</div>
          )}
          <div className="flex justify-center gap-2 bg-foreground p-1.5">
            <button onClick={() => share(w.p === undefined, watchPos(w))} className="flex items-center gap-1 rounded-full bg-background px-3 py-1 text-xs font-bold">
              {w.p === undefined ? <><Pause className="h-3.5 w-3.5" />{bn ? "দুজনেরই থামান" : "Pause for both"}</> : <><Play className="h-3.5 w-3.5" />{bn ? "দুজনেরই চালান" : "Play for both"}</>}
            </button>
          </div>
        </>
      ) : social ? (
        <iframe title="player" allow="autoplay; encrypted-media; clipboard-write" allowFullScreen className="h-72 w-full bg-background" src={social} />
      ) : (
        <video ref={ref} src={w.url} controls playsInline className="max-h-48 w-full" onPlay={ev(false)} onPause={ev(true)} onSeeked={() => { const v = ref.current; if (v && !quiet.current) share(v.paused, v.currentTime); }} />
      )}
      <button aria-label="Close player" onClick={onClose} className="absolute right-2 top-2 rounded-full bg-background/80 p-1"><X className="h-4 w-4" /></button>
    </div>
  );
}
