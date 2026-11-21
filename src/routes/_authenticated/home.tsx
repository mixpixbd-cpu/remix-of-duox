import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bell, BellOff, Camera, Clapperboard, Copy, Eraser, Heart, ImagePlus, Info, MessageCircle, Phone, PhoneMissed, PhoneOutgoing, Pin, PinOff, Plus, Search, Smartphone, Trash2, UserPlus, Users, X } from "lucide-react";
import { useTypingWatch } from "@/lib/typing";
import { supabase } from "@/integrations/supabase/client";
import { fetchLastMessages, fetchMe, fetchPairs, fetchStories, isOnline, presenceOf, shortTime, type Story } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { FpAvatar } from "@/components/fp/Avatar";
import { IncomingCall } from "@/components/fp/IncomingCall";
import { usePresence } from "@/hooks/use-presence";
import { useElastic } from "@/hooks/use-elastic";
import { createPartner } from "@/lib/login.functions";
import { useBackClose } from "@/components/fp/PrivacyShield";
import { MePage, useThemeInit } from "@/components/fp/MePage";
import { OwnerAlerts } from "@/components/fp/OwnerAlerts";
import { policyOfPair } from "@/lib/policy";
import { StatusTick, msgStatus } from "@/components/fp/Ticks";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — DuoX" },
      { name: "description", content: "Your DuoX chats, partners, stories and profile." },
      { property: "og:title", content: "Home — DuoX" },
      { property: "og:description", content: "Your DuoX chats, partners, stories and profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

type Tab = "chats" | "contacts" | "me";
const TABS: Tab[] = ["me", "chats", "contacts"];
type Me = Awaited<ReturnType<typeof fetchMe>>;
type Pairs = Awaited<ReturnType<typeof fetchPairs>>;

function Home() {
  const { t, lang } = useT();
  const bn = lang === "bn";
  const [idx, setIdx] = useState(1);
  const [sheet, setSheet] = useState(false);
  const meSwipe = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // One-shot request from another page, else restore the tab the user was on (so back from a chat returns there).
    const tab = sessionStorage.getItem("fp-tab") ?? sessionStorage.getItem("fp-tab-cur");
    sessionStorage.removeItem("fp-tab");
    if (tab === "0" || tab === "2") setIdx(Number(tab));
  }, []);
  useEffect(() => { sessionStorage.setItem("fp-tab-cur", String(idx)); }, [idx]);
  const [q, setQ] = useState<string | null>(null);
  useBackClose(sheet, () => setSheet(false));
  useBackClose(idx !== 1, () => setIdx(1));
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({
    queryKey: ["pairs", me.data?.id],
    queryFn: () => fetchPairs(me.data!.id),
    enabled: !!me.data,
    refetchInterval: 30_000,
  });
  const unread = useQuery({
    queryKey: ["unread", me.data?.id],
    enabled: !!me.data,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { count } = await supabase.from("messages").select("id", { count: "exact", head: true })
        .neq("sender_id", me.data!.id).is("read_at", null).is("deleted_at", null);
      return count ?? 0;
    },
  });
  usePresence(me.data?.id);
  useThemeInit();
  const qc = useQueryClient();
  const refresh = useCallback(
    () => Promise.all([qc.invalidateQueries({ queryKey: ["pairs"] }), qc.invalidateQueries({ queryKey: ["last"] }), qc.invalidateQueries({ queryKey: ["stories"] })]),
    [qc],
  );

  const isOwner = me.data?.role === "owner";
  const list = (pairs.data ?? []).filter(
    (p) => !q || p.other.display_name.toLowerCase().includes(q.toLowerCase()),
  );
  const labels: Record<Tab, string> = {
    chats: t("chats"),
    contacts: bn ? "পরিচিতি" : "Contacts",
    me: bn ? "আমি" : "Me",
  };

  // horizontal swipe between tabs
  const sx = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const onStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    sx.current = p ? { x: p.clientX, y: p.clientY } : null;
  };
  const onMove = (e: React.TouchEvent) => {
    const p = e.touches[0];
    if (!sx.current || !p) return;
    const dx = p.clientX - sx.current.x;
    const dy = p.clientY - sx.current.y;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const edge = (idx === 0 && dx > 0) || (idx === TABS.length - 1 && dx < 0);
    setDrag(edge ? dx * 0.25 : dx);
  };
  const onEnd = () => {
    if (drag < -60 && idx < TABS.length - 1) setIdx(idx + 1);
    else if (drag > 60 && idx > 0) setIdx(idx - 1);
    setDrag(0);
    sx.current = null;
  };

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-background">
      <IncomingCall />
      {isOwner && me.data && <OwnerAlerts ownerId={me.data.id} pairs={pairs.data ?? []} onOpenChat={(id) => navigate({ to: "/chat/$pairId", params: { pairId: id } })} />}
      {idx === 0 && me.data && (
        <div
          className="absolute inset-0 z-30 animate-in slide-in-from-left duration-200"
          onTouchStart={(e) => { const t = e.touches[0]; meSwipe.current = t ? { x: t.clientX, y: t.clientY } : null; }}
          onTouchEnd={(e) => {
            const s = meSwipe.current; const t = e.changedTouches[0]; meSwipe.current = null;
            if (!s || !t) return;
            const dx = t.clientX - s.x, dy = t.clientY - s.y;
            if (dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.5) setIdx(1);
          }}
        >
          <MePage me={me.data} onClose={() => setIdx(1)} />
        </div>
      )}
      <header className={`z-10 shrink-0 border-b border-border bg-background ${idx === 0 ? "hidden" : ""}`}>
        {q === null ? (
          <div className="relative flex h-14 items-center">
            <button aria-label={labels.me} onClick={() => setIdx(0)} className="relative flex w-16 justify-center">
              <FpAvatar name={me.data?.profile?.display_name || (me.data?.email ?? "").split("@")[0] || "?"} photo={me.data?.profile?.avatar_url} size={36} />
              {unread.data ? (
                <span className="absolute -top-1 right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-ui font-bold text-destructive-foreground ring-2 ring-background">
                  {unread.data > 99 ? "99+" : unread.data}
                </span>
              ) : null}
            </button>
            <button aria-label={labels.chats} onClick={() => setIdx(1)} className="flex h-full flex-1 items-center justify-center">
              <MessageCircle className={`h-[22px] w-[22px] ${idx === 1 ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </button>
            <button aria-label={labels.contacts} onClick={() => setIdx(2)} className="flex h-full flex-1 items-center justify-center">
              <Users className={`h-[22px] w-[22px] ${idx === 2 ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </button>
            <span
              className={`absolute bottom-0 h-[2.5px] rounded-full bg-primary transition-all duration-300 ease-out ${idx === 0 ? "opacity-0" : "opacity-100"}`}
              style={{ left: `calc(64px + ${Math.max(idx, 1) - 1} * ((100% - 64px) / 2))`, width: "calc((100% - 64px) / 2)" }}
            />
          </div>
        ) : (
          <div className="flex h-14 items-center gap-2 px-3">
            <button aria-label="Back" onClick={() => setQ(null)} className="rounded-full p-2 text-primary">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={bn ? "খুঁজুন…" : "Search…"}
              className="min-w-0 flex-1 rounded-full bg-muted px-4 py-2 text-ui outline-none"
            />
          </div>
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <div
          className="flex h-full w-[300%]"
          style={{
            transform: `translate3d(calc(${-idx * (100 / 3)}% + ${drag}px),0,0)`,
            transition: drag ? "none" : "transform .32s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <Panel>{null}</Panel>
          <Panel onRefresh={refresh}>
            {me.isLoading && <p className="p-6 text-center text-ui text-muted-foreground">{t("loading")}</p>}
            {me.data && (
              <>
                {q === null && <StoryReel me={me.data} pairs={pairs.data ?? []} />}
                <ChatList pairs={list} me={me.data} />
              </>
            )}
          </Panel>
          <Panel>
            {me.data && (isOwner ? <Partners pairs={list} /> : <ChatList pairs={list} me={me.data} contacts />)}
          </Panel>
        </div>
      </div>
      <nav className={`z-10 h-14 shrink-0 items-center justify-between border-t border-border bg-background px-4 ${idx === 0 ? "hidden" : "flex"}`}>
        <button aria-label={isOwner ? "Add partner" : "Contacts"} onClick={() => setSheet(true)} className="rounded-full p-2 text-primary">
          <Plus className="h-[22px] w-[22px]" />
        </button>
        <button aria-label="পারিবারিক কর্নার" onClick={() => navigate({ to: "/feed" })} className="rounded-full p-2 text-primary">
          <Clapperboard className="h-[22px] w-[22px]" />
        </button>
        <button aria-label="আমাদের দুজন" onClick={() => navigate({ to: "/together" })} className="rounded-full p-2 text-primary">
          <Heart className="h-[22px] w-[22px]" />
        </button>
        <button aria-label="Search" onClick={() => navigate({ to: "/search" })} className="rounded-full p-2 text-primary">
          <Search className="h-[22px] w-[22px]" />
        </button>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-50" onClick={() => setSheet(false)}>
          <div className="absolute bottom-[60px] left-3 w-52 origin-bottom-left rounded-xl border border-border bg-background py-1 shadow-xl animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            {[
              { icon: MessageCircle, label: bn ? "নতুন চ্যাট" : "New Chat", go: () => setIdx(2) },
              ...(isOwner ? [{ icon: UserPlus, label: bn ? "পার্টনার যোগ করুন" : "Add Friends", go: () => setIdx(2) }] : []),
              { icon: Copy, label: bn ? "আমার পেয়ার কোড" : "My Pair Code", go: () => setIdx(0) },
            ].map((o) => (
              <button key={o.label} onClick={() => { setSheet(false); o.go(); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-ui hover:bg-muted">
                <o.icon className="h-5 w-5 text-muted-foreground" /> {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ children, onRefresh }: { children: React.ReactNode; onRefresh?: () => Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  useElastic(ref);
  const [pull, setPull] = useState(0);
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onRefresh) return;
    let y0: number | null = null;
    let d = 0;
    const s = (e: TouchEvent) => { y0 = el.scrollTop <= 0 ? e.touches[0]?.clientY ?? null : null; d = 0; };
    const m = (e: TouchEvent) => {
      if (y0 === null) return;
      d = Math.max(0, (e.touches[0]?.clientY ?? y0) - y0);
      setPull(Math.min(1, d / 90));
    };
    const end = async () => {
      if (y0 !== null && d > 90) {
        setSpin(true);
        setPull(1);
        try { await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 600))]); } finally { setSpin(false); }
      }
      setPull(0);
      y0 = null;
    };
    el.addEventListener("touchstart", s, { passive: true });
    el.addEventListener("touchmove", m, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", s);
      el.removeEventListener("touchmove", m);
      el.removeEventListener("touchend", end);
    };
  }, [onRefresh]);
  const show = spin || pull > 0;
  return (
    <div className="relative h-full w-1/3">
      {onRefresh && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-background shadow-md transition-opacity"
          style={{ opacity: show ? 1 : 0, transform: `translate(-50%, ${spin ? 8 : pull * 8}px)` }}
        >
          <span
            className={`h-5 w-5 rounded-full border-[2.5px] border-primary border-t-transparent ${spin ? "animate-spin" : ""}`}
            style={spin ? undefined : { transform: `rotate(${pull * 300}deg)` }}
          />
        </div>
      )}
      <div ref={ref} className="h-full overflow-y-auto">
        <div className="min-h-full pb-6">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Chats ---------------- */

function ChatList({ pairs, me, contacts }: { pairs: Pairs; me: Me; contacts?: boolean }) {
  const { t, lang } = useT();
  const isOwner = me.role === "owner";
  const last = useQuery({
    queryKey: ["last", pairs.map((p) => p.id).join(",")],
    queryFn: () => fetchLastMessages(pairs.map((p) => p.id)),
    enabled: pairs.length > 0 && !contacts,
    refetchInterval: 15_000,
  });
  const isTyping = useTypingWatch(contacts ? [] : pairs.map((p) => p.id), me.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pins, setPins] = useState<string[]>([]);
  const [mutes, setMutes] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  useBackClose(!!menu, () => setMenu(null));
  useEffect(() => {
    try {
      setPins(JSON.parse(localStorage.getItem("fp-pins") ?? "[]"));
      setMutes(JSON.parse(localStorage.getItem("fp-mutes") ?? "[]"));
    } catch { /* ignore */ }
  }, []);
  function toggle(key: string, list: string[], set: (v: string[]) => void, id: string) {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    set(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  function startPress(id: string) {
    if (contacts) return;
    pressed.current = false;
    timer.current = setTimeout(() => { pressed.current = true; navigator.vibrate?.(30); setInfo(false); setMenu(id); }, 500);
  }
  function cancelPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  async function clearChat(pairId: string, del: boolean) {
    const bn = lang === "bn";
    if (!confirm(del ? (bn ? "এই চ্যাটটি মুছে তালিকা থেকে সরাবেন?" : "Delete this chat and remove it from the list?") : (bn ? "এই চ্যাটের সব মেসেজ মুছে ফেলবেন?" : "Clear all messages in this chat?"))) return;
    setMenu(null);
    const { data: files } = await supabase.from("messages").select("file_path").eq("pair_id", pairId).not("file_path", "is", null);
    const { error } = await supabase.from("messages").delete().eq("pair_id", pairId);
    if (error) { toast.error(error.message); return; }
    const paths = (files ?? []).map((f) => f.file_path).filter(Boolean) as string[];
    if (paths.length) supabase.storage.from("fixedpair-files").remove(paths);
    if (del && pins.includes(pairId)) toggle("fp-pins", pins, setPins, pairId);
    toast.success(del ? (bn ? "চ্যাট মুছে ফেলা হয়েছে" : "Chat deleted") : (bn ? "চ্যাট ক্লিয়ার হয়েছে" : "Chat cleared"));
    qc.setQueriesData({ queryKey: ["last"] }, (old: Record<string, unknown> | undefined) => {
      if (!old) return old;
      const next = { ...old };
      delete next[pairId];
      return next;
    });
    qc.invalidateQueries({ queryKey: ["last"] });
    qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }
  async function love(pairId: string) {
    navigator.vibrate?.(40);
    const { error } = await supabase.from("messages").insert({ pair_id: pairId, sender_id: me.id, body: "❤️" });
    if (error) { toast.error(error.message); return; }
    toast(lang === "bn" ? "ভালোবাসা পাঠানো হয়েছে ❤️" : "Love sent ❤️");
    qc.invalidateQueries({ queryKey: ["last"] });
  }
  // Chats tab shows only partners with at least one message/file/call (IMO style).
  const visible = contacts ? pairs : pairs.filter((p) => !!last.data?.[p.id]);
  if (!contacts && last.isLoading && pairs.length) return <p className="p-6 text-center text-ui text-muted-foreground">{t("loading")}</p>;
  if (!visible.length) {
    const bn = lang === "bn";
    const Icon = contacts ? Users : MessageCircle;
    return (
      <div className="flex flex-col items-center px-8 py-16 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent">
          <Icon className="h-11 w-11 text-primary" />
        </div>
        <p className="mt-5 text-ui font-bold">
          {contacts ? (bn ? "কোনো কন্টাক্ট নেই" : "No contacts yet") : bn ? "এখনও কোনো চ্যাট নেই" : "No chats yet"}
        </p>
        <p className="mt-1.5 text-ui text-muted-foreground">
          {contacts
            ? bn ? "আপনার পেয়ার কোডটি ওনারকে দিন, যুক্ত হলে এখানে দেখাবে।" : "Share your pair code with your owner to get connected."
            : isOwner
              ? bn ? "পার্টনার যুক্ত করলে চ্যাট এখানে দেখাবে।" : "Add a partner and your conversations will appear here."
              : t("noOwner")}
        </p>
      </div>
    );
  }
  // Pinned chats on top, then newest activity first.
  const ts = (id: string, fallback: string) => new Date(last.data?.[id]?.created_at ?? fallback).getTime();
  const sorted = contacts ? visible : [...visible].sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)) || ts(b.id, b.created_at) - ts(a.id, a.created_at));
  const bn = lang === "bn";
  const menuPair = visible.find((p) => p.id === menu);
  return (
    <>
    <ul>
      {sorted.map((p) => {
        const online = isOnline(p.other.last_seen);
        const m = last.data?.[p.id];
        const typing = isTyping(p.id) && (isOwner || !policyOfPair(p.ctl).stealth);
        const preview = !m
          ? online ? t("online") : t("offline")
          : m.deleted_at
            ? bn ? "মেসেজ মুছে ফেলা হয়েছে" : "Message deleted"
            : m.kind === "call"
              ? bn ? "অডিও কল" : "Audio call"
              : m.body ?? `📎 ${m.file_name ?? "File"}`;
        const missed = m?.kind === "call" && m.sender_id !== me.id;
        const pinned = pins.includes(p.id);
        const muted = mutes.includes(p.id);
        return (
          <li
            key={p.id}
            className="flex select-none items-center pl-4 active:bg-muted"
            onContextMenu={(e) => { if (!contacts) e.preventDefault(); }}
            onTouchStart={() => startPress(p.id)}
            onTouchMove={cancelPress}
            onTouchEnd={cancelPress}
            onMouseDown={() => startPress(p.id)}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
          >
            <Link
              to="/chat/$pairId"
              params={{ pairId: p.id }}
              onClick={(e) => { if (pressed.current) { e.preventDefault(); pressed.current = false; } }}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <FpAvatar name={p.other.display_name} photo={p.other.avatar_url} status={presenceOf(p.other.last_seen)} size={52} />
              <div className="flex min-h-[80px] min-w-0 flex-1 items-center border-b border-border">
                <div className="min-w-0 flex-1 py-3">
                  <p className="flex items-center gap-1.5 truncate text-ui font-bold text-foreground">
                    <span className="truncate">{p.other.display_name}</span>
                    {!contacts && pinned && <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 fill-primary text-primary" aria-label="Pinned" />}
                    {!contacts && muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
                  </p>
                  {typing ? (
                    <p className="mt-0.5 truncate text-ui font-medium text-primary">{bn ? "টাইপ করছে…" : "Typing..."}</p>
                  ) : (
                    <p className={`mt-0.5 flex items-center gap-1 truncate text-ui ${missed ? "text-destructive" : "text-muted-foreground"}`}>
                      {m?.kind === "call" && (missed ? <PhoneMissed className="h-4 w-4 shrink-0" /> : <PhoneOutgoing className="h-4 w-4 shrink-0" />)}
                      {m && m.kind !== "call" && !m.deleted_at && m.sender_id === me.id && <StatusTick status={msgStatus(m, !isOwner && policyOfPair(p.ctl).stealth)} size={17} className="text-muted-foreground/80" />}
                      <span className="truncate">{missed ? (bn ? "মিসড অডিও কল" : "Missed Audio Call") : preview}</span>
                    </p>
                  )}
                </div>
                {m && <span className="shrink-0 self-start pt-4 pl-2 text-ui text-muted-foreground">{shortTime(m.created_at, lang)}</span>}
              </div>
            </Link>
            {!contacts && (
              <button onClick={() => love(p.id)} aria-label="Send love" className="flex h-[80px] items-center border-b border-border pl-2 text-destructive active:scale-90">
                <Heart className="h-[22px] w-[22px]" />
              </button>
            )}
            <Link to="/call/$pairId" params={{ pairId: p.id }} search={{ type: "voice" }} aria-label="Voice call" className="flex h-[80px] items-center border-b border-border px-4 text-primary">
              <Phone className="h-6 w-6 fill-primary" />
            </Link>
          </li>
        );
      })}
    </ul>
    {menuPair && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-8" onClick={() => setMenu(null)}>
        <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-background py-1 shadow-2xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
          {info ? (
            <div className="flex flex-col items-center gap-2 px-6 pt-6 pb-4 text-center">
              <FpAvatar name={menuPair.other.display_name} photo={menuPair.other.avatar_url} status={presenceOf(menuPair.other.last_seen)} size={72} />
              <p className="text-ui font-bold">{menuPair.other.display_name}</p>
              <p className="text-ui text-muted-foreground">
                {isOnline(menuPair.other.last_seen) ? t("online") : `${bn ? "শেষ দেখা" : "Last seen"}: ${menuPair.other.last_seen ? new Date(menuPair.other.last_seen).toLocaleString(bn ? "bn-BD" : "en-GB") : "—"}`}
              </p>
              <button onClick={() => { setMenu(null); navigate({ to: "/chat/$pairId", params: { pairId: menuPair.id } }); }} className="mt-3 w-full rounded-full bg-primary py-2.5 font-semibold text-primary-foreground">
                {bn ? "চ্যাট খুলুন" : "Open chat"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <FpAvatar name={menuPair.other.display_name} photo={menuPair.other.avatar_url} status={presenceOf(menuPair.other.last_seen)} size={36} />
                <p className="truncate font-bold">{menuPair.other.display_name}</p>
              </div>
              <MenuRow icon={pins.includes(menuPair.id) ? PinOff : Pin} label={pins.includes(menuPair.id) ? (bn ? "পিন সরান" : "Unpin chat") : (bn ? "উপরে পিন করুন" : "Pin to top")} onClick={() => { toggle("fp-pins", pins, setPins, menuPair.id); setMenu(null); }} />
              <MenuRow icon={mutes.includes(menuPair.id) ? Bell : BellOff} label={mutes.includes(menuPair.id) ? (bn ? "নোটিফিকেশন চালু করুন" : "Unmute notifications") : (bn ? "নোটিফিকেশন বন্ধ করুন" : "Mute notifications")} onClick={() => { toggle("fp-mutes", mutes, setMutes, menuPair.id); setMenu(null); }} />
              <MenuRow icon={Info} label={bn ? "প্রোফাইল দেখুন" : "View profile"} onClick={() => setInfo(true)} />
              {isOwner && <MenuRow icon={Eraser} label={bn ? "চ্যাট ক্লিয়ার করুন" : "Clear chat"} onClick={() => clearChat(menuPair.id, false)} />}
              {isOwner && <MenuRow icon={Trash2} danger label={bn ? "চ্যাট মুছে ফেলুন" : "Delete chat"} onClick={() => clearChat(menuPair.id, true)} />}
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger }: { icon: typeof Pin; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-4 px-5 py-3.5 text-left text-ui active:bg-muted ${danger ? "text-destructive" : "text-foreground"}`}>
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

/* ---------------- Stories ---------------- */

const STORY_COLORS = ["#2f7fe0", "#e0457b", "#16a34a", "#f59e0b", "#7c3aed", "#0f172a"];

function StoryReel({ me, pairs }: { me: Me; pairs: Pairs }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const stories = useQuery({ queryKey: ["stories"], queryFn: fetchStories, refetchInterval: 60_000 });
  const [compose, setCompose] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const names: Record<string, string> = { [me.id]: bn ? "আমার স্টোরি" : "My story" };
  for (const p of pairs) names[p.other.id] = p.other.display_name;
  const byAuthor = new Map<string, Story[]>();
  for (const s of stories.data ?? []) if (names[s.author_id]) byAuthor.set(s.author_id, [...(byAuthor.get(s.author_id) ?? []), s]);
  const authors = [...byAuthor.keys()].sort((a) => (a === me.id ? -1 : 1));

  return (
    <>
      <div className="no-scrollbar flex gap-4 overflow-x-auto border-b border-border px-4 py-4">
        <button onClick={() => setCompose(true)} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-muted text-foreground">
            <Camera className="h-6 w-6" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"><Plus className="h-3 w-3" /></span>
          </span>
          <span className="w-full truncate text-center text-ui">{bn ? "স্টোরি" : "Story"}</span>
        </button>
        {authors.map((a) => (
          <button key={a} onClick={() => setViewing(a)} className="flex w-16 shrink-0 flex-col items-center gap-1">
            <span className="rounded-full bg-primary p-[2.5px]">
              <span className="block rounded-full bg-background p-[2px]">
                <FpAvatar name={names[a] ?? "?"} size={48} />
              </span>
            </span>
            <span className="w-full truncate text-center text-ui font-semibold">{names[a] ?? "—"}</span>
          </button>
        ))}
      </div>
      {compose && <StoryComposer me={me} onClose={() => setCompose(false)} />}
      {viewing && (
        <StoryViewer
          me={me}
          name={names[viewing] ?? ""}
          stories={byAuthor.get(viewing) ?? []}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

function StoryComposer({ me, onClose }: { me: Me; onClose: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const [caption, setCaption] = useState("");
  const [color, setColor] = useState<string>(STORY_COLORS[0]!);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file) : null;

  async function post() {
    if (!caption.trim() && !file) { toast.error(bn ? "কিছু লিখুন বা ছবি দিন" : "Write something or add a photo"); return; }
    setBusy(true);
    let media_path: string | null = null;
    if (file) {
      media_path = `${me.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("fixedpair-stories").upload(media_path, file);
      if (error) { setBusy(false); { toast.error(error.message); return; } }
    }
    const { error } = await supabase.from("stories").insert({ author_id: me.id, caption: caption.trim() || null, bg_color: color, media_path });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(bn ? "স্টোরি পোস্ট হয়েছে" : "Story posted");
    qc.invalidateQueries({ queryKey: ["stories"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col text-primary-foreground" style={{ background: color }}>
      <div className="flex items-center justify-between p-3">
        <button aria-label="Close" onClick={onClose} className="rounded-full p-2"><X className="h-6 w-6" /></button>
        <button onClick={post} disabled={busy} className="rounded-full bg-primary-foreground px-5 py-2 text-ui font-bold text-primary disabled:opacity-60">
          {busy ? "…" : bn ? "পোস্ট" : "Post"}
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        {preview && <img src={preview} alt="" className="max-h-[50vh] rounded-2xl object-contain" />}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={200}
          placeholder={bn ? "কিছু লিখুন…" : "Type something…"}
          className="w-full resize-none bg-transparent text-center text-2xl font-extrabold outline-none placeholder:text-primary-foreground/60"
          rows={3}
        />
      </div>
      <div className="flex items-center gap-2 p-4">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button aria-label="Add photo" onClick={() => fileRef.current?.click()} className="rounded-full bg-primary-foreground/20 p-3"><ImagePlus className="h-5 w-5" /></button>
        <div className="flex flex-1 justify-end gap-2">
          {STORY_COLORS.map((c) => (
            <button key={c} aria-label={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-primary-foreground" : "border-transparent"}`} style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryViewer({ me, name, stories, onClose }: { me: Me; name: string; stories: Story[]; onClose: () => void }) {
  useBackClose(true, onClose);
  const qc = useQueryClient();
  const { lang } = useT();
  const [i, setI] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const s = stories[i];

  useEffect(() => {
    if (!s) { onClose(); return; }
    setUrl(null);
    if (s.media_path)
      supabase.storage.from("fixedpair-stories").createSignedUrl(s.media_path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null));
    if (s.author_id !== me.id) supabase.from("story_views").insert({ story_id: s.id, viewer_id: me.id }).then(() => {});
    const tm = setTimeout(() => (i < stories.length - 1 ? setI(i + 1) : onClose()), 5000);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, s?.id]);

  if (!s) return null;
  async function del() {
    const { error } = await supabase.from("stories").delete().eq("id", s!.id);
    if (error) { toast.error(error.message); return; }
    if (s!.media_path) supabase.storage.from("fixedpair-stories").remove([s!.media_path]);
    qc.invalidateQueries({ queryKey: ["stories"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col text-primary-foreground" style={{ background: s.bg_color }}>
      <div className="flex gap-1 p-2">
        {stories.map((x, k) => (
          <span key={x.id} className="h-1 flex-1 overflow-hidden rounded-full bg-primary-foreground/30">
            <span className={`block h-full bg-primary-foreground ${k < i ? "w-full" : k === i ? "fp-story-bar" : "w-0"}`} />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3">
        <FpAvatar name={name} size={34} />
        <div className="flex-1">
          <p className="text-ui font-bold">{name}</p>
          <p className="text-ui opacity-80">{shortTime(s.created_at, lang)}</p>
        </div>
        {s.author_id === me.id && (
          <button aria-label="Delete story" onClick={del} className="rounded-full p-2"><Trash2 className="h-5 w-5" /></button>
        )}
        <button aria-label="Close" onClick={onClose} className="rounded-full p-2"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-6">
        {url && <img src={url} alt="" className="max-h-[60vh] rounded-2xl object-contain" />}
        {s.caption && <p className="text-center text-2xl font-extrabold">{s.caption}</p>}
        <button aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" onClick={() => i > 0 && setI(i - 1)} />
        <button aria-label="Next" className="absolute inset-y-0 right-0 w-1/3" onClick={() => (i < stories.length - 1 ? setI(i + 1) : onClose())} />
      </div>
    </div>
  );
}

/* ---------------- Contacts / Partners ---------------- */

function CodeCard({ code }: { code: string }) {
  const { t } = useT();
  return (
    <div className="mx-auto mt-5 max-w-xs rounded-2xl bg-accent p-4">
      <p className="text-ui text-accent-foreground">{t("yourCode")}</p>
      <div className="mt-1 flex items-center justify-center gap-2">
        <span className="text-2xl font-black tracking-[0.3em] text-accent-foreground">{code}</span>
        <button
          aria-label="Copy"
          onClick={() => {
            navigator.clipboard?.writeText(code);
            toast.success("✓");
          }}
          className="rounded-full p-1.5 text-accent-foreground hover:bg-background"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Partners({ pairs }: { pairs: Pairs }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ partnerId: string; token: string } | null>(null);
  const [view, setView] = useState<"all" | "devices" | "add">("all");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createPartner({ data: { partnerId: code } });
      setMade(r);
      toast.success(t("added"));
      setCode("");
      qc.invalidateQueries({ queryKey: ["pairs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    const { error } = await supabase.from("pairs").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("removed"));
    qc.invalidateQueries({ queryKey: ["pairs"] });
  }

  const bn = lang === "bn";
  const tabs = [
    { k: "all" as const, icon: Users, label: bn ? "সব পার্টনার" : "All Partners" },
    { k: "devices" as const, icon: Smartphone, label: bn ? "যুক্ত ডিভাইস" : "Paired Devices" },
    { k: "add" as const, icon: UserPlus, label: bn ? "পার্টনার যোগ" : "Add Partner" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
        {tabs.map((o) => (
          <button key={o.k} onClick={() => setView(o.k)}
            className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-ui font-bold ${view === o.k ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
            <o.icon className="h-5 w-5" /> {o.label}
          </button>
        ))}
      </div>
      {view === "add" && (
      <form onSubmit={add} className="flex gap-2 border-b border-border bg-muted p-4">
        <input
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="New Partner ID"
          maxLength={32}
          autoCapitalize="none"
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-ui font-bold outline-none focus:border-primary"
        />
        <button disabled={busy} className="flex items-center gap-1 rounded-xl bg-primary px-4 text-ui font-bold text-primary-foreground disabled:opacity-60">
          <Plus className="h-4 w-4" /> {t("add")}
        </button>
      </form>
      )}
      {made && (
        <div className="m-4 space-y-2 rounded-2xl border border-primary/30 bg-accent p-4 text-ui">
          <p className="font-bold">Partner ID: {made.partnerId}</p>
          <p className="break-all font-mono text-ui">Token: {made.token}</p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`ID: ${made.partnerId}\nToken: ${made.token}`);
              toast.success("Copied");
            }}
            className="w-full rounded-full bg-primary py-2 font-bold text-primary-foreground"
          >
            Copy ID + Token
          </button>
        </div>
      )}
      {!pairs.length && view !== "add" && <p className="p-8 text-center text-ui text-muted-foreground">{bn ? "এখনো কোনো পার্টনার নেই। \"পার্টনার যোগ\" চেপে যোগ করুন।" : "No partners yet. Tap \"Add Partner\" to add one."}</p>}
      {view !== "add" && (
      <ul>
        {pairs.map((p) => {
          const online = isOnline(p.other.last_seen);
          return (
            <li key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Link to={view === "devices" ? "/control/$pairId" : "/chat/$pairId"} params={{ pairId: p.id }} className="flex min-w-0 flex-1 items-center gap-3">
                <FpAvatar name={p.other.display_name} photo={p.other.avatar_url} status={presenceOf(p.other.last_seen)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.other.display_name}</p>
                  <p className="text-ui text-muted-foreground">
                    {view === "devices"
                      ? (online ? (bn ? "ডিভাইস অনলাইন · কন্ট্রোল খুলুন" : "Device online · open controls") : (bn ? "ডিভাইস অফলাইন · কন্ট্রোল খুলুন" : "Device offline · open controls"))
                      : <>{online ? t("online") : t("offline")} · {t("since")}{" "}{new Date(p.created_at).toLocaleDateString(bn ? "bn-BD" : "en-GB")}</>}
                  </p>
                </div>
              </Link>
              {view === "all" && (
              <button
                onClick={() => remove(p.id)}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-ui font-bold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> {t("remove")}
              </button>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
