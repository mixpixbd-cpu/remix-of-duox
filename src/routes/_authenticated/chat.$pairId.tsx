import { applyTiming } from "@/lib/timing";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Check, CheckCheck, Copy, Download, Heart, LogOut, Mic, MoreVertical, PlusCircle, ChevronLeft, Phone, PhoneIncoming, PhoneMissed, Pin,
  Search, Send, BellOff, MapPin, KeyRound, Share2, Shield, Siren, Smile, Timer, Trash2, Video, X, Reply, Image as ImageIcon, FileText, Film, Pencil, ChevronDown, ChevronUp, Info, Star, Zap, Lock, Camera, Music, Square,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getLinkPreview, type LinkPreview } from "@/lib/link-preview.functions";

import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { FpAvatar } from "@/components/fp/Avatar";
import { StatusTick, msgStatus } from "@/components/fp/Ticks";
import { IncomingCall } from "@/components/fp/IncomingCall";
import { usePresence } from "@/hooks/use-presence";
import { useElastic } from "@/hooks/use-elastic";
import { useTypingSender, useTypingWatch } from "@/lib/typing";
import { DateDivider, MediaViewer, REACTIONS, TypingDots, VoicePlayer, canEdit, lastSeenText, sameDay, toggleReaction, useStarred, firstUrl, isExpired, type Reactions } from "@/components/fp/ChatExtras";
import { fileBlockReason, inQuietHours, partnerMayCall, policyOfPair } from "@/lib/policy";
import { sendSos } from "@/lib/policy-actions";
import { OwnerChatTools, PartnerStatus } from "@/components/fp/OwnerChatTools";
import { setRootBack, useBackClose } from "@/components/fp/PrivacyShield";
import { ChatLockGate, getChatPin, setChatPin } from "@/components/fp/ChatLock";
import { ControlPills } from "@/components/fp/ControlPills";
import { PinDialog } from "@/components/fp/PinDialog";
import { FeedFilterPill, FunBubble, FunMenu, LoveBurst, TapGame, WatchBar } from "@/components/fp/ChatFun";
import { isFunKind, parse, type FunKind, type Game, type Tap, type Watch } from "@/lib/chat-fun";
import { canRunDeviceAction, deviceActionUnavailable } from "@/lib/device-actions";
import { ContactInfo, EmojiPanel, WallpaperLayer, fmtSecs, useHiddenMessages, useHoldRecorder, useWallpaper } from "@/components/fp/ChatPro";

