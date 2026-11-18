import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, RefreshCw, Video, VideoOff, Volume2, VolumeX } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { FpAvatar } from "@/components/fp/Avatar";
import { partnerMayCall, policyOfPair } from "@/lib/policy";

type CallSearch = { type: "voice" | "video"; role?: "callee" };

export const Route = createFileRoute("/_authenticated/call/$pairId")({
  validateSearch: (s: Record<string, unknown>): CallSearch => ({
    type: s["type"] === "video" ? "video" : "voice",
    ...(s["role"] === "callee" ? { role: "callee" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Call — DuoX" },
      { name: "description", content: "Voice and video calling between DuoX partners." },
      { property: "og:title", content: "Call — DuoX" },
      { property: "og:description", content: "Voice and video calling between DuoX partners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallPage,
});

const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

function CallPage() {
  const { pairId } = Route.useParams();
  const { type, role } = Route.useSearch();
  const callee = role === "callee";
  const { lang } = useT();
  const bn = lang === "bn";
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({ queryKey: ["pairs", me.data?.id], queryFn: () => fetchPairs(me.data!.id), enabled: !!me.data });
  const other = pairs.data?.find((p) => p.id === pairId)?.other;
  // Partners must obey the admin's call rules before a call can start.
  const isOwnerUser = me.data?.role === "owner";
  const rules = useQuery({
    queryKey: ["controls", pairId],
    enabled: !!me.data && !callee && !isOwnerUser,
    queryFn: async () => (await supabase.from("pair_controls").select("*").eq("pair_id", pairId).maybeSingle()).data,
  });
  const ruleReady = callee || isOwnerUser || rules.isFetched;
  const mayStart = callee || isOwnerUser || partnerMayCall(policyOfPair(rules.data), type);

  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [cam, setCam] = useState(type === "video");
  const [front, setFront] = useState(true);
  const [state, setState] = useState<"ringing" | "connecting" | "live">(callee ? "connecting" : "ringing");
  const [secs, setSecs] = useState(0);
  const [talk, setTalk] = useState(0);
  const localV = useRef<HTMLVideoElement>(null);
  const remoteV = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pc = useRef<RealtimeChannel | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const ended = useRef(false);
  const liveRef = useRef(false);
  const talkRef = useRef(0);

  function send(event: string, payload: Record<string, unknown> = {}) {
    pc.current?.send({ type: "broadcast", event, payload: { ...payload, from: me.data?.id } });
  }

  function makePeer() {
    const p = new RTCPeerConnection({ iceServers: ICE });
    stream.current?.getTracks().forEach((t) => p.addTrack(t, stream.current!));
    p.onicecandidate = (e) => e.candidate && send("ice", { c: e.candidate.toJSON() });
    p.ontrack = (e) => { if (remoteV.current) remoteV.current.srcObject = e.streams[0] ?? null; };
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") { liveRef.current = true; setState("live"); }
      if (p.connectionState === "failed") { toast.error(bn ? "সংযোগ ব্যর্থ" : "Connection failed"); end(true); }
    };
    peer.current = p;
    return p;
  }

  // Media + signalling
  useEffect(() => {
    if (!me.data || !ruleReady) return;
    if (!mayStart) {
      toast.error(bn ? "এডমিন এই কল বন্ধ রেখেছেন" : "The admin has turned this call off");
      navigate({ to: "/chat/$pairId", params: { pairId }, replace: true });
      return;
    }
    let stop = false;
    let ringTimer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" ? { facingMode: "user" } : false });
      } catch {
        toast.error(bn ? "মাইক/ক্যামেরা অনুমতি দিন" : "Allow microphone / camera");
      }
      if (stop) return stream.current?.getTracks().forEach((t) => t.stop());
      if (localV.current && stream.current) localV.current.srcObject = stream.current;

      const ch = supabase.channel(`call-${pairId}`, { config: { broadcast: { self: false } } });
      pc.current = ch;
      ch.on("broadcast", { event: "accept" }, async () => {
        if (callee || peer.current) return;
        clearInterval(ringTimer);
        setState("connecting");
        const p = makePeer();
        const offer = await p.createOffer();
        await p.setLocalDescription(offer);
        send("offer", { sdp: offer });
      })
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (!callee) return;
          const p = peer.current ?? makePeer();
          await p.setRemoteDescription(payload.sdp);
          const ans = await p.createAnswer();
          await p.setLocalDescription(ans);
          send("answer", { sdp: ans });
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => { await peer.current?.setRemoteDescription(payload.sdp); })
        .on("broadcast", { event: "ice" }, async ({ payload }) => { try { await peer.current?.addIceCandidate(payload.c); } catch { /* ignore */ } })
        .on("broadcast", { event: "reject" }, () => { if (!callee) { toast(bn ? "কল কেটে দিয়েছে" : "Call declined"); end(false, "rejected"); } })
        .on("broadcast", { event: "end" }, () => end(true))
        .subscribe((s) => {
          if (s !== "SUBSCRIBED") return;
          if (callee) send("accept");
          else {
            send("ring", { type });
            ringTimer = setInterval(() => send("ring", { type }), 3000);
          }
        });
    })();
    return () => {
      stop = true;
      clearInterval(ringTimer);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.id, ruleReady]);

  function cleanup() {
    stream.current?.getTracks().forEach((t) => t.stop());
    peer.current?.close();
    peer.current = null;
    if (pc.current) supabase.removeChannel(pc.current);
    pc.current = null;
  }

  useEffect(() => { stream.current?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }, [muted]);
  useEffect(() => { stream.current?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam]);
  useEffect(() => { if (remoteV.current) remoteV.current.muted = !speaker; }, [speaker]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecs((s) => s + 1);
      if (liveRef.current) { talkRef.current += 1; setTalk(talkRef.current); }
    }, 1000);
    return () => clearInterval(id);
  }, []);
  // Ring timeout: 45s without answer = missed
  useEffect(() => { if (state !== "live" && secs >= 45) end(false); }); // eslint-disable-line react-hooks/exhaustive-deps

  async function flip() {
    if (!stream.current) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: front ? "environment" : "user" } });
      const nt = s.getVideoTracks()[0]!;
      const old = stream.current.getVideoTracks()[0];
      if (old) { stream.current.removeTrack(old); old.stop(); }
      stream.current.addTrack(nt);
      const sender = peer.current?.getSenders().find((x) => x.track?.kind === "video");
      await sender?.replaceTrack(nt);
      if (localV.current) localV.current.srcObject = stream.current;
      setFront(!front);
    } catch {
      toast.error(bn ? "ক্যামেরা বদলানো যায়নি" : "Could not switch camera");
    }
  }

  async function end(remote = false, status?: string) {
    if (ended.current) return;
    ended.current = true;
    if (!remote) send("end");
    const wasLive = liveRef.current;
    cleanup();
    // The caller writes the call record to the chat timeline.
    if (!callee && me.data)
      await supabase.from("messages").insert({
        pair_id: pairId,
        sender_id: me.data.id,
        kind: "call",
        call_type: type,
        call_status: wasLive ? "completed" : status ?? "missed",
        call_seconds: talkRef.current,
      });
    navigate({ to: "/chat/$pairId", params: { pairId }, replace: true });
  }

  const Btn = ({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
    <button aria-label={label} onClick={onClick} className="flex flex-col items-center gap-1.5 text-xs font-semibold">
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ${on ? "bg-primary-foreground text-primary" : "bg-primary-foreground/20"}`}>{children}</span>
      {label}
    </button>
  );
  const mmss = `${String(Math.floor(talk / 60)).padStart(2, "0")}:${String(talk % 60).padStart(2, "0")}`;
  const status =
    state === "live" ? mmss : state === "connecting" ? (bn ? "সংযোগ হচ্ছে…" : "Connecting…") : `${bn ? "রিং হচ্ছে…" : "Ringing…"} ${secs}s`;
  const video = type === "video";

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col items-center overflow-hidden bg-primary text-primary-foreground">
      <video ref={remoteV} autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${video && state === "live" ? "" : "hidden"}`} />
      {video && (
        <video
          ref={localV}
          autoPlay
          playsInline
          muted
          className={`absolute z-10 object-cover ${front ? "-scale-x-100" : ""} ${
            state === "live" ? "right-3 top-3 h-40 w-28 rounded-2xl border-2 border-primary-foreground shadow-lg" : "inset-0 h-full w-full opacity-40"
          } ${cam ? "" : "invisible"}`}
        />
      )}
      {!(video && state === "live") && (
        <div className="relative mt-20 flex flex-col items-center">
          <div className="relative">
            {state !== "live" && <span className="fp-ring absolute inset-0 rounded-full bg-primary-foreground/40" />}
            <FpAvatar name={other?.display_name ?? "?"} size={110} />
          </div>
          <p className="mt-6 text-2xl font-extrabold">{other?.display_name ?? "…"}</p>
          <p className="mt-1 text-sm opacity-80">
            {video ? (bn ? "ভিডিও কল" : "Video call") : bn ? "ভয়েস কল" : "Voice call"} · {status}
          </p>
        </div>
      )}
      {video && state === "live" && (
        <p className="relative z-10 mt-4 rounded-full bg-foreground/40 px-3 py-1 text-sm font-semibold">{mmss}</p>
      )}
      <div className="relative z-10 mt-auto mb-12 flex w-full flex-col items-center gap-8">
        <div className="flex gap-6">
          <Btn on={muted} onClick={() => setMuted(!muted)} label={bn ? "মিউট" : "Mute"}>{muted ? <MicOff /> : <Mic />}</Btn>
          <Btn on={speaker} onClick={() => setSpeaker(!speaker)} label={bn ? "স্পিকার" : "Speaker"}>{speaker ? <Volume2 /> : <VolumeX />}</Btn>
          {video && <Btn on={cam} onClick={() => setCam(!cam)} label={bn ? "ক্যামেরা" : "Camera"}>{cam ? <Video /> : <VideoOff />}</Btn>}
          {video && <Btn on={false} onClick={flip} label={bn ? "ফ্লিপ" : "Flip"}><RefreshCw /></Btn>}
        </div>
        <button aria-label="End call" onClick={() => end(false)} className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg">
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}
