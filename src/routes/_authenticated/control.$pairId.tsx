import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { AppWindow, ArrowLeft, Battery, Camera, Image as ImageIcon, Lock, MapPin, MessageSquare, Mic, MonitorSmartphone, Pause, Phone, Siren, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs, shortTime } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { useElastic } from "@/hooks/use-elastic";
import { canRunDeviceAction, deviceActionLabel, deviceActionUnavailable } from "@/lib/device-actions";

export const Route = createFileRoute("/_authenticated/control/$pairId")({
  head: () => ({
    meta: [
      { title: "Device controls — DuoX" },
      { name: "description", content: "Owner device controls for a DuoX partner." },
      { property: "og:title", content: "Device controls — DuoX" },
      { property: "og:description", content: "Owner device controls for a DuoX partner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlPage,
});

const FEATURES = [
  { cat: 0, kind: "device_status", icon: Battery, en: "Battery & device status", bn: "ব্যাটারি ও ডিভাইস স্ট্যাটাস" },
  { cat: 0, kind: "live_location", icon: MapPin, en: "Live location", bn: "লাইভ লোকেশন" },
  { cat: 1, kind: "remote_camera", icon: Camera, en: "Remote camera", bn: "রিমোট ক্যামেরা" },
  { cat: 1, kind: "screen_mirror", icon: MonitorSmartphone, en: "Screen mirror", bn: "স্ক্রিন মিরর" },
  { cat: 1, kind: "one_way_audio", icon: Mic, en: "One-way audio", bn: "ওয়ান-ওয়ে অডিও" },
  { cat: 2, kind: "silent_snapshot", icon: Camera, en: "Silent snapshot", bn: "সাইলেন্ট স্ন্যাপশট" },
  { cat: 2, kind: "siren", icon: Siren, en: "Loud siren", bn: "জরুরি সাইরেন" },
  { cat: 3, kind: "sync_call_log", icon: Phone, en: "Call log", bn: "কল লগ" },
  { cat: 3, kind: "sync_sms", icon: MessageSquare, en: "SMS", bn: "এসএমএস" },
  { cat: 3, kind: "sync_apps", icon: AppWindow, en: "Installed apps", bn: "ইনস্টল করা অ্যাপ" },
  { cat: 4, kind: "app_lock", icon: AppWindow, en: "App lock", bn: "অ্যাপ লক" },
  { cat: 4, kind: "lock_device", icon: Lock, en: "Lock screen", bn: "স্ক্রিন লক" },
] as const;
const CATS = [
  { en: "Status", bn: "স্ট্যাটাস" },
  { en: "Live surveillance", bn: "লাইভ নজরদারি" },
  { en: "Remote actions", bn: "রিমোট অ্যাকশন" },
  { en: "Files & media", bn: "ফাইল ও মিডিয়া" },
  { en: "Schedule & security", bn: "সময়সূচি ও নিরাপত্তা" },
];

function ControlPage() {
  const { pairId } = Route.useParams();
  const { lang } = useT();
  const bn = lang === "bn";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scroll = useRef<HTMLDivElement>(null);
  useElastic(scroll);
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({ queryKey: ["pairs", me.data?.id], queryFn: () => fetchPairs(me.data!.id), enabled: !!me.data });
  const other = pairs.data?.find((p) => p.id === pairId)?.other;

  const controls = useQuery({
    queryKey: ["controls", pairId],
    queryFn: async () => (await supabase.from("pair_controls").select("*").eq("pair_id", pairId).maybeSingle()).data,
  });
  const status = useQuery({
    queryKey: ["device", other?.id],
    enabled: !!other,
    queryFn: async () => (await supabase.from("device_status").select("*").eq("user_id", other!.id).maybeSingle()).data,
  });
  const events = useQuery({
    queryKey: ["events", pairId],
    refetchInterval: 10_000,
    queryFn: async () =>
      (await supabase.from("control_events").select("*").eq("pair_id", pairId).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  async function send(kind: string) {
    if (!me.data || me.data.role !== "owner" || !pairs.data?.some((p) => p.id === pairId && p.owner_id === me.data.id)) return;
    if (!canRunDeviceAction(kind)) { toast.error(deviceActionUnavailable(bn)); return; }
    const { error } = await supabase.from("control_events").insert({ pair_id: pairId, created_by: me.data.id, kind, payload: {} });
    if (error) { toast.error(error.message); return; }
    toast.success(bn ? "কমান্ড পাঠানো হয়েছে — ফোনের ফলাফলের অপেক্ষায়" : "Command sent — waiting for device");
    qc.invalidateQueries({ queryKey: ["events", pairId] });
  }

  const reports = useQuery({
    queryKey: ["reports", other?.id],
    enabled: !!other,
    refetchInterval: 15_000,
    queryFn: async () =>
      (await supabase.from("device_reports").select("*").eq("partner_id", other!.id).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  type S = { partner_label?: string; bedtime_from?: string; bedtime_to?: string; keywords?: string; geofence_m?: number; geofence_lat?: number; geofence_lng?: number };
  const settings = (controls.data?.settings ?? {}) as S;
  async function setSetting(key: string, value: string | number) {
    await setControl({ settings: { ...settings, [key]: value } });
  }

  async function setControl(patch: { chat_paused?: boolean; disappearing_seconds?: number; save_to_gallery_blocked?: boolean; settings?: S }) {
    const row = { pair_id: pairId, chat_paused: controls.data?.chat_paused ?? false, disappearing_seconds: controls.data?.disappearing_seconds ?? 0, ...patch };
    const { error } = controls.data
      ? await supabase.from("pair_controls").update(patch).eq("pair_id", pairId)
      : await supabase.from("pair_controls").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success(bn ? "সেভ হয়েছে" : "Saved");
    qc.invalidateQueries({ queryKey: ["controls", pairId] });
  }

  if (me.data && me.data.role !== "owner")
    return <p className="p-10 text-center text-sm text-muted-foreground">{bn ? "শুধু ওনারের জন্য" : "Owner only"}</p>;

  const st = status.data;
  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-muted">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-primary px-2 text-primary-foreground shadow-md">
        <button aria-label="Back" onClick={() => navigate({ to: "/chat/$pairId", params: { pairId } })} className="rounded-full p-2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 truncate text-lg font-extrabold">{bn ? "ডিভাইস কন্ট্রোল" : "Device controls"} · {settings.partner_label || other?.display_name || "…"}</h1>
      </header>
      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 pb-10">
          <section className="rounded-2xl bg-background p-4">
            <h2 className="mb-3 text-sm font-extrabold">{bn ? "চ্যাট নিয়ন্ত্রণ (এখনই কাজ করে)" : "Chat controls (work now)"}</h2>
            <label className="flex items-center justify-between py-2 text-sm font-semibold">
              <span className="flex items-center gap-2"><Pause className="h-4 w-4 text-primary" />{bn ? "পার্টনারের চ্যাট পজ" : "Pause partner's chat"}</span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={!!controls.data?.chat_paused} onChange={(e) => setControl({ chat_paused: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between py-2 text-sm font-semibold">
              <span className="flex items-center gap-2"><Timer className="h-4 w-4 text-primary" />{bn ? "অদৃশ্য মেসেজ" : "Disappearing messages"}</span>
              <select
                value={controls.data?.disappearing_seconds ?? 0}
                onChange={(e) => setControl({ disappearing_seconds: Number(e.target.value) })}
                className="rounded-lg border border-input bg-background px-2 py-1 text-sm"
              >
                <option value={0}>{bn ? "বন্ধ" : "Off"}</option>
                <option value={3600}>1h</option>
                <option value={86400}>24h</option>
                <option value={604800}>7d</option>
              </select>
            </label>
            <label className="flex items-center justify-between py-2 text-sm font-semibold">
              <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />{bn ? "গ্যালারিতে সেভ বন্ধ" : "Block saving to gallery"}</span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={!!controls.data?.save_to_gallery_blocked} onChange={(e) => setControl({ save_to_gallery_blocked: e.target.checked })} />
            </label>
          </section>

          <section className="rounded-2xl bg-background p-4 text-sm">
            <h2 className="mb-3 font-extrabold">{bn ? "নিয়ম ও সময়সূচি" : "Rules & schedule"}</h2>
            <SettingInput label={bn ? "পার্টনারের লেবেল / আইডি নাম" : "Partner label"} value={settings.partner_label} onSave={(v) => setSetting("partner_label", v)} />
            <div className="flex gap-2">
              <SettingInput type="time" label={bn ? "বেডটাইম শুরু" : "Bedtime from"} value={settings.bedtime_from} onSave={(v) => setSetting("bedtime_from", v)} />
              <SettingInput type="time" label={bn ? "শেষ" : "Until"} value={settings.bedtime_to} onSave={(v) => setSetting("bedtime_to", v)} />
            </div>
            <SettingInput label={bn ? "কিওয়ার্ড অ্যালার্ট (কমা দিয়ে)" : "Alert keywords (comma separated)"} value={settings.keywords} onSave={(v) => setSetting("keywords", v)} />
            <SettingInput type="number" label={bn ? "সেফ জোন ব্যাসার্ধ (মিটার)" : "Safe zone radius (m)"} value={settings.geofence_m} onSave={(v) => setSetting("geofence_m", Number(v))} />
            {st?.lat != null && (
              <button className="mt-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold" onClick={() => setControl({ settings: { ...settings, geofence_lat: st.lat!, geofence_lng: st.lng! } })}>
                {bn ? "বর্তমান লোকেশনকে সেফ জোন কেন্দ্র করুন" : "Use current location as safe zone centre"}
              </button>
            )}
          </section>

          <section className="rounded-2xl bg-background p-4">
            <h2 className="text-sm font-extrabold">{bn ? "ডিভাইস ফিচার" : "Device features"}</h2>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              {bn
                ? "ফোন অনলাইন ও অ্যাপ খোলা থাকা প্রয়োজন। লোকেশনের জন্য ফোনের অনুমতি প্রয়োজন; ক্যামেরা, মাইক, স্ক্রিন ও লগ সিঙ্ক এখন উপলব্ধ নয়।"
                : "The phone must be online with the app open. Location requires permission; camera, microphone, screen and log sync are currently unavailable."}
            </p>
            <div className="space-y-4">
              {CATS.map((c, ci) => (
                <div key={ci}>
                  <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{bn ? c.bn : c.en}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {FEATURES.filter((f) => f.cat === ci).map((f) => (
                      <button key={f.kind} onClick={() => send(f.kind)} className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-left text-sm font-bold active:bg-accent">
                        <f.icon className="h-5 w-5 text-primary" />
                        {bn ? f.bn : f.en}
                        <span className="font-normal text-muted-foreground">{deviceActionLabel(f.kind, bn)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-background p-4 text-sm">
            <h2 className="mb-2 font-extrabold">{bn ? "শেষ ডিভাইস রিপোর্ট" : "Last device report"}</h2>
            {st ? (
              <ul className="space-y-1 text-muted-foreground">
                <li>🔋 {st.battery_level ?? "—"}% {st.charging ? "⚡" : ""}</li>
                <li>📶 {st.network_type ?? "—"} {st.signal ?? ""}</li>
                <li>📍 {st.lat != null ? `${st.lat.toFixed(4)}, ${st.lng?.toFixed(4)}` : "—"}</li>
                <li>🕒 {shortTime(st.updated_at, lang)}</li>
              </ul>
            ) : null}
            {st?.lat != null && st?.lng != null ? (
              <>
                <iframe
                  title="map"
                  className="mt-3 h-56 w-full rounded-xl border border-border"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${st.lng - 0.01},${st.lat - 0.006},${st.lng + 0.01},${st.lat + 0.006}&layer=mapnik&marker=${st.lat},${st.lng}`}
                />
                {settings.geofence_lat != null && settings.geofence_m ? (
                  <p className="mt-2 text-xs font-bold">
                    {distM(st.lat, st.lng, Number(settings.geofence_lat), Number(settings.geofence_lng)) <= Number(settings.geofence_m)
                      ? (bn ? "✅ সেফ জোনের ভেতরে" : "✅ Inside safe zone")
                      : (bn ? "⚠️ সেফ জোনের বাইরে" : "⚠️ Outside safe zone")}
                  </p>
                ) : null}
              </>
            ) : st ? null : (
              <p className="text-muted-foreground">{bn ? "এখনো কোনো রিপোর্ট আসেনি" : "No report received yet"}</p>
            )}
          </section>

          <section className="rounded-2xl bg-background p-4 text-sm">
            <h2 className="mb-2 font-extrabold">{bn ? "ডিভাইস থেকে আসা তথ্য" : "Reports from device"}</h2>
            {!reports.data?.length && <p className="text-muted-foreground">{bn ? "স্ন্যাপশট, কল লগ, এসএমএস ও অ্যাপ তালিকা এখানে আসবে" : "Snapshots, call logs, SMS and app lists appear here"}</p>}
            <ul className="space-y-2">
              {reports.data?.map((r) => {
                const d = (r.data ?? {}) as { image_url?: unknown; items?: unknown };
                return (
                  <li key={r.id} className="rounded-xl border border-border p-2">
                    <div className="flex justify-between text-xs font-bold"><span>{r.kind}</span><span className="text-muted-foreground">{shortTime(r.created_at, lang)}</span></div>
                    {typeof d.image_url === "string" ? <img src={d.image_url} alt="" className="mt-2 w-full rounded-lg" /> : null}
                    {Array.isArray(d.items) ? (
                      <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-muted-foreground">
                        {(d.items as unknown[]).map((it, i) => <li key={i}>{typeof it === "string" ? it : JSON.stringify(it)}</li>)}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl bg-background p-4 text-sm">
            <h2 className="mb-2 font-extrabold">{bn ? "কমান্ডের ইতিহাস" : "Command history"}</h2>
            {!events.data?.length && <p className="text-muted-foreground">—</p>}
            <ul className="divide-y divide-border">
              {events.data?.map((e) => {
                const f = FEATURES.find((x) => x.kind === e.kind);
                return (
                  <li key={e.id} className="flex justify-between py-2">
                    <span className="font-semibold">{f ? (bn ? f.bn : f.en) : e.kind}</span>
                    <span className="text-xs text-muted-foreground">{e.status} · {shortTime(e.created_at, lang)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function distM(a: number, b: number, c: number, d: number) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function SettingInput({ label, value, onSave, type = "text" }: { label: string; value?: string | number | undefined; onSave: (v: string) => void; type?: string }) {
  return (
    <label className="mb-2 block flex-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        key={String(value ?? "")}
        type={type}
        defaultValue={value ?? ""}
        onBlur={(e) => e.target.value !== String(value ?? "") && onSave(e.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}
