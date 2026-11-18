import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Siren } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { PairRow } from "@/lib/fp";
import { useAdminPolicy } from "@/lib/policy-actions";
import { useT } from "@/lib/i18n";

/** Admin-side alerts: partner SOS (full-screen + siren) and "partner has been offline for too long". */
export function OwnerAlerts({ ownerId, pairs, onOpenChat }: { ownerId: string; pairs: PairRow[]; onOpenChat: (pairId: string) => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const { policy } = useAdminPolicy(ownerId);
  const ackKey = `fp-sos-ack-${ownerId}`;
  const [ack, setAck] = useState(() => (typeof window === "undefined" ? 0 : Number(localStorage.getItem(ackKey) ?? 0)));

  const sos = useQuery({
    queryKey: ["sos", ownerId],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase.from("device_reports").select("id, partner_id, data, created_at").eq("kind", "sos").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });
  const pending = (sos.data ?? []).filter((r) => new Date(r.created_at).getTime() > ack);
  const top = pending[0];

  // Siren while an SOS is waiting.
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!top) return;
    let on = true, hi = false;
    try {
      ctx.current = new AudioContext();
      const osc = ctx.current.createOscillator();
      const gain = ctx.current.createGain();
      gain.gain.value = 0.25;
      osc.connect(gain).connect(ctx.current.destination);
      osc.start();
      const tick = setInterval(() => {
        hi = !hi;
        osc.frequency.value = hi ? 920 : 620;
        if (on) navigator.vibrate?.(300);
      }, 450);
      return () => { on = false; clearInterval(tick); osc.stop(); ctx.current?.close(); };
    } catch {
      return () => { on = false; };
    }
  }, [top?.id]);

  // Offline-too-long alerts.
  useEffect(() => {
    if (!policy.offlineHours) return;
    for (const p of pairs) {
      const ls = p.other.last_seen;
      if (!ls) continue;
      const hours = (Date.now() - new Date(ls).getTime()) / 3_600_000;
      const k = `fp-off-${p.id}`;
      if (hours >= policy.offlineHours && localStorage.getItem(k) !== ls) {
        localStorage.setItem(k, ls);
        toast.warning(
          bn ? `${p.other.display_name} ${Math.floor(hours)} ঘণ্টার বেশি অফলাইন` : `${p.other.display_name} has been offline for ${Math.floor(hours)}h+`,
          { duration: 15_000 },
        );
      }
    }
  }, [pairs, policy.offlineHours, bn]);

  // Forbidden-keyword alerts (written by a database trigger when a partner's message matches).
  const kw = useQuery({
    queryKey: ["keyword-alerts", ownerId],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase.from("device_reports").select("id, partner_id, data, created_at").eq("kind", "keyword").order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });
  useEffect(() => {
    const k = `fp-kw-ack-${ownerId}`;
    const seen = Number(localStorage.getItem(k) ?? 0);
    const fresh = (kw.data ?? []).filter((r) => new Date(r.created_at).getTime() > seen);
    if (!fresh.length) return;
    localStorage.setItem(k, String(new Date(fresh[0]!.created_at).getTime()));
    if (!seen) return; // first load: don't replay old alerts
    for (const r of fresh.reverse()) {
      const p = pairs.find((x) => x.partner_id === r.partner_id);
      const d = (r.data ?? {}) as { word?: string; body?: string; pair_id?: string };
      navigator.vibrate?.([200, 100, 200]);
      toast.error(bn ? `⚠️ ${p?.other.display_name ?? "পার্টনার"} নিষিদ্ধ শব্দ লিখেছে: "${d.word}"` : `⚠️ ${p?.other.display_name ?? "Partner"} used a blocked word: "${d.word}"`, {
        description: d.body, duration: 20_000,
        action: d.pair_id ? { label: bn ? "চ্যাট" : "Open", onClick: () => onOpenChat(d.pair_id!) } : undefined,
      });
    }
  }, [kw.data, ownerId, pairs, bn, onOpenChat]);

  if (!top) return null;
  const pair = pairs.find((p) => p.partner_id === top.partner_id);
  const d = (top.data ?? {}) as { lat?: number; lng?: number };
  function dismiss() {
    const t = Date.now();
    localStorage.setItem(ackKey, String(t));
    setAck(t);
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-destructive/90 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-background p-6 text-center">
        <Siren className="mx-auto h-14 w-14 animate-pulse text-destructive" />
        <p className="mt-3 text-2xl font-extrabold text-destructive">SOS</p>
        <p className="mt-1 text-lg font-bold">{pair?.other.display_name ?? (bn ? "একজন পার্টনার" : "A partner")}</p>
        <p className="text-sm text-muted-foreground">{bn ? "জরুরি সাহায্য চেয়েছেন" : "needs help right now"} · {new Date(top.created_at).toLocaleTimeString(bn ? "bn-BD" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
        {pending.length > 1 && <p className="mt-1 text-xs text-muted-foreground">+{pending.length - 1}</p>}
        {d.lat != null && d.lng != null && (
          <a href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=17/${d.lat}/${d.lng}`} target="_blank" rel="noreferrer" className="mt-4 block rounded-full bg-accent py-2.5 font-bold">
            {bn ? "অবস্থান দেখুন" : "See location"}
          </a>
        )}
        <div className="mt-3 flex gap-2">
          {pair && (
            <button onClick={() => { dismiss(); onOpenChat(pair.id); }} className="flex-1 rounded-full bg-primary py-2.5 font-bold text-primary-foreground">
              {bn ? "চ্যাট খুলুন" : "Open chat"}
            </button>
          )}
          <button onClick={dismiss} className="flex-1 rounded-full bg-muted py-2.5 font-bold">{bn ? "বন্ধ করুন" : "Dismiss"}</button>
        </div>
      </div>
    </div>
  );
}
