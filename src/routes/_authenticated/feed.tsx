import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Send, ShieldCheck, ShieldOff, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs } from "@/lib/fp";
import { FEED_CATS, kindOf, wishText, type FeedCat, type FeedItem } from "@/lib/feed";
import { moderateFeedItem } from "@/lib/feed.functions";
import { useT } from "@/lib/i18n";

let LANG = "en";
const L = (en: string, bn: string) => (LANG === "bn" ? bn : en);

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Explore — DuoX" },
      { name: "description", content: "Recipes, mehendi, outfits, Islamic and family-fun videos and photos in one safe feed." },
      { property: "og:title", content: "Explore — DuoX" },
      { property: "og:description", content: "Recipes, mehendi, outfits, Islamic and family-fun videos and photos in one safe feed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Feed,
});

const RELAX_PRESETS: { label: string; mins: number | null }[] = [
  { label: L("30 min", "৩০ মিনিট"), mins: 30 }, { label: L("1 hour", "১ ঘণ্টা"), mins: 60 }, { label: L("3 hours", "৩ ঘণ্টা"), mins: 180 }, { label: L("Unlimited", "আনলিমিটেড"), mins: null },
];

function useSigned(path: string | null) {
  return useQuery({
    queryKey: ["signed", path], enabled: !!path, staleTime: 50 * 60 * 1000,
    queryFn: async () => (await supabase.storage.from("fixedpair-files").createSignedUrl(path!, 3600)).data?.signedUrl ?? null,
  });
}

async function posterOf(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = URL.createObjectURL(file);
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")?.drawImage(v, 0, 0);
      c.toBlob((b) => { URL.revokeObjectURL(v.src); resolve(b); }, "image/jpeg", 0.8);
    };
    v.onerror = () => resolve(null);
  });
}

