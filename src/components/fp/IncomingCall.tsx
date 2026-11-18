import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneOff, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { FpAvatar } from "@/components/fp/Avatar";

type Ring = { pairId: string; type: "voice" | "video"; name: string; at: number };

/** Listens for incoming call rings on every pair and shows Accept / Reject. */
export function IncomingCall() {
  const { lang } = useT();
  const bn = lang === "bn";
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({ queryKey: ["pairs", me.data?.id], queryFn: () => fetchPairs(me.data!.id), enabled: !!me.data });
  const [ring, setRing] = useState<Ring | null>(null);
  const key = (pairs.data ?? []).map((p) => p.id).join(",");

  useEffect(() => {
    const list = pairs.data ?? [];
    const chans = list.map((p) =>
      supabase
        .channel(`call-${p.id}`)
        .on("broadcast", { event: "ring" }, ({ payload }) => {
          if (payload?.from === me.data?.id) return;
          let muted = false;
          try { muted = (JSON.parse(localStorage.getItem("fp-mutes") ?? "[]") as string[]).includes(p.id); } catch { /* ignore */ }
          if (!muted) navigator.vibrate?.([400, 200, 400]);
          setRing({ pairId: p.id, type: payload?.type === "video" ? "video" : "voice", name: p.other.display_name, at: Date.now() });
        })
        .on("broadcast", { event: "end" }, () => setRing((r) => (r?.pairId === p.id ? null : r)))
        .subscribe(),
    );
    return () => { chans.forEach((c) => supabase.removeChannel(c)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, me.data?.id]);

  // Rings repeat every few seconds; drop the banner if they stop.
  useEffect(() => {
    if (!ring) return;
    const id = setTimeout(() => setRing((r) => (r && Date.now() - r.at > 7000 ? null : r)), 8000);
    return () => clearTimeout(id);
  }, [ring]);

  if (!ring) return null;
  const reject = () => {
    supabase.channel(`call-${ring.pairId}`).send({ type: "broadcast", event: "reject", payload: {} });
    setRing(null);
  };
  return (
    <div className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-primary p-3 text-primary-foreground shadow-xl">
      <FpAvatar name={ring.name} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{ring.name}</p>
        <p className="text-xs opacity-80">{ring.type === "video" ? (bn ? "ভিডিও কল আসছে…" : "Incoming video call…") : bn ? "ভয়েস কল আসছে…" : "Incoming voice call…"}</p>
      </div>
      <button aria-label="Reject" onClick={reject} className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
        <PhoneOff className="h-5 w-5" />
      </button>
      <button
        aria-label="Accept"
        onClick={() => { const r = ring; setRing(null); navigate({ to: "/call/$pairId", params: { pairId: r.pairId }, search: { type: r.type, role: "callee" } }); }}
        className="flex h-11 w-11 animate-pulse items-center justify-center rounded-full bg-online text-primary-foreground"
      >
        {ring.type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
      </button>
    </div>
  );
}
