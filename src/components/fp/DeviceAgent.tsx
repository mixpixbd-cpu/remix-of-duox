import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe } from "@/lib/fp";

/** Commands a plain browser can carry out; the rest wait for the Android companion app. */
const WEB_KINDS = new Set(["live_location", "device_status", "siren", "force_logout"]);

type Nav = Navigator & {
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
  connection?: { effectiveType?: string; type?: string };
};

async function reportStatus(userId: string, withLocation: boolean) {
  const n = navigator as Nav;
  const row: import("@/integrations/supabase/types").TablesInsert<"device_status"> = { user_id: userId, updated_at: new Date().toISOString() };
  try {
    const b = await n.getBattery?.();
    if (b) { row.battery_level = Math.round(b.level * 100); row.charging = b.charging; }
  } catch { /* unsupported */ }
  row.network_type = n.connection?.type ?? n.connection?.effectiveType ?? (navigator.onLine ? "online" : "offline");
  if (withLocation && "geolocation" in navigator) {
    await new Promise<void>((done) =>
      navigator.geolocation.getCurrentPosition(
        (p) => { row.lat = p.coords.latitude; row.lng = p.coords.longitude; row.accuracy = p.coords.accuracy; row.location_at = new Date().toISOString(); done(); },
        () => done(),
        { timeout: 10000, maximumAge: 60000 },
      ),
    );
  }
  await supabase.from("device_status").upsert(row);
}

function siren() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.type = "square"; o.connect(ctx.destination); o.start();
    let hi = false;
    const t = setInterval(() => { hi = !hi; o.frequency.value = hi ? 1200 : 700; }, 300);
    navigator.vibrate?.([500, 200, 500, 200, 500]);
    setTimeout(() => { clearInterval(t); o.stop(); ctx.close(); }, 10000);
  } catch { /* blocked */ }
}

/** Runs on the partner's device: sends battery/network status and answers control-hub commands. */
export function DeviceAgent() {
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      const me = await fetchMe();
      if (stop || !me || me.role !== "partner") return;
      const { data: pairs } = await supabase.from("pairs").select("id").eq("partner_id", me.id);
      const ids = (pairs ?? []).map((p) => p.id);
      reportStatus(me.id, false);
      timer = setInterval(() => reportStatus(me.id, false), 120_000);

      const handle = async (ev: { id: string; kind: string; status: string }) => {
        if (ev.status !== "pending") return;
        if (!WEB_KINDS.has(ev.kind)) {
          await supabase.from("control_events").update({ status: "needs_app" }).eq("id", ev.id);
          return;
        }
        if (ev.kind === "force_logout") {
          await supabase.from("control_events").update({ status: "done" }).eq("id", ev.id);
          await supabase.auth.signOut();
          window.location.href = "/auth";
          return;
        }
        if (ev.kind === "siren") siren();
        else await reportStatus(me.id, ev.kind === "live_location");
        await supabase.from("control_events").update({ status: "done" }).eq("id", ev.id);
      };
      if (!ids.length) return;
      const { data: pending } = await supabase.from("control_events").select("id, kind, status").in("pair_id", ids).eq("status", "pending");
      for (const e of pending ?? []) await handle(e);
      channel = supabase
        .channel(`agent-${me.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "control_events" }, (p) => {
          const e = p.new as { id: string; kind: string; status: string; pair_id: string };
          if (ids.includes(e.pair_id)) handle(e);
        })
        .subscribe();
    })();
    return () => { stop = true; clearInterval(timer); if (channel) supabase.removeChannel(channel); };
  }, []);
  return null;
}

/** Shows a phone notification for new messages while the app is in the background (muted chats skipped). */
export function MessageNotifier() {
  useEffect(() => {
    if (!("Notification" in window)) return;
    const ask = () => { if (Notification.permission === "default") Notification.requestPermission(); };
    window.addEventListener("pointerdown", ask, { once: true });
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let stop = false;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (stop || !uid) return;
      channel = supabase
        .channel(`notify-${uid}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
          const m = p.new as { sender_id: string; pair_id: string; body: string | null; kind: string };
          if (m.sender_id === uid || document.visibilityState === "visible") return;
          if (Notification.permission !== "granted") return;
          let mutes: string[] = [];
          try { mutes = JSON.parse(localStorage.getItem("fp-mutes") ?? "[]"); } catch { /* ignore */ }
          if (mutes.includes(m.pair_id)) return;
          if (Number(localStorage.getItem(`fp-mute-${m.pair_id}`) ?? 0) > Date.now()) return;
          const discreet = localStorage.getItem("fp-discreet") === "1";
          new Notification(discreet ? "Notes" : "DuoX", {
            body: discreet ? "1 new note" : m.kind === "text" && m.body ? m.body.slice(0, 80) : "New message",
            tag: m.pair_id,
          });
        })
        .subscribe();
    });
    return () => { stop = true; window.removeEventListener("pointerdown", ask); if (channel) supabase.removeChannel(channel); };
  }, []);
  return null;
}