function Feed() {
  LANG = useT().lang;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const moderate = useServerFn(moderateFeedItem);
  const [cat, setCat] = useState<FeedCat | "all">("all");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({ queryKey: ["pairs", me.data?.id], queryFn: () => fetchPairs(me.data!.id), enabled: !!me.data });
  const pair = pairs.data?.[0];
  const isOwner = me.data?.role === "owner";
  const items = useQuery({
    queryKey: ["feed", pair?.id, cat], enabled: !!pair,
    queryFn: async () => {
      const { data, error } = await supabase.from("feed_items").select("*").eq("pair_id", pair!.id).in("category", cat === "all" ? FEED_CATS.map((c) => c.key) : [cat]).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
  });
  const settings = (pair?.ctl?.settings ?? {}) as Record<string, unknown>;
  const rule = settings["t_feedrelax"] as { mode?: string; until?: string } | undefined;
  const relaxed = settings["g_feed_relax"] === true && (!rule || rule.mode === "unlimited" || (rule.mode === "until" && new Date(rule.until!).getTime() > Date.now()));

  async function setRelax(mins: number | null | false) {
    if (!pair) return;
    const next = { ...settings, g_feed_relax: mins !== false, t_feedrelax: mins === false || mins === null ? { mode: "unlimited" } : { mode: "until", until: new Date(Date.now() + mins * 60000).toISOString() } };
    const { error } = await supabase.from("pair_controls").upsert({ pair_id: pair.id, settings: next as never });
    if (error) { toast.error(error.message); return; }
    toast.success(mins === false ? L("Decency filter back on", "শালীনতা ফিল্টার আবার চালু") : L("Filter relaxed", "ফিল্টার শিথিল করা হলো"));
    qc.invalidateQueries({ queryKey: ["pairs"] });
  }

  async function upload(file: File) {
    if (!pair || !me.data) return;
    const kind = kindOf(file.type);
    if (!kind) { toast.error(L("Only photos, videos or audio allowed", "শুধু ছবি, ভিডিও বা অডিও দেওয়া যাবে")); return; }
    setBusy(true);
    try {
      const base = `${pair.id}/feed/${crypto.randomUUID()}`;
      const path = `${base}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("fixedpair-files").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      let poster: string | null = null;
      if (kind === "video") {
        const b = await posterOf(file);
        if (b) { poster = `${base}-poster.jpg`; await supabase.storage.from("fixedpair-files").upload(poster, b, { contentType: "image/jpeg" }); }
      }
      const title = window.prompt(L("Title (optional)", "শিরোনাম (ঐচ্ছিক)")) ?? "";
      const { data, error } = await supabase.from("feed_items").insert({ pair_id: pair.id, added_by: me.data.id, category: cat === "all" ? "fun" : cat, kind, title: title || null, file_path: path, file_type: file.type, poster_path: poster }).select("id").single();
      if (error) throw error;
      toast(L("Checking content safety…", "এআই শালীনতা যাচাই চলছে…"));
      const verdict = await moderate({ data: { id: data.id } });
      toast[verdict === "safe" ? "success" : "error"](verdict === "safe" ? L("Safe — added", "নিরাপদ — যোগ হয়েছে") : verdict === "blocked" ? L("Flagged — partner won't see it", "আপত্তিকর মনে হয়েছে — পার্টনার দেখবে না") : L("Will re-check later", "যাচাই পরে আবার হবে"));
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function sendToChat(it: FeedItem, wish: boolean) {
    if (!pair || !me.data) return;
    const file_path = `${pair.id}/${crypto.randomUUID()}-${it.file_path.split("/").pop()}`;
    const cp = await supabase.storage.from("fixedpair-files").copy(it.file_path, file_path);
    if (cp.error) { toast.error(cp.error.message); return; }
    const { error } = await supabase.from("messages").insert({
      pair_id: pair.id, sender_id: me.data.id, file_path, file_type: it.file_type, file_name: it.file_path.split("/").pop() ?? null,
      body: wish ? wishText(it.title, it.category, LANG) : it.title,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(wish ? L("Wish sent to chat ❤️", "আবদার চ্যাটে পাঠানো হলো ❤️") : L("Sent to chat", "চ্যাটে পাঠানো হলো"));
  }

  async function remove(it: FeedItem) {
    await supabase.from("feed_items").delete().eq("id", it.id);
    supabase.storage.from("fixedpair-files").remove([it.file_path, ...(it.poster_path ? [it.poster_path] : [])]);
    qc.invalidateQueries({ queryKey: ["feed"] });
  }

  const reels = true;
  const [muted, setMuted] = useState(true);
  const [book, setBook] = useState<number | null>(null);
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2">
        <button aria-label="Back" onClick={() => navigate({ to: "/home" })} className="rounded-full p-2 text-primary"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="flex-1 text-ui font-semibold">Explore</h1>
        {pair && <button aria-label=L("Add", "যোগ করুন") disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-full p-2 text-primary disabled:opacity-40"><Upload className="h-5 w-5" /></button>}
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </header>
      <nav className="flex shrink-0 gap-2 overflow-x-auto px-3 py-2">
        <button onClick={() => setCat("all")} className={`shrink-0 rounded-full px-3 py-1.5 text-ui ${cat === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>All</button>
        {FEED_CATS.map((c) => (
          <button key={c.key} onClick={() => setCat(c.key)} className={`shrink-0 rounded-full px-3 py-1.5 text-ui ${cat === c.key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>{c.emoji} {c.en}</button>
        ))}
      </nav>
      {isOwner && pair && (
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3 py-2 text-ui">
          {relaxed ? <ShieldOff className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
          <span className="flex-1">{relaxed ? L("Filter relaxed", "ফিল্টার শিথিল") : L("Decency filter on", "শালীনতা ফিল্টার চালু")}</span>
          {relaxed ? <button onClick={() => setRelax(false)} className="rounded-full bg-primary px-3 py-1 text-primary-foreground">{L("Turn back on", "আবার চালু")}</button>
            : RELAX_PRESETS.map((p) => <button key={p.label} onClick={() => setRelax(p.mins)} className="rounded-full bg-background px-2.5 py-1">{p.label}</button>)}
        </div>
      )}
      {!pair && <p className="p-6 text-center text-ui text-muted-foreground">{pairs.isLoading ? L("Loading…", "লোড হচ্ছে…") : L("Add a partner first", "আগে একজন পার্টনার যুক্ত করুন")}</p>}
      {pair && items.data?.length === 0 && <p className="p-6 text-center text-ui text-muted-foreground">{L("Nothing yet — tap ⬆ above to add", "এখনো কিছু নেই — উপরের ⬆ বাটনে যোগ করুন")}</p>}
      <div className={reels ? "min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto" : "grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto p-3"}>
        {items.data?.map((it) => (
          <Card key={it.id} it={it} reel={reels} muted={muted} onMute={() => setMuted((m) => !m)} onOpen={() => setBook(items.data!.indexOf(it))} owner={!!isOwner} onWish={() => sendToChat(it, true)} onShare={() => sendToChat(it, false)} onDelete={() => remove(it)} />
        ))}
      </div>
      {book !== null && items.data?.[book] && <Book items={items.data} start={book} onClose={() => setBook(null)} onWish={(it) => sendToChat(it, true)} onShare={(it) => sendToChat(it, false)} />}
    </div>
  );
}

/** Magazine-style full-screen catalog: swipe left/right page by page, pinch to zoom. */
function Book({ items, start, onClose, onWish, onShare }: { items: FeedItem[]; start: number; onClose: () => void; onWish: (it: FeedItem) => void; onShare: (it: FeedItem) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(start);
  useEffect(() => { ref.current?.scrollTo({ left: start * (ref.current?.clientWidth ?? 0) }); }, [start]);
  const go = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth, behavior: "smooth" });
  const cur = items[i];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground">
      <div className="flex items-center justify-between p-3 text-background">
        <span className="text-ui">{i + 1} / {items.length}</span>
        <button aria-label=L("Close", "বন্ধ") onClick={onClose} className="rounded-full bg-background/20 p-2"><X className="h-5 w-5" /></button>
      </div>
      <div ref={ref} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto">
        {items.map((it) => <Page key={it.id} it={it} />)}
      </div>
      <div className="flex items-center gap-2 bg-background px-3 py-3">
        <button aria-label=L("Previous", "আগের") onClick={() => go(-1)} className="rounded-full bg-muted p-2"><ChevronLeft className="h-5 w-5" /></button>
        <p className="min-w-0 flex-1 truncate text-center text-ui">{cur?.title}</p>
        {cur && <button onClick={() => onWish(cur)} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-ui text-primary-foreground"><Heart className="h-4 w-4 fill-current" />{L("Wish", "আমার পছন্দ")}</button>}
        {cur && <button aria-label=L("Send to chat", "চ্যাটে পাঠান") onClick={() => onShare(cur)} className="rounded-full bg-muted p-2 text-primary"><Send className="h-4 w-4" /></button>}
        <button aria-label=L("Next", "পরের") onClick={() => go(1)} className="rounded-full bg-muted p-2"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
function Page({ it }: { it: FeedItem }) {
  const url = useSigned(it.file_path).data;
  return (
    <div className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-auto" style={{ touchAction: "pan-x pinch-zoom" }}>
      {url && (it.kind === "image" ? <img src={url} alt={it.title ?? ""} className="max-h-full max-w-full object-contain" />
        : it.kind === "video" ? <video src={url} controls playsInline className="max-h-full max-w-full" />
        : <audio src={url} controls className="w-4/5" />)}
    </div>
  );
}

function Card({ it, reel, muted, onMute, onOpen, owner, onWish, onShare, onDelete }: { it: FeedItem; reel: boolean; muted: boolean; onMute: () => void; onOpen: () => void; owner: boolean; onWish: () => void; onShare: () => void; onDelete: () => void }) {
  const url = useSigned(it.file_path).data;
  const vref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = vref.current; if (!v || !reel) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) v.play().catch(() => null); else v.pause(); }, { threshold: 0.7 });
    io.observe(v); return () => io.disconnect();
  }, [reel, url]);
  const media = !url ? <div className="aspect-square w-full animate-pulse bg-muted" />
    : it.kind === "image" ? <img src={url} alt={it.title ?? ""} onClick={reel ? undefined : onOpen} className={reel ? "h-full w-full object-contain" : "aspect-[3/4] w-full cursor-zoom-in rounded-xl object-cover"} />
    : it.kind === "video" ? <video ref={vref} src={url} playsInline loop muted={reel && muted} controls={!reel} onClick={(e) => { const v = e.currentTarget; v.paused ? v.play() : v.pause(); }} className={reel ? "h-full w-full object-contain" : "aspect-[3/4] w-full rounded-xl object-cover"} />
    : <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted p-3"><span className="text-4xl">🎧</span><audio src={url} controls className="w-full" /></div>;
  const badge = it.status !== "safe" && owner ? <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-ui">{it.status === "blocked" ? L("🚫 Blocked", "🚫 আটকানো") : L("⏳ Reviewing", "⏳ যাচাই")}</span> : null;
  const actions = (
    <div className="flex items-center gap-1">
      <button aria-label=L("Wish", "আবদার") onClick={onWish} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-ui text-primary-foreground"><Heart className="h-4 w-4 fill-current" />{L("Wish", "আবদার")}</button>
      <button aria-label=L("Send to chat", "চ্যাটে পাঠান") onClick={onShare} className="rounded-full bg-muted p-2 text-primary"><Send className="h-4 w-4" /></button>
      {owner && <button aria-label=L("Delete", "মুছুন") onClick={onDelete} className="rounded-full bg-muted p-2 text-destructive"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
  if (reel) return (
    <section className="relative h-full snap-start snap-always bg-foreground">
      {media}{badge}
      {it.kind === "video" && <button aria-label={muted ? L("Sound on", "সাউন্ড চালু") : L("Sound off", "সাউন্ড বন্ধ")} onClick={onMute} className="absolute right-3 top-3 rounded-full bg-background/80 p-2">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-foreground/80 to-transparent px-3 pb-4 pt-10"><p className="min-w-0 flex-1 truncate text-ui text-background">{it.title}</p>{actions}</div>
    </section>
  );
  return (
    <div className="relative flex flex-col gap-1.5">
      {media}{badge}
      {it.title && <p className="truncate text-ui">{it.title}</p>}
      {actions}
    </div>
  );
}