export const Route = createFileRoute("/_authenticated/chat/$pairId")({
  head: () => ({
    meta: [
      { title: "Chat — DuoX" },
      { name: "description", content: "Private one-to-one chat and file sharing on DuoX." },
      { property: "og:title", content: "Chat — DuoX" },
      { property: "og:description", content: "Private one-to-one chat and file sharing on DuoX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LockedChat,
});

function LockedChat() {
  const { pairId } = Route.useParams();
  const { lang } = useT();
  return <ChatLockGate key={pairId} pairId={pairId} bn={lang === "bn"}><ChatPage /></ChatLockGate>;
}

type Message = {
  id: string;
  pair_id: string;
  sender_id: string;
  body: string | null;
  kind: string;
  call_type: string | null;
  call_status: string | null;
  call_seconds: number | null;
  deleted_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  pinned: boolean;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  created_at: string;
  reply_to: string | null;
  reactions: Reactions | null;
  edited_at: string | null;
  expires_at?: string | null;
};


function ChatPage() {
  const { pairId } = Route.useParams();
  const { t, lang } = useT();
  const bn = lang === "bn";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const bottom = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState<Message | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ ids: string[]; single?: Message } | null>(null);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [attach, setAttach] = useState(false);
  const [emo, setEmo] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tools, setTools] = useState(false);
  useEffect(() => setRootBack(() => navigate({ to: "/home", replace: true })), [navigate]);
  const [caption, setCaption] = useState<{ files: File[]; text: string; urls: string[] } | null>(null);
  const [clearSheet, setClearSheet] = useState(false);
  const [shake, setShake] = useState(false);
  const [fun, setFun] = useState(false);
  const [love, setLove] = useState(false);
  const [watch, setWatch] = useState<Watch | null>(null);
  const [tap, setTap] = useState<{ start: Tap | null } | null>(null);
  useBackClose(fun, () => setFun(false));
  async function remote(kind: string) {
    if (!me.data || !isOwner || pair?.owner_id !== me.data.id) return;
    if (!canRunDeviceAction(kind)) { toast.error(deviceActionUnavailable(bn)); return; }
    setMore(false);
    const { error } = await supabase.from("control_events").insert({ pair_id: pairId, created_by: me.data.id, kind, payload: {} });
    if (error) toast.error(error.message);
    else toast.success(bn ? "কমান্ড পাঠানো হয়েছে — ফোনের ফলাফলের অপেক্ষায়" : "Command sent — waiting for device");
  }
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  async function saveEdit() {
    const m = editing;
    const body = editText.trim();
    if (!m || !body) return;
    setEditing(null);
    if (!isOwner || !canEdit(m)) { toast.error(bn ? "১৫ মিনিট পার হয়ে গেছে" : "The 15-minute edit window has passed"); return; }
    if (body === m.body) return;
    const { error } = await supabase.from("messages").update({ body, edited_at: new Date().toISOString() }).eq("id", m.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(i); }, []);
  const [fwd, setFwd] = useState<Message[] | null>(null);
  const [info, setInfo] = useState(false);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [wall, setWall] = useWallpaper();
  const inputRef = useRef<HTMLInputElement>(null);
  function insertEmoji(em: string) {
    const el = inputRef.current;
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    setText(text.slice(0, a) + em + text.slice(b));
    requestAnimationFrame(() => { el?.setSelectionRange(a + em.length, a + em.length); });
  }
  useElastic(scroll);
  useBackClose(!!menu, () => setMenu(null));
  useBackClose(!!confirmDel, () => setConfirmDel(null));
  useBackClose(more, () => setMore(false));
  useBackClose(q !== null, () => setQ(null));
  const [hitIdx, setHitIdx] = useState(0);
  useBackClose(!!viewer, () => setViewer(null));
  useBackClose(attach, () => setAttach(false));
  useBackClose(!!fwd, () => setFwd(null));
  useBackClose(info, () => setInfo(false));
  useBackClose(!!editing, () => setEditing(null));
  useBackClose(!!sel, () => setSel(null));
  useBackClose(!!caption, () => setCaption(null));
  useBackClose(clearSheet, () => setClearSheet(false));
  useBackClose(emo, () => setEmo(false));
  const [muteSheet, setMuteSheet] = useState(false);
  useBackClose(muteSheet, () => setMuteSheet(false));
  const muteKey = `fp-mute-${pairId}`;
  const [muteUntil, setMuteUntil] = useState(0);
  useEffect(() => { setMuteUntil(Number(localStorage.getItem(muteKey) ?? 0)); }, [muteKey]);
  const muted = muteUntil > Date.now();
  function setMute(ms: number) {
    const until = ms === 0 ? 0 : ms < 0 ? 8.64e15 : Date.now() + ms;
    if (until) localStorage.setItem(muteKey, String(until)); else localStorage.removeItem(muteKey);
    setMuteUntil(until); setMuteSheet(false);
    toast.success(until ? (bn ? "চ্যাট মিউট করা হয়েছে" : "Chat muted") : bn ? "মিউট বন্ধ" : "Unmuted");
  }

  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  usePresence(me.data?.id);
  const { hidden, hide } = useHiddenMessages(me.data?.id);
  const { starred, toggleStar } = useStarred(me.data?.id);
  const isOwner = me.data?.role === "owner";
  const pingTyping = useTypingSender(pairId, me.data?.id);
  const isTyping = useTypingWatch([pairId], me.data?.id);
  const pairs = useQuery({
    queryKey: ["pairs", me.data?.id],
    queryFn: () => fetchPairs(me.data!.id),
    enabled: !!me.data,
  });
  const pair = pairs.data?.find((p) => p.id === pairId);
  const controls = useQuery({
    queryKey: ["controls", pairId],
    queryFn: async () => (await supabase.from("pair_controls").select("*").eq("pair_id", pairId).maybeSingle()).data,
    refetchInterval: 30_000,
  });
  const [, setTimingTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTimingTick((n) => n + 1), 15_000); return () => clearInterval(i); }, []);
  const ctlE = applyTiming(controls.data);
  const pol = policyOfPair(ctlE);
  const quiet = !isOwner && inQuietHours(pol.quiet);
  const paused = !isOwner && (!!ctlE?.chat_paused || quiet);
  const blockSave = !isOwner && pol.noSave;
  const noCopy = !isOwner && pol.noCopy;
  const hideRead = !isOwner && pol.stealth;
  const callBlocked = (type: "voice" | "video") => {
    if (isOwner || partnerMayCall(pol, type)) return false;
    toast.error(
      inQuietHours(pol.quiet) ? (bn ? "এখন কোয়াইট আওয়ার্স — কল বন্ধ" : "Quiet hours — calls are off")
        : !pol.callOut ? (bn ? "এডমিন শুধু নিজে কল দিতে দেন" : "Only the admin can start calls")
        : bn ? "এই ধরনের কল বন্ধ করা আছে" : "This call type is turned off",
    );
    return true;
  };

  const messages = useQuery({
    queryKey: ["messages", pairId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("pair_id", pairId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${pairId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `pair_id=eq.${pairId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", pairId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pairId, qc]);

  // Remember where unread messages started (before they get marked read).
  const [firstUnread, setFirstUnread] = useState<{ id: string; n: number } | null | undefined>(undefined);
  const [msgInfo, setMsgInfo] = useState<Message | null>(null);
  const urls = useRef(new Map<string, string>());
  useBackClose(!!msgInfo, () => setMsgInfo(null));
  useEffect(() => {
    const myId = me.data?.id;
    if (firstUnread !== undefined || !myId || !messages.data) return;
    const un = messages.data.filter((m) => m.sender_id !== myId && !m.read_at && m.kind !== "call");
    setFirstUnread(un.length ? { id: un[0]!.id, n: un.length } : null);
  }, [messages.data, me.data?.id, firstUnread]);

  // Mark the other person's messages as delivered + read while this chat is open.
  useEffect(() => {
    const myId = me.data?.id;
    if (!myId || !messages.data) return;
    const unread = messages.data.some((m) => m.sender_id !== myId && !m.read_at);
    if (!unread) return;
    const now = new Date().toISOString();
    supabase
      .from("messages")
      .update({ read_at: now, delivered_at: now })
      .eq("pair_id", pairId)
      .neq("sender_id", myId)
      .is("read_at", null)
      .then(() => {});
  }, [messages.data, me.data?.id, pairId]);

  const lastLen = useRef(0);
  useEffect(() => {
    const list = messages.data ?? [];
    const added = list.slice(lastLen.current);
    const first = lastLen.current === 0;
    lastLen.current = list.length;
    if (q !== null || !added.length) return;
    const mineAdded = added.some((m) => m.sender_id === me.data?.id);
    if (!first && added.some((m) => m.kind === "buzz" && m.sender_id !== me.data?.id)) buzzFx();
    if (!first && added.some((m) => m.kind === "love" && m.sender_id !== me.data?.id)) loveFx();
    const ws = [...added].reverse().find((m) => m.kind === "watch" && m.sender_id !== me.data?.id);
    const wv = ws ? parse<Watch>(ws.body) : null;
    if (!first && wv?.sync) setWatch((cur) => (cur && cur.url === wv.url ? wv : cur));
    if (first || atBottom || mineAdded) bottom.current?.scrollIntoView({ behavior: first ? "auto" : "smooth" });
    else setUnseen((n) => n + added.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.data?.length, q]);
  function buzzFx() {
    navigator.vibrate?.([300, 120, 300, 120, 500]);
    try {
      const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "square"; o.frequency.value = 180; g.gain.value = 0.15; o.connect(g).connect(ctx.destination); o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 700);
    } catch { /* no audio */ }
    setShake(true); setTimeout(() => setShake(false), 900);
    toast(bn ? `⚡ ${pair?.other.display_name ?? ""} আপনাকে বাজ দিয়েছে!` : `⚡ ${pair?.other.display_name ?? ""} buzzed you!`);
  }
  function loveFx() {
    navigator.vibrate?.([120, 80, 120, 400, 120, 80, 120]);
    setLove(true); setTimeout(() => setLove(false), 2800);
  }
  async function sendFun(kind: FunKind, body: string) {
    if (!me.data || paused) return;
    const { error } = await supabase.from("messages").insert({ pair_id: pairId, sender_id: me.data.id, kind, body, expires_at: expiry() });
    if (error) toast.error(error.message);
    else { if (kind === "love") loveFx(); qc.invalidateQueries({ queryKey: ["messages", pairId] }); }
  }
  async function sendBuzz() {
    setMore(false);
    if (!me.data || paused) return;
    const { error } = await supabase.from("messages").insert({ pair_id: pairId, sender_id: me.data.id, kind: "buzz", body: "⚡", expires_at: expiry() });
    if (error) toast.error(error.message);
    else { navigator.vibrate?.(150); qc.invalidateQueries({ queryKey: ["messages", pairId] }); }
  }
  function onScroll() {
    const el = scroll.current;
    if (!el) return;
    const b = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setAtBottom(b);
    if (b) setUnseen(0);
  }
  function toBottom() {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
    setUnseen(0);
  }
  async function react(m: Message, emoji: string) {
    if (!me.data) return;
    const reactions = toggleReaction(m.reactions, emoji, me.data.id);
    qc.setQueryData<Message[]>(["messages", pairId], (old) => old?.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
    const { error } = await supabase.from("messages").update({ reactions }).eq("id", m.id);
    if (error) toast.error(error.message);
  }
  function startEdit(m: Message) {
    setEditing(m);
    setEditText(m.body ?? "");
    setMenu(null);
  }

  function expiry() {
    const s = ctlE?.disappearing_seconds ?? 0;
    return s > 0 ? new Date(Date.now() + s * 1000).toISOString() : null;
  }

  const [usage, setUsage] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setUsage(JSON.parse(localStorage.getItem(`fp-usage-${me.data?.id}`) ?? "{}")); } catch { /* ignore */ }
  }, [me.data?.id]);
  function track(body: string) {
    if (!me.data || body.length > 40) return;
    const next = { ...usage, [body]: (usage[body] ?? 0) + 1 };
    setUsage(next);
    localStorage.setItem(`fp-usage-${me.data.id}`, JSON.stringify(next));
  }
  const quick = rankQuick(usage, bn);

  async function sendBody(body: string) {
    if (!body || !me.data || paused) return;
    track(body);
    const { error } = await supabase.from("messages").insert({ pair_id: pairId, sender_id: me.data.id, body, expires_at: expiry(), reply_to: replyTo?.id ?? null });
    setReplyTo(null);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setEmo(false);
    setTools(false);
    setFocused(false);
    inputRef.current?.blur();
    if (editing) {
      const m = editing;
      setEditing(null);
      if (!isOwner || !canEdit(m)) { toast.error(bn ? "১৫ মিনিট পার হয়ে গেছে" : "The 15-minute edit window has passed"); return; }
      if (body === m.body) return;
      const { error } = await supabase.from("messages").update({ body, edited_at: new Date().toISOString() }).eq("id", m.id);
      if (error) toast.error(error.message);
      else qc.invalidateQueries({ queryKey: ["messages", pairId] });
      return;
    }
    await sendBody(body);
  }

  const hold = useHoldRecorder((f) => upload(f), () => toast.error(bn ? "মাইক্রোফোন অনুমতি দিন" : "Allow microphone access"));
  const recording = hold.active;

  async function upload(file: File, body?: string) {
    if (!me.data || paused) return;
    if (!isOwner) {
      const why = fileBlockReason(pol, file);
      if (why) {
        toast.error(
          why === "size" ? (bn ? `ফাইল ${pol.maxMb} MB এর বেশি পাঠানো যাবে না` : `Files over ${pol.maxMb} MB are not allowed`)
            : why === "video" ? (bn ? "ভিডিও পাঠানো বন্ধ আছে" : "Video uploads are turned off")
            : bn ? "ডকুমেন্ট পাঠানো বন্ধ আছে" : "Document uploads are turned off",
        );
        return;
      }
    }
    setUploading(true);
    if (localStorage.getItem("fp-lowdata") === "1") file = await shrinkImage(file);
    const path = `${pairId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("fixedpair-files").upload(path, file, { cacheControl: "604800" });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { error } = await supabase.from("messages").insert({
      pair_id: pairId,
      sender_id: me.data.id,
      file_path: path,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      body: body?.trim() || null,
      expires_at: expiry(),
      reply_to: replyTo?.id ?? null,
    });
    setReplyTo(null);
    setUploading(false);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }

  function onFiles(list: File[]) {
    if (!list.length) return;
    if (list.some((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))) {
      setCaption({ files: list, text: "", urls: list.map((f) => URL.createObjectURL(f)) });
    } else list.forEach((f) => upload(f));
  }
  async function sendCaption() {
    const c = caption;
    if (!c) return;
    setCaption(null);
    c.urls.forEach((u) => URL.revokeObjectURL(u));
    for (let i = 0; i < c.files.length; i++) await upload(c.files[i]!, i === 0 ? c.text : undefined);
  }
  function pick(accept: string, opts: { multiple?: boolean; camera?: boolean } = {}) {
    setAttach(false);
    if (!fileInput.current) return;
    fileInput.current.accept = accept;
    fileInput.current.multiple = !!opts.multiple;
    if (opts.camera) fileInput.current.setAttribute("capture", "environment"); else fileInput.current.removeAttribute("capture");
    fileInput.current.click();
  }

  const otherPairs = (pairs.data ?? []).filter((p) => p.id !== pairId);
  async function forwardTo(targetPair: string) {
    const list = fwd;
    if (!list || !me.data) return;
    setFwd(null); setSel(null);
    for (const m of list) {
    let file_path: string | null = null;
    if (m.file_path) {
      file_path = `${targetPair}/${crypto.randomUUID()}-${(m.file_name ?? "file").replace(/[^\w.\-]/g, "_")}`;
      const { error: cErr } = await supabase.storage.from("fixedpair-files").copy(m.file_path, file_path);
      if (cErr) { toast.error(cErr.message); return; }
    }
    const { error } = await supabase.from("messages").insert({
      pair_id: targetPair, sender_id: me.data.id, body: m.body, file_path, file_name: m.file_name, file_type: m.file_type,
    });
    if (error) { toast.error(error.message); return; }
    }
    toast.success(bn ? "ফরওয়ার্ড হয়েছে" : "Forwarded");
  }
  async function startForward(m: Message) {
    setMenu(null);
    if (otherPairs.length) { setFwd([m]); return; }
    const text = m.body ?? m.file_name ?? "";
    if (navigator.share && text) { try { await navigator.share({ text }); } catch { /* cancelled */ } }
    else toast(bn ? "ফরওয়ার্ড করার মতো অন্য চ্যাট নেই" : "No other chat to forward to");
  }

  async function del(m: Message) {
    setMenu(null);
    const { error } = await supabase.rpc("delete_message", { _id: m.id });
    if (error) { toast.error(error.message); return; }
    if (m.file_path) supabase.storage.from("fixedpair-files").remove([m.file_path]);
    toast.success(bn ? "মুছে ফেলা হয়েছে" : "Deleted");
    qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }

  function delForMe(ids: string[]) {
    setMenu(null); setSel(null);
    hide(ids);
    toast.success(bn ? "আপনার জন্য মুছে ফেলা হয়েছে" : "Deleted for you");
  }
  async function delMany(ids: string[]) {
    setSel(null);
    const list = (messages.data ?? []).filter((m) => ids.includes(m.id));
    for (const m of list) {
      const { error } = await supabase.rpc("delete_message", { _id: m.id });
      if (error) { toast.error(error.message); break; }
      if (m.file_path) supabase.storage.from("fixedpair-files").remove([m.file_path]);
    }
    qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }
  function toggleSel(id: string) {
    setSel((old) => { const n = new Set(old ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n.size ? n : null; });
  }

  async function copy(m: Message) {
    setMenu(null);
    try { await navigator.clipboard.writeText(m.body ?? m.file_name ?? ""); toast.success(bn ? "কপি হয়েছে" : "Copied"); } catch { /* ignore */ }
  }

  async function togglePin(m: Message) {
    setMenu(null);
    const { error } = await supabase.from("messages").update({ pinned: !m.pinned }).eq("id", m.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }

  function clearChat() { setMore(false); setClearSheet(true); }
  const [hasPin, setHasPin] = useState(false);
  useEffect(() => { setHasPin(!!getChatPin(pairId)); }, [pairId]);
  const [pinDlg, setPinDlg] = useState<null | "set" | "check">(null);
  function pinLock() { setMore(false); setPinDlg(hasPin ? "check" : "set"); }
  function pinDone(pin: string) {
    if (pinDlg === "check") { setChatPin(pairId, null); setHasPin(false); toast.success(bn ? "চ্যাট পিন বন্ধ" : "Chat PIN removed"); }
    else { setChatPin(pairId, pin); sessionStorage.setItem(`fp-unlocked-${pairId}`, "1"); setHasPin(true); toast.success(bn ? "চ্যাট পিন চালু হয়েছে" : "Chat PIN set"); }
    setPinDlg(null);
  }
  function shareLocation() {
    setAttach(false);
    if (!navigator.geolocation) { toast.error(bn ? "এই ফোনে লোকেশন নেই" : "Location not available"); return; }
    const tid = toast.loading(bn ? "লোকেশন নেওয়া হচ্ছে…" : "Getting location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { toast.dismiss(tid); sendBody(`📍 https://maps.google.com/?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`); },
      () => { toast.dismiss(tid); toast.error(bn ? "লোকেশনের অনুমতি দিন" : "Please allow location access"); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  function exportChat() {
    setMore(false);
    const other = pair?.other.display_name ?? "Partner";
    const lines = (messages.data ?? []).filter((m) => !m.deleted_at && !hidden.has(m.id)).map((m) => {
      const who = m.sender_id === me.data?.id ? (bn ? "আমি" : "Me") : other;
      const what = m.kind === "call" ? `[${m.call_type ?? "call"} ${m.call_status ?? ""}]` : m.body ?? (m.file_name ? `[${m.file_name}]` : "");
      return `[${new Date(m.created_at).toLocaleString()}] ${who}: ${what}`;
    });
    const blob = new Blob([`DuoX — ${other}\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `DuoX-chat-${other}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function doClear(keepMedia: boolean) {
    setClearSheet(false);
    if (!isOwner) { hide((messages.data ?? []).map((m) => m.id)); toast.success(bn ? "আপনার জন্য চ্যাট খালি করা হয়েছে" : "Chat cleared for you"); return; }
    const files = keepMedia ? [] : (messages.data ?? []).map((m) => m.file_path).filter(Boolean) as string[];
    let qy = supabase.from("messages").delete().eq("pair_id", pairId);
    if (keepMedia) qy = qy.is("file_path", null);
    const { error } = await qy;
    if (error) { toast.error(error.message); return; }
    if (files.length) supabase.storage.from("fixedpair-files").remove(files);
    toast.success(bn ? "চ্যাট মুছে ফেলা হয়েছে" : "Chat cleared");
    qc.invalidateQueries({ queryKey: ["messages", pairId] });
  }

  const needle = q?.trim().toLowerCase() ?? "";
  const shown = (messages.data ?? []).filter((m) => !hidden.has(m.id) && !isExpired(m));
  const latestGame = new Map<string, string>();
  for (const m of messages.data ?? []) if (m.kind === "game" || m.kind === "ludo") { const g = parse<Game>(m.body); if (g) latestGame.set(g.id, m.id); }
  const hits = needle ? shown.filter((m) => !m.deleted_at && ((m.body ?? "").toLowerCase().includes(needle) || (m.file_name ?? "").toLowerCase().includes(needle))).map((m) => m.id) : [];
  const hitPos = hits.length ? Math.min(hitIdx, hits.length - 1) : -1;
  const curHit = hitPos >= 0 ? hits[hitPos] : null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { setHitIdx(Math.max(0, hits.length - 1)); }, [needle, hits.length]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { if (curHit) document.getElementById(`msg-${curHit}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [curHit]);
  const pinned = (messages.data ?? []).filter((m) => m.pinned && !m.deleted_at).at(-1);
  const timer = ctlE?.disappearing_seconds ?? 0;

  return (
    <div className={`mx-auto flex h-[100dvh] max-w-md flex-col bg-chat-bg ${shake ? "animate-buzz" : ""}`}>
      <IncomingCall />
      {sel ? (
        <header className="flex shrink-0 items-center gap-1 bg-primary px-2 py-2.5 text-primary-foreground shadow-md">
          <button aria-label="Cancel selection" onClick={() => setSel(null)} className="rounded-full p-1.5"><X className="h-5 w-5" /></button>
          <p className="ml-1 flex-1 font-bold">{sel.size} {bn ? "টি সিলেক্টেড" : "selected"}</p>
          {!noCopy && <button aria-label="Copy selected" onClick={async () => {
            const txt = shown.filter((m) => sel.has(m.id) && m.body).map((m) => m.body).join("\n");
            try { await navigator.clipboard.writeText(txt); toast.success(bn ? "কপি হয়েছে" : "Copied"); } catch { /* ignore */ }
            setSel(null);
          }} className="rounded-full p-2"><Copy className="h-5 w-5" /></button>}
          {!noCopy && otherPairs.length > 0 && <button aria-label="Forward selected" onClick={() => setFwd(shown.filter((m) => sel.has(m.id) && !m.deleted_at))} className="rounded-full p-2"><Share2 className="h-5 w-5" /></button>}
          <button aria-label="Delete selected" onClick={() => sel && setConfirmDel({ ids: [...sel] })} className="rounded-full p-2"><Trash2 className="h-5 w-5" /></button>
        </header>
      ) : q === null ? (
        <header className="flex shrink-0 items-center gap-1 bg-primary px-2 py-2.5 text-primary-foreground shadow-md">
          <button aria-label="Back" onClick={() => (history.state?.fpRoot ? history.back() : navigate({ to: "/home", replace: true }))} className="rounded-full p-1.5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button aria-label="Contact info" onClick={() => setInfo(true)} className="flex min-w-0 flex-1 items-center text-left">
          <FpAvatar name={pair?.other.display_name ?? "?"} photo={pair?.other.avatar_url} size={38} />
          <div className="ml-1 min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{pair?.other.display_name ?? "…"}</p>
            <p className="flex items-center gap-1 text-[11px] text-primary-foreground/80">
              {isTyping(pairId) ? <TypingDots bn={bn} /> : lastSeenText(pair?.other.last_seen, bn)}
              {timer > 0 && <Timer className="h-3 w-3" />}
              {muted && <BellOff className="h-3 w-3" aria-label="Muted" />}
            </p>
          </div>
          </button>
          {!isOwner && !partnerMayCall(pol, "voice") ? (
            <button aria-label="Voice call" onClick={() => callBlocked("voice")} className="rounded-full p-2 opacity-50"><Phone className="h-5 w-5" /></button>
          ) : (
            <Link to="/call/$pairId" params={{ pairId }} search={{ type: "voice" }} aria-label="Voice call" className="rounded-full p-2">
              <Phone className="h-5 w-5" />
            </Link>
          )}
          {!isOwner && !partnerMayCall(pol, "video") ? (
            <button aria-label="Video call" onClick={() => callBlocked("video")} className="rounded-full p-2 opacity-50"><Video className="h-5 w-5" /></button>
          ) : (
            <Link to="/call/$pairId" params={{ pairId }} search={{ type: "video" }} aria-label="Video call" className="rounded-full p-2">
              <Video className="h-5 w-5" />
            </Link>
          )}
          <button aria-label="Buzz" onClick={sendBuzz} disabled={paused} className="rounded-full p-2 disabled:opacity-50"><Zap className="h-5 w-5" /></button>
          <button aria-label="More" onClick={() => setMore(true)} className="rounded-full p-2">
            <MoreVertical className="h-5 w-5" />
          </button>
        </header>
      ) : (
        <header className="flex shrink-0 items-center gap-2 bg-primary px-2 py-2.5 text-primary-foreground shadow-md">
          <button aria-label="Close search" onClick={() => setQ(null)} className="rounded-full p-1.5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={bn ? "এই চ্যাটে খুঁজুন…" : "Search this chat…"}
            className="min-w-0 flex-1 rounded-full bg-primary-foreground/20 px-4 py-2 text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/70"
          />
          {needle && <span className="shrink-0 text-xs font-semibold tabular-nums">{hits.length ? `${hitPos + 1} / ${hits.length}` : "0 / 0"}</span>}
          <button type="button" aria-label="Previous result" disabled={hits.length < 2} onClick={() => setHitIdx((hitPos - 1 + hits.length) % hits.length)} className="rounded-full p-1.5 disabled:opacity-40"><ChevronUp className="h-5 w-5" /></button>
          <button type="button" aria-label="Next result" disabled={hits.length < 2} onClick={() => setHitIdx((hitPos + 1) % hits.length)} className="rounded-full p-1.5 disabled:opacity-40"><ChevronDown className="h-5 w-5" /></button>
        </header>
      )}


      {pinned && q === null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2 text-sm">
          <Pin className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate">{pinned.body ?? pinned.file_name}</p>
          <button aria-label="Unpin" onClick={() => togglePin(pinned)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
      <WallpaperLayer kind={wall} />
      <LoveBurst show={love} />
      {watch && <WatchBar w={watch} bn={bn} onSync={(w) => { setWatch(w); sendFun("watch", JSON.stringify(w)); }} onClose={() => setWatch(null)} />}
      {isOwner && pair && !watch && q === null && !sel && <FeedFilterPill pairId={pairId} settings={(controls.data?.settings ?? {}) as Record<string, unknown>} bn={bn} />}
      {tap && me.data && <TapGame bn={bn} onClose={() => setTap(null)} onDone={(n) => { const s = tap.start; sendFun("tap", JSON.stringify(s ? { id: s.id, by: me.data!.id, n, reply: true } : { id: crypto.randomUUID(), by: me.data!.id, n })); }} />}
      {isOwner && q === null && !sel && <ControlPills pairId={pairId} ctl={controls.data} muted={muted} onMute={(ms) => setMute(ms)} bn={bn} />}
      <div ref={scroll} onScroll={onScroll} onPointerDown={() => emo && setEmo(false)} className="scroll-fade relative h-full overflow-y-auto">
        <div className="min-h-full space-y-2 p-3">
          {!shown.length && (
            <p className="pt-10 text-center text-sm text-muted-foreground">
              {needle ? (bn ? "কিছু পাওয়া যায়নি" : "No results found") : t("noMessages")}
            </p>
          )}
          {shown.map((m, i) => (
            <div key={m.id} id={`msg-${m.id}`} className={`space-y-2 rounded-lg transition-colors ${sel?.has(m.id) ? "-mx-3 bg-primary/15 px-3" : curHit === m.id ? "bg-primary/20 ring-2 ring-primary/40" : ""}`}
              onClickCapture={sel && m.kind !== "call" ? (e) => { e.stopPropagation(); e.preventDefault(); toggleSel(m.id); } : undefined}>
            {(i === 0 || !sameDay(shown[i - 1]!.created_at, m.created_at)) && <DateDivider iso={m.created_at} bn={bn} />}
            {firstUnread && firstUnread.id === m.id && q === null && (
              <div className="flex items-center gap-2 py-1" aria-label="New messages">
                <span className="h-px flex-1 bg-primary/40" />
                <span className="rounded-full bg-primary/15 px-3 py-0.5 text-xs font-semibold text-primary">
                  {bn ? `${firstUnread.n}টি নতুন বার্তা` : `${firstUnread.n} new message${firstUnread.n > 1 ? "s" : ""}`}
                </span>
                <span className="h-px flex-1 bg-primary/40" />
              </div>
            )}
            {isFunKind(m.kind) && me.data ? (
              <FunBubble m={m} mine={m.sender_id === me.data.id} bn={bn} me={me.data.id}
                time={new Date(m.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                isLatestGame={(m.kind !== "game" && m.kind !== "ludo") || latestGame.get(parse<Game>(m.body)?.id ?? "") === m.id}
                onSend={sendFun} onWatch={(w) => setWatch(w)} msgs={messages.data ?? []} onTap={(start) => setTap({ start })} />
            ) : <Bubble
              message={m}
              mine={m.sender_id === me.data?.id}
              lang={lang}
              onMenu={m.kind !== "call" && !sel ? () => setMenu(m) : undefined}
              onImage={setViewer}
              onUrl={(u) => urls.current.set(m.id, u)}
              blockSave={blockSave}
              hideRead={hideRead}
              onLove={() => sendBody("❤️")}
              quoted={m.reply_to ? messages.data?.find((x) => x.id === m.reply_to) : undefined}
              myId={me.data?.id}
              starred={starred.has(m.id)}
              onReact={(em) => react(m, em)}
              onReply={!m.deleted_at && m.kind !== "call" && !paused ? () => { setEditing(null); setReplyTo(m); } : undefined}
            />}
            </div>
          ))}
          {isTyping(pairId) && (
            <div className="flex justify-start">
              <span className="rounded-2xl rounded-bl-sm bg-bubble-them px-3 py-2 text-xs text-muted-foreground shadow-sm"><TypingDots bn={bn} /></span>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>
      </div>
      {!atBottom && q === null && (
        <div className="pointer-events-none relative h-0">
          <button aria-label="Scroll to bottom" onClick={toBottom}
            className="pointer-events-auto absolute -top-14 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-background text-primary shadow-lg">
            <ChevronDown className="h-5 w-5" />
            {unseen > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-5 text-primary-foreground">{unseen > 99 ? "99+" : unseen}</span>
            )}
          </button>
        </div>
      )}

      {paused ? (
        <p className="bg-background p-4 text-center text-sm font-semibold text-muted-foreground">
          {quiet && !ctlE?.chat_paused
            ? bn ? `কোয়াইট আওয়ার্স (${pol.quiet.from}–${pol.quiet.to}) — এখন মেসেজ বন্ধ` : `Quiet hours (${pol.quiet.from}–${pol.quiet.to}) — chat is off for now`
            : bn ? "ওনার এই চ্যাট সাময়িক বন্ধ রেখেছেন" : "The owner has paused this chat"}
        </p>
      ) : (
        <div className="shrink-0 bg-background">
          {!focused && !text && <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pt-2">
            {quick.emojis.map((em) => (
              <button key={em} type="button" aria-label={`Send ${em}`} onClick={() => sendBody(em)} className="shrink-0 text-2xl transition-transform active:scale-125">{em}</button>
            ))}
            {quick.phrases.map((ph) => (
              <button key={ph} type="button" onClick={() => sendBody(ph)} className="shrink-0 whitespace-nowrap rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground active:bg-accent">{ph}</button>
            ))}
          </div>}
          {replyTo && (
            <div className="mx-2 mt-2 flex items-center gap-2 rounded-xl border-l-4 border-primary bg-muted px-3 py-1.5 text-sm">
              <Reply className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-primary">{replyTo.sender_id === me.data?.id ? (bn ? "আপনি" : "You") : pair?.other.display_name}</p>
                <p className="truncate">{replyTo.body ?? `📎 ${replyTo.file_name ?? ""}`}</p>
              </div>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></button>
            </div>
          )}
          <form onSubmit={send} className="flex items-center gap-2 p-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={(e) => {
                onFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            {hold.draft ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-2 py-1 text-sm">
                <button type="button" aria-label="Discard voice" onClick={hold.discardDraft} className="rounded-full p-1.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                <DraftAudio file={hold.draft} />
              </div>
            ) : recording && hold.locked ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm">
                <button type="button" aria-label="Cancel recording" onClick={hold.abort} className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><Trash2 className="h-4 w-4" /></button>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                <span className="font-mono font-semibold">{fmtSecs(hold.secs)}</span>
                <button type="button" aria-label="Stop and preview" onClick={hold.stopToPreview} className="ml-auto rounded-full p-1 text-primary"><Square className="h-4 w-4 fill-current" /></button>
              </div>
            ) : recording ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                <span className="font-mono font-semibold">{fmtSecs(hold.secs)}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground" style={{ opacity: 1 + hold.drag / 100 }}>‹ {bn ? "সরান" : "Slide"} · ↑ <Lock className="inline h-3 w-3" /></span>
                <button type="button" aria-label="Cancel recording" onPointerDown={(e) => { e.stopPropagation(); hold.abort(); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><Trash2 className="h-4 w-4" /></button>
              </div>
            ) : (
            <div className="flex min-w-0 flex-1 items-center rounded-full bg-muted pl-1">
              <button type="button" aria-label="Emoji" onClick={() => setEmo((v) => !v)} className={`rounded-full p-2 ${emo ? "text-primary" : "text-muted-foreground"}`}>
                <Smile className="h-5 w-5" />
              </button>
              <input
                ref={inputRef}
                value={text}
                onFocus={() => { setEmo(false); setFocused(true); }}
                onBlur={() => setFocused(false)}
                onChange={(e) => { setText(e.target.value); if (!e.target.value) setTools(false); pingTyping(); }}
                placeholder={t("typeMessage")}
                className="min-w-0 flex-1 bg-transparent py-2.5 pr-1 text-[15px] outline-none"
              />
              {text && !tools ? (
                <button type="button" aria-label="Show attach buttons" onMouseDown={(e) => e.preventDefault()} onClick={() => setTools(true)} className="rounded-full p-2 text-muted-foreground">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : (
                <>
                  <button type="button" aria-label="Gallery" disabled={uploading} onClick={() => pick("image/*,video/*", { multiple: true })} className="rounded-full p-2 text-muted-foreground disabled:opacity-50">
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  <button type="button" aria-label="Attach file" disabled={uploading} onClick={() => setAttach(true)} className="rounded-full p-2 pr-3 text-muted-foreground disabled:opacity-50">
                    <PlusCircle className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} />
                  </button>
                </>
              )}
            </div>
            )}
            {hold.draft || (recording && hold.locked) ? (
              <button type="button" aria-label="Send voice" onClick={() => (hold.draft ? hold.sendDraft() : hold.stopToPreview())} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Send className="h-4 w-4" />
              </button>
            ) : text.trim() ? (
              <button aria-label="Send" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" aria-label="Tap or hold to record voice"
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); hold.start(e.clientX, e.clientY); }}
                onPointerMove={(e) => hold.move(e.clientX, e.clientY)}
                onPointerUp={() => hold.release()}
                onPointerCancel={() => hold.abort()}
                onContextMenu={(e) => e.preventDefault()}
                style={{ transform: recording ? `translateX(${hold.drag}px) scale(1.25)` : undefined, touchAction: "none" }}
                className={`flex h-10 w-10 select-none items-center justify-center rounded-full text-primary-foreground transition-transform ${recording ? "bg-destructive" : "bg-primary"}`}>
                <Mic className="h-4 w-4" />
              </button>
            )}
          </form>
          {emo && <EmojiPanel onPick={insertEmoji} />}
        </div>
      )}

      {menu && menu.id === "__bulk__" && sel && (
        <Sheet onClose={() => setMenu(null)}>
          <p className="mb-2 px-2 text-sm font-bold">{sel.size} {bn ? "টি মেসেজ মুছবেন?" : "messages — delete?"}</p>
          <SheetBtn danger onClick={() => delForMe([...sel])}><Trash2 className="h-5 w-5" /> {bn ? "আমার জন্য মুছুন" : "Delete for me"}</SheetBtn>
          {(isOwner || shown.filter((m) => sel.has(m.id)).every((m) => m.sender_id === me.data?.id)) && isOwner && (
            <SheetBtn danger onClick={() => { setMenu(null); delMany([...sel]); }}><Trash2 className="h-5 w-5" /> {bn ? "সবার জন্য মুছুন" : "Delete for everyone"}</SheetBtn>
          )}
          <SheetBtn onClick={() => setMenu(null)}>{bn ? "বাতিল" : "Cancel"}</SheetBtn>
        </Sheet>
      )}

      {menu && menu.id !== "__bulk__" && menu.deleted_at && (
        <Sheet onClose={() => setMenu(null)}>
          <SheetBtn danger onClick={() => { if (confirm(bn ? "আপনার ফোন থেকে সরাবেন?" : "Remove from your phone?")) delForMe([menu.id]); }}><Trash2 className="h-5 w-5" /> {bn ? "আমার জন্য মুছুন" : "Delete for me"}</SheetBtn>
          <SheetBtn onClick={() => setMenu(null)}>{bn ? "বাতিল" : "Cancel"}</SheetBtn>
        </Sheet>
      )}

      {menu && menu.id !== "__bulk__" && !menu.deleted_at && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6 backdrop-blur-sm" onClick={() => setMenu(null)}>
          <div className="animate-pop-in w-full max-w-[17rem] space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between rounded-full bg-background px-2 py-1 shadow-lg">
              {REACTIONS.map((em) => {
                const on = (menu.reactions?.[em] ?? []).includes(me.data?.id ?? "");
                return (
                  <button key={em} aria-label={`React ${em}`} onClick={() => { react(menu, em); setMenu(null); }}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition-transform active:scale-125 ${on ? "bg-primary/20" : ""}`}>{em}</button>
                );
              })}
            </div>
            <div className={`max-h-28 overflow-hidden rounded-2xl px-3 py-2 text-sm shadow-lg ${menu.sender_id === me.data?.id ? "ml-auto w-fit max-w-full bg-bubble-me" : "mr-auto w-fit max-w-full bg-bubble-them"}`}>
              <p className="line-clamp-4 break-words">{menu.body ?? menu.file_name ?? ""}</p>
            </div>
            <div className="overflow-hidden rounded-2xl bg-background py-1 shadow-xl">
              <MenuRow icon={Reply} label={bn ? "রিপ্লাই" : "Reply"} onClick={() => { setEditing(null); setReplyTo(menu); setMenu(null); }} />
              {!noCopy && <MenuRow icon={Copy} label={bn ? "কপি" : "Copy"} onClick={() => copy(menu)} />}
              {!noCopy && <MenuRow icon={Share2} label={bn ? "ফরওয়ার্ড" : "Forward"} onClick={() => startForward(menu)} />}
              <MenuRow icon={Star} label={starred.has(menu.id) ? (bn ? "স্টার সরান" : "Unstar") : bn ? "স্টার করুন" : "Star"} onClick={() => { toggleStar(menu.id); setMenu(null); }} />
              <MenuRow icon={Pin} label={menu.pinned ? (bn ? "আনপিন" : "Unpin") : bn ? "পিন করুন" : "Pin"} onClick={() => togglePin(menu)} />
              {isOwner && menu.sender_id === me.data?.id && canEdit(menu) && (
                <MenuRow icon={Pencil} label={bn ? "এডিট" : "Edit"} onClick={() => startEdit(menu)} />
              )}
              {menu.sender_id === me.data?.id && <MenuRow icon={Info} label={bn ? "বিস্তারিত" : "Info"} onClick={() => { setMsgInfo(menu); setMenu(null); }} />}
              <MenuRow icon={CheckCheck} label={bn ? "সিলেক্ট" : "Select"} onClick={() => { setSel(new Set([menu.id])); setMenu(null); }} />
              <MenuRow icon={Trash2} danger label={bn ? "মুছুন" : "Delete"} onClick={() => { setConfirmDel({ ids: [menu.id], single: menu }); setMenu(null); }} />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-5 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div role="dialog" aria-label="Edit message" className="animate-pop-in w-full max-w-sm rounded-2xl bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-primary"><Pencil className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{bn ? "মেসেজ এডিট করুন" : "Edit message"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(() => { const left = Math.max(0, Math.ceil((15 * 60_000 - (Date.now() - new Date(editing.created_at).getTime())) / 60_000)); return bn ? `আর ${left} মিনিট এডিট করা যাবে` : `${left} min left to edit`; })()}
                </p>
              </div>
              <button aria-label="Close" onClick={() => setEditing(null)} className="rounded-full p-1"><X className="h-5 w-5" /></button>
            </div>
            <textarea autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} rows={4}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}
              className="w-full resize-none rounded-xl border border-input bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-primary" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-full bg-muted py-2.5 text-sm font-bold">{bn ? "বাতিল" : "Cancel"}</button>
              <button disabled={!editText.trim() || editText.trim() === editing.body} onClick={saveEdit} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{bn ? "সেভ করুন" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-6" onClick={() => setConfirmDel(null)}>
          <div role="alertdialog" className="animate-pop-in w-full max-w-xs rounded-2xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><Trash2 className="h-5 w-5" /></div>
            <p className="text-base font-extrabold">{confirmDel.ids.length > 1 ? (bn ? `${confirmDel.ids.length}টি মেসেজ মুছবেন?` : `Delete ${confirmDel.ids.length} messages?`) : bn ? "মেসেজটি মুছবেন?" : "Delete this message?"}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {isOwner
                ? (bn ? "“আমার জন্য” দিলে শুধু আপনার ফোন থেকে সরবে। “সবার জন্য” দিলে দুই দিক থেকেই চিরতরে মুছে যাবে — আর ফেরত আনা যাবে না।" : "“For me” removes it only from your phone. “For everyone” permanently deletes it on both sides — this can't be undone.")
                : (bn ? "এটি শুধু আপনার ফোন থেকে সরবে। অপর পাশে মেসেজটি থেকে যাবে।" : "This removes it only from your phone. The other side will still see it.")}
            </p>
            <div className="mt-4 space-y-2">
              {isOwner && (
                <button onClick={() => { const c = confirmDel; setConfirmDel(null); if (c.single) del(c.single); else delMany(c.ids); }}
                  className="w-full rounded-full bg-destructive py-2.5 text-sm font-bold text-destructive-foreground">{bn ? "সবার জন্য মুছুন" : "Delete for everyone"}</button>
              )}
              <button onClick={() => { const c = confirmDel; setConfirmDel(null); delForMe(c.ids); }}
                className={`w-full rounded-full py-2.5 text-sm font-bold ${isOwner ? "bg-destructive/10 text-destructive" : "bg-destructive text-destructive-foreground"}`}>{bn ? "আমার জন্য মুছুন" : "Delete for me"}</button>
              <button onClick={() => setConfirmDel(null)} className="w-full rounded-full bg-muted py-2.5 text-sm font-bold">{bn ? "বাতিল" : "Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {attach && (
        <Sheet onClose={() => setAttach(false)}>
          <div className="grid grid-cols-4 gap-2 pb-2">
            {[
              { icon: Camera, en: "Camera", bn: "ক্যামেরা", accept: "image/*", camera: true },
              { icon: ImageIcon, en: "Gallery", bn: "গ্যালারি", accept: "image/*,video/*", multiple: true },
              { icon: Film, en: "Video", bn: "ভিডিও", accept: "video/*" },
              { icon: FileText, en: "Document", bn: "ডকুমেন্ট", accept: "application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt", multiple: true },
              { icon: Music, en: "Audio", bn: "অডিও", accept: "audio/*" },
            ].map((o) => (
              <button key={o.en} onClick={() => pick(o.accept, o)} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold active:bg-muted">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary"><o.icon className="h-6 w-6" /></span>
                {bn ? o.bn : o.en}
              </button>
            ))}
            <button onClick={() => { setAttach(false); setFun(true); }} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold active:bg-muted">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Heart className="h-6 w-6" /></span>
              {bn ? "মজা ❤️" : "Fun ❤️"}
            </button>
            <button onClick={shareLocation} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold active:bg-muted">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary"><MapPin className="h-6 w-6" /></span>
              {bn ? "লোকেশন" : "Location"}
            </button>
          </div>
        </Sheet>
      )}

      {fun && me.data && pair && (
        <Sheet onClose={() => setFun(false)}>
          <FunMenu bn={bn} me={me.data.id} other={pair.other.id} onSend={sendFun} onClose={() => setFun(false)} onTap={() => setTap({ start: null })} />
        </Sheet>
      )}

      {fwd && (
        <Sheet onClose={() => setFwd(null)}>
          <p className="mb-2 px-2 text-sm font-bold">{bn ? "যাকে ফরওয়ার্ড করবেন" : "Forward to"}</p>
          {otherPairs.map((p) => (
            <SheetBtn key={p.id} onClick={() => forwardTo(p.id)}>
              <FpAvatar name={p.other.display_name} size={36} /> {p.other.display_name}
            </SheetBtn>
          ))}
          <SheetBtn onClick={() => setFwd(null)}>{bn ? "বাতিল" : "Cancel"}</SheetBtn>
        </Sheet>
      )}

      {more && (
        <Sheet onClose={() => setMore(false)}>
          {isOwner && pair ? (
            <>
              <div className="mb-3 flex items-center gap-3">
                <FpAvatar name={pair.other.display_name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{pair.other.display_name}</p>
                  <p className="text-xs text-muted-foreground">{bn ? "পার্টনার কন্ট্রোল" : "Partner controls"}</p>
                </div>
              </div>
              <div className="max-h-[70vh] space-y-3 overflow-y-auto">
                <PartnerStatus pair={pair} />
                <OwnerChatTools
                  pair={pair}
                  ctl={controls.data}
                  onDone={() => setMore(false)}
                  onSearch={() => { setMore(false); setQ(""); }}
                  onSiren={() => remote("siren")}
                  onRemote={(k) => remote(k)}
                  onLogout={() => { if (confirm(bn ? "পার্টনারকে তার ফোন থেকে লগআউট করাবেন?" : "Sign the partner out of their phone?")) remote("force_logout"); }}
                  onClear={clearChat}
                />
                <div className="rounded-2xl bg-muted/50 p-1">
              <SheetBtn onClick={() => { setMore(false); setInfo(true); }}><Info className="h-5 w-5" /> Contact info</SheetBtn>
              <SheetBtn onClick={() => { setMore(false); setInfo(true); }}><Star className="h-5 w-5" /> Wallpaper</SheetBtn>
              <SheetBtn onClick={() => { setMore(false); setMuteSheet(true); }}><BellOff className="h-5 w-5" /> {muted ? (bn ? "মিউট করা আছে · বদলান" : "Muted · change") : bn ? "নোটিফিকেশন মিউট" : "Mute notifications"}</SheetBtn>
              <SheetBtn onClick={exportChat}><Download className="h-5 w-5" /> {bn ? "চ্যাট এক্সপোর্ট (.txt)" : "Export chat (.txt)"}</SheetBtn>
              <SheetBtn onClick={pinLock}><KeyRound className="h-5 w-5" /> {hasPin ? (bn ? "চ্যাট পিন বন্ধ করুন" : "Remove chat PIN") : bn ? "৪-সংখ্যার চ্যাট পিন লক" : "4-digit chat PIN lock"}</SheetBtn>
                </div>
              </div>
            </>
          ) : (
            <div className="max-h-[75vh] overflow-y-auto">
              <SheetBtn onClick={() => { setMore(false); setQ(""); }}><Search className="h-5 w-5" /> {bn ? "চ্যাটে খুঁজুন" : "Search chat"}</SheetBtn>
              <SheetBtn onClick={() => { setMore(false); setInfo(true); }}><Star className="h-5 w-5" /> {bn ? "কন্টাক্ট, মিডিয়া ও স্টার" : "Contact, media & starred"}</SheetBtn>
              <SheetBtn onClick={() => { setMore(false); setMuteSheet(true); }}><BellOff className="h-5 w-5" /> {muted ? (bn ? "মিউট করা আছে · বদলান" : "Muted · change") : bn ? "নোটিফিকেশন মিউট" : "Mute notifications"}</SheetBtn>
              <SheetBtn onClick={exportChat}><Download className="h-5 w-5" /> {bn ? "চ্যাট এক্সপোর্ট (.txt)" : "Export chat (.txt)"}</SheetBtn>
              <SheetBtn onClick={pinLock}><KeyRound className="h-5 w-5" /> {hasPin ? (bn ? "চ্যাট পিন বন্ধ করুন" : "Remove chat PIN") : bn ? "৪-সংখ্যার চ্যাট পিন লক" : "4-digit chat PIN lock"}</SheetBtn>
              <SheetBtn onClick={clearChat}><Trash2 className="h-5 w-5" /> {bn ? "আমার জন্য চ্যাট খালি করুন" : "Clear chat for me"}</SheetBtn>
              {pol.sos && (
                <SheetBtn danger onClick={async () => {
                  setMore(false);
                  if (!me.data) return;
                  try { await sendSos(me.data.id); toast.success(bn ? "SOS পাঠানো হয়েছে" : "SOS sent"); } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
                }}><Siren className="h-5 w-5" /> {bn ? "জরুরি SOS পাঠান" : "Send emergency SOS"}</SheetBtn>
              )}
            </div>
          )}
          <SheetBtn onClick={() => setMore(false)}>{bn ? "বাতিল" : "Cancel"}</SheetBtn>
        </Sheet>
      )}

      {muteSheet && (
        <Sheet onClose={() => setMuteSheet(false)}>
          <p className="mb-2 px-2 text-[15px] font-bold">{bn ? "কতক্ষণ মিউট থাকবে?" : "Mute for how long?"}</p>
          <SheetBtn onClick={() => setMute(8 * 3600e3)}><BellOff className="h-5 w-5" /> {bn ? "৮ ঘণ্টা" : "8 hours"}</SheetBtn>
          <SheetBtn onClick={() => setMute(7 * 86400e3)}><BellOff className="h-5 w-5" /> {bn ? "১ সপ্তাহ" : "1 week"}</SheetBtn>
          <SheetBtn onClick={() => setMute(-1)}><BellOff className="h-5 w-5" /> {bn ? "সবসময়" : "Always"}</SheetBtn>
          <SheetBtn onClick={() => { const h = Number(prompt(bn ? "কত ঘণ্টা? (সংখ্যা লিখুন)" : "How many hours?") ?? ""); if (h > 0) setMute(h * 3600e3); }}><Timer className="h-5 w-5" /> {bn ? "নিজে সময় দিন" : "Custom"}</SheetBtn>
          {muted && <SheetBtn onClick={() => setMute(0)}><Check className="h-5 w-5" /> {bn ? "মিউট বন্ধ করুন" : "Unmute"}</SheetBtn>}
          <SheetBtn onClick={() => setMuteSheet(false)}>{bn ? "বাতিল" : "Cancel"}</SheetBtn>
        </Sheet>
      )}

      {caption && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-foreground">
          <header className="flex items-center gap-2 p-3 text-background">
            <button aria-label="Close preview" onClick={() => { caption.urls.forEach((u) => URL.revokeObjectURL(u)); setCaption(null); }} className="rounded-full p-1.5"><X className="h-6 w-6" /></button>
            <p className="font-bold">{caption.files.length > 1 ? `${caption.files.length} ${bn ? "টি ফাইল" : "files"}` : caption.files[0]?.name}</p>
          </header>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            {caption.files[0]?.type.startsWith("video/")
              ? <video src={caption.urls[0]} controls className="max-h-full max-w-full rounded-lg" />
              : <img src={caption.urls[0]} alt="" className="max-h-full max-w-full rounded-lg object-contain" />}
          </div>
          {caption.files.length > 1 && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2">
              {caption.urls.map((u, i) => caption.files[i]!.type.startsWith("image/")
                ? <img key={u} src={u} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                : <span key={u} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-background/20 text-background"><Film className="h-5 w-5" /></span>)}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); sendCaption(); }} className="flex items-center gap-2 p-3">
            <input autoFocus value={caption.text} onChange={(e) => setCaption({ ...caption, text: e.target.value })}
              placeholder={bn ? "ক্যাপশন লিখুন…" : "Add a caption…"} className="min-w-0 flex-1 rounded-full bg-background px-4 py-2.5 text-sm outline-none" />
            <button aria-label="Send media" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Send className="h-5 w-5" /></button>
          </form>
        </div>
      )}

      {clearSheet && (
        <Sheet onClose={() => setClearSheet(false)}>
          <p className="mb-2 px-2 text-sm font-bold">{bn ? "চ্যাট খালি করবেন?" : "Clear this chat?"}</p>
          {isOwner ? (
            <>
              <SheetBtn danger onClick={() => doClear(false)}><Trash2 className="h-5 w-5" /> {bn ? "সব মুছুন (মিডিয়াসহ)" : "Clear everything (with media)"}</SheetBtn>
              <SheetBtn danger onClick={() => doClear(true)}><Trash2 className="h-5 w-5" /> {bn ? "শুধু মেসেজ মুছুন (মিডিয়া রাখুন)" : "Clear messages, keep media"}</SheetBtn>
            </>
          ) : (
            <SheetBtn danger onClick={() => doClear(false)}><Trash2 className="h-5 w-5" /> {bn ? "আমার জন্য চ্যাট খালি করুন" : "Clear chat for me"}</SheetBtn>
          )}
          <SheetBtn onClick={() => setClearSheet(false)}>{bn ? "বাতিল" : "Cancel"}</SheetBtn>
        </Sheet>
      )}

      {pinDlg && <PinDialog mode={pinDlg} expected={getChatPin(pairId)} bn={bn} onDone={pinDone} onClose={() => setPinDlg(null)} />}

      {info && pair && (
        <ContactInfo name={pair.other.display_name} photo={pair.other.avatar_url} lastSeen={pair.other.last_seen} code={pair.other.pair_code}
          messages={(messages.data ?? []).filter((m) => !hidden.has(m.id))} bn={bn} onClose={() => setInfo(false)} onImage={setViewer}
          wallpaper={wall} setWallpaper={setWall} starred={starred} />
      )}

      {viewer && (
        <MediaViewer key={viewer} src={viewer} onClose={() => setViewer(null)} blockSave={blockSave}
          {...(() => {
            const list = shown.filter((m) => (m.file_type ?? "").startsWith("image/") && !m.deleted_at && urls.current.has(m.id)).map((m) => urls.current.get(m.id)!);
            const i = list.indexOf(viewer);
            return {
              index: i, total: list.length,
              onPrev: i > 0 ? () => setViewer(list[i - 1]!) : undefined,
              onNext: i >= 0 && i < list.length - 1 ? () => setViewer(list[i + 1]!) : undefined,
            };
          })()} />
      )}

      {msgInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-6 backdrop-blur-sm" onClick={() => setMsgInfo(null)}>
          <div role="dialog" aria-label="Message info" className="animate-pop-in w-full max-w-xs rounded-2xl bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-base font-bold">{bn ? "মেসেজের বিস্তারিত" : "Message info"}</p>
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{msgInfo.body ?? msgInfo.file_name ?? ""}</p>
            {([
              [Check, bn ? "পাঠানো হয়েছে" : "Sent", msgInfo.created_at, ""],
              [CheckCheck, bn ? "পৌঁছেছে" : "Delivered", msgInfo.delivered_at ?? msgInfo.read_at, ""],
              [CheckCheck, bn ? "পড়া হয়েছে" : "Read", hideRead ? null : msgInfo.read_at, "text-online"],
            ] as const).map(([I, label, at, cls]) => (
              <div key={label} className="flex items-center gap-3 border-t border-border py-2.5 text-sm">
                <I className={`h-4 w-4 ${cls}`} strokeWidth={2} />
                <span className="flex-1 font-medium">{label}</span>
                <span className="text-muted-foreground">{at ? new Date(at).toLocaleString(bn ? "bn-BD" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              </div>
            ))}
            <button onClick={() => setMsgInfo(null)} className="mt-2 w-full rounded-xl bg-muted py-2 text-sm font-semibold">{bn ? "বন্ধ করুন" : "Close"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex touch-none items-end justify-center bg-foreground/40" onClick={onClose}>
      <div className="animate-in slide-in-from-bottom w-full max-w-md touch-auto overscroll-contain rounded-t-3xl bg-background p-4 pt-2 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        {children}
      </div>
    </div>
  );
}

function MenuRow({ icon: I, label, onClick, danger }: { icon: typeof Trash2; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2.5 text-[15px] font-medium active:bg-muted ${danger ? "text-destructive" : "text-foreground"}`}>
      <I className={`h-[18px] w-[18px] shrink-0 ${danger ? "" : "text-muted-foreground"}`} strokeWidth={1.75} /> <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

function SheetBtn({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold ${danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted"}`}>
      {children}
    </button>
  );
}

function Bubble({
  message,
  mine,
  lang,
  onMenu,
  onImage,
  onUrl,
  onLove,
  quoted,
  blockSave,
  hideRead,
  myId,
  onReact,
  onReply,
  starred,
}: {
  starred?: boolean;
  message: Message;
  mine: boolean;
  lang: string;
  onMenu?: (() => void) | undefined;
  onImage: (url: string) => void;
  onUrl?: (url: string) => void;
  onLove?: () => void;
  quoted?: Message | undefined;
  blockSave?: boolean;
  hideRead?: boolean;
  myId?: string | undefined;
  onReact?: (emoji: string) => void;
  onReply?: (() => void) | undefined;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const { t } = useT();
  const bn = lang === "bn";
  const [url, setUrl] = useState<string | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message.file_path) return;
    // Private link that expires after 1 hour.
    supabase.storage
      .from("fixedpair-files")
      .createSignedUrl(message.file_path, 60 * 60)
      .then(({ data }) => { setUrl(data?.signedUrl ?? null); if (data?.signedUrl) onUrl?.(data.signedUrl); });
  }, [message.file_path]);

  const time = new Date(message.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (message.kind === "call") {
    const done = message.call_status === "completed";
    const secs = message.call_seconds ?? 0;
    const dur = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const video = message.call_type === "video";
    const label = done
      ? `${video ? (bn ? "ভিডিও কল" : "Video call") : bn ? "ভয়েস কল" : "Voice call"} · ${dur}`
      : message.call_status === "rejected"
        ? bn ? "কল কেটে দেওয়া হয়েছে" : "Call declined"
        : video ? (bn ? "মিসড ভিডিও কল" : "Missed video call") : bn ? "মিসড ভয়েস কল" : "Missed voice call";
    return (
      <div className="flex justify-center">
        <span className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
          {done ? <PhoneIncoming className="h-3.5 w-3.5 text-online" /> : <PhoneMissed className="h-3.5 w-3.5 text-destructive" />}
          {label} · {time}
        </span>
      </div>
    );
  }

  if (message.kind === "buzz") {
    return (
      <div className="flex justify-center">
        <span className="flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1.5 text-xs font-bold text-foreground shadow-sm">
          <Zap className="h-3.5 w-3.5 text-warning" /> {mine ? (bn ? "আপনি বাজ দিয়েছেন" : "You sent a buzz") : bn ? "বাজ পেয়েছেন!" : "Buzz!"} · {time}
        </span>
      </div>
    );
  }

  const type = message.file_type ?? "";
  const longPress = onMenu
    ? {
        onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onMenu(); },
      }
    : {};
  const touch = {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
      if (onMenu) press.current = setTimeout(onMenu, 500);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (press.current) clearTimeout(press.current);
      if (!start.current || !onReply) return;
      const x = e.touches[0]!.clientX - start.current.x;
      const y = e.touches[0]!.clientY - start.current.y;
      if (Math.abs(y) > Math.abs(x)) return;
      setDx(Math.max(0, Math.min(80, x)));
    },
    onTouchEnd: () => {
      if (press.current) clearTimeout(press.current);
      if (dx > 55) onReply?.();
      setDx(0);
      start.current = null;
    },
  };
  const reacts = Object.entries(message.reactions ?? {}).filter(([, v]) => v.length);

  return (
    <div className={`relative flex items-center gap-1 ${mine ? "justify-end" : "justify-start"} ${reacts.length ? "pb-3" : ""}`}>
      {dx > 0 && <Reply className="absolute left-1 h-5 w-5 text-primary" style={{ opacity: dx / 55 }} />}
      <div
        {...longPress}
        {...touch}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform .2s" }}
        className={`relative max-w-[80%] select-none rounded-2xl px-3 py-2 shadow-sm ${
          mine ? "rounded-br-sm bg-bubble-me text-bubble-me-foreground" : "rounded-bl-sm bg-bubble-them"
        }`}
      >
        {message.deleted_at ? (
          <p className="text-sm italic opacity-70">{bn ? "এই মেসেজটি মুছে ফেলা হয়েছে" : "This message was deleted"}</p>
        ) : (
          <>
            {quoted && (
              <div className={`mb-1 rounded-lg border-l-4 border-primary px-2 py-1 text-xs ${mine ? "bg-primary-foreground/20" : "bg-muted"}`}>
                <p className="line-clamp-2 break-words opacity-80">{quoted.deleted_at ? "…" : quoted.body ?? `📎 ${quoted.file_name ?? ""}`}</p>
              </div>
            )}
            {locUrl(message.body) ? (
              <a href={locUrl(message.body)!} target="_blank" rel="noreferrer" className={`block w-56 overflow-hidden rounded-xl ${mine ? "bg-primary-foreground/15" : "bg-muted"}`}>
                <div className="flex h-24 items-center justify-center bg-accent text-primary"><MapPin className="h-10 w-10 fill-primary/20" /></div>
                <p className="px-3 py-2 text-[15px] font-semibold">{bn ? "📍 লোকেশন · ম্যাপে দেখুন" : "📍 Location · Open in Maps"}</p>
              </a>
            ) : <>
            {message.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{message.body}</p>}
            {message.body && !message.file_path && firstUrl(message.body) && <LinkCard url={firstUrl(message.body)!} mine={mine} />}
            </>}
            {message.file_path && (
              <div className="space-y-1">
                {url && type.startsWith("image/") && (
                  <button onClick={() => onImage(url)} className="block">
                    <img src={url} alt={message.file_name ?? ""} loading="lazy" draggable={!blockSave} onContextMenu={blockSave ? (e) => e.preventDefault() : undefined} className="max-h-64 rounded-lg" />
                  </button>
                )}
                {url && type.startsWith("video/") && <video src={url} controls preload="metadata" controlsList={blockSave ? "nodownload" : undefined} onContextMenu={blockSave ? (e) => e.preventDefault() : undefined} className="max-h-64 rounded-lg" />}
                {url && type.startsWith("audio/") && <VoicePlayer src={url} mine={mine} />}
                {!type.startsWith("image/") && !type.startsWith("video/") && !type.startsWith("audio/") && (
                  <DocCard name={message.file_name ?? "file"} url={blockSave ? null : url} mine={mine} />
                )}
                {url && !blockSave && !isDoc(type) && (
                  <a href={url} target="_blank" rel="noreferrer" className={`flex items-center gap-1 text-xs underline ${mine ? "" : "text-primary"}`}>
                    <Download className="h-3 w-3" /> {t("download")}
                  </a>
                )}
              </div>
            )}
          </>
        )}
        <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {starred && <Star className="h-2.5 w-2.5 fill-current" />}
          {message.pinned && <Pin className="h-2.5 w-2.5" />}
          {message.edited_at && !message.deleted_at && <span className="italic">{bn ? "এডিটেড" : "edited"} ·</span>}
          {time}
          {mine && !message.deleted_at && (
            <StatusTick status={msgStatus(message, hideRead)} size={14} />
          )}
        </p>
        {reacts.length > 0 && !message.deleted_at && (
          <div className={`absolute -bottom-3 flex gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-xs text-foreground shadow-sm ${mine ? "right-2" : "left-2"}`}>
            {reacts.map(([em, users]) => (
              <button key={em} type="button" aria-label={`Reaction ${em}`} onClick={() => onReact?.(em)}
                className={`flex items-center gap-0.5 rounded-full px-0.5 ${myId && users.includes(myId) ? "bg-primary/15" : ""}`}>
                {em}{users.length > 1 && <span className="text-[10px] font-bold">{users.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {!mine && !message.deleted_at && onLove && (
        <button aria-label="Love" onClick={onLove} className="rounded-full p-1 text-muted-foreground/60 active:scale-125 hover:text-destructive">
          <Heart className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function DraftAudio({ file }: { file: File }) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => { const x = URL.createObjectURL(file); setU(x); return () => URL.revokeObjectURL(x); }, [file]);
  return u ? <VoicePlayer src={u} mine={false} /> : null;
}

const previewCache = new Map<string, Promise<LinkPreview>>();
function LinkCard({ url, mine }: { url: string; mine: boolean }) {
  const fetchPreview = useServerFn(getLinkPreview);
  const [p, setP] = useState<LinkPreview | null>(null);
  useEffect(() => {
    let on = true;
    let job = previewCache.get(url);
    if (!job) { job = fetchPreview({ data: { url } }); previewCache.set(url, job); }
    job.then((r) => { if (on) setP(r); }).catch(() => {});
    return () => { on = false; };
  }, [url, fetchPreview]);
  if (!p || (!p.title && !p.image)) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`mt-1 block overflow-hidden rounded-lg border-l-4 border-primary ${mine ? "bg-primary-foreground/15" : "bg-muted"}`}>
      {p.image && <img src={p.image} alt="" loading="lazy" className="max-h-40 w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <div className="px-2 py-1.5">
        {p.title && <p className="line-clamp-2 text-xs font-bold">{p.title}</p>}
        {p.description && <p className="line-clamp-2 text-[11px] opacity-80">{p.description}</p>}
        <p className="text-[10px] opacity-70">{p.site}</p>
      </div>
    </a>
  );
}

const DEFAULT_EMOJIS = ["❤️", "😂", "😍", "👍", "🙏"];
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f)+$/u;

/** Most-used emojis first (then defaults), plus the user's most-sent short texts (IMO style). */
export function rankQuick(usage: Record<string, number>, _bn?: boolean) {
  const sorted = Object.entries(usage).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  // imo-style: an emoji earns a slot only after repeated use; defaults fill the rest.
  const frequent = sorted.filter((k) => EMOJI_ONLY.test(k) && (usage[k] ?? 0) >= 3);
  const emojis = [...new Set([...frequent, ...DEFAULT_EMOJIS])].slice(0, 10);
  const phrases = sorted.filter((k) => !EMOJI_ONLY.test(k) && k.length <= 30 && (usage[k] ?? 0) >= 2).slice(0, 8);
  return { emojis, phrases };
}

/** Low-data mode: re-encode photos to max 1280px JPEG before upload. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.6));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

const isDoc = (type: string) => !type.startsWith("image/") && !type.startsWith("video/") && !type.startsWith("audio/");
function locUrl(body: string | null) {
  const m = body?.match(/^📍 (https:\/\/maps\.google\.com\/\?q=-?[\d.]+,-?[\d.]+)$/u);
  return m ? m[1]! : null;
}
function DocCard({ name, url, mine }: { name: string; url: string | null; mine: boolean }) {
  const ext = (name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
  const color = ext === "PDF" ? "bg-destructive" : "bg-primary";
  const body = (
    <div className={`flex w-60 items-center gap-3 rounded-xl p-2.5 ${mine ? "bg-primary-foreground/15" : "bg-muted"}`}>
      <span className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold text-primary-foreground ${color}`}>{ext || "FILE"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <p className="text-xs opacity-70">{ext || "File"}</p>
      </div>
      {url && <Download className="h-5 w-5 shrink-0 opacity-80" />}
    </div>
  );
  return url ? <a href={url} target="_blank" rel="noreferrer" download={name} className="block">{body}</a> : body;
}
