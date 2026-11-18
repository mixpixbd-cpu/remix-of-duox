import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  Clock, Copy, Download, EyeOff, FileUp, Ghost, HardDrive, ImageOff, Megaphone, MessageCircle, Pause,
  PhoneIncoming, RefreshCw, ScrollText, ShieldAlert, Siren, Trash2, UserPlus, Users, Video, CopyX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPairs, isOnline, presenceOf, type PairRow } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { useAdminPolicy } from "@/lib/policy-actions";
import type { CallMode, Policy } from "@/lib/policy";
import { createPartner, getPartnerActivity, renewPartnerToken } from "@/lib/login.functions";
import { ownerSecret } from "@/lib/login";
import { FpAvatar } from "@/components/fp/Avatar";
import { Card, Chips, ConfirmButtons, Modal, Page, Row, SectionLabel, SubBack, SwitchRow, useBusy } from "@/components/fp/ui";

const inputCls = "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Error");

const PRESETS = [300, 3600, 86400, 604800];
function fmtSecs(sec: number, bn: boolean) {
  if (sec % 86400 === 0) return bn ? `${sec / 86400} দিন` : `${sec / 86400} d`;
  if (sec % 3600 === 0) return bn ? `${sec / 3600} ঘণ্টা` : `${sec / 3600} h`;
  return bn ? `${Math.round(sec / 60)} মিনিট` : `${Math.round(sec / 60)} min`;
}

type View = null | "directory" | "log";
type ModalKind = null | "add" | "lockout" | "broadcast" | "clean" | "timer";

/** Admin → Partner Setup: rules that apply to ALL partners at once (per-partner options live in each chat's 3-dot menu). */
export function PartnerSetup({ ownerId, onBack }: { ownerId: string; onBack: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const { policy, save } = useAdminPolicy(ownerId);
  const pairs = useQuery({ queryKey: ["pairs", ownerId], queryFn: () => fetchPairs(ownerId) });
  const [view, setView] = useState<View>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const count = pairs.data?.length ?? 0;
  const isPreset = policy.disappearing === 0 || PRESETS.includes(policy.disappearing);

  async function set(patch: Partial<Policy>) {
    try {
      await save(patch);
      toast.success(bn ? "সব পার্টনারের জন্য সংরক্ষিত" : "Saved for all partners");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  const close = () => setModal(null);

  return (
    <SubBack onBack={onBack}>
      <Page title={bn ? "পার্টনার সেটআপ" : "Partner Setup"} onBack={onBack}>

        <SectionLabel>{bn ? "পার্টনার অ্যাকাউন্ট" : "Partner accounts"}</SectionLabel>
        <Card>
          <Row icon={UserPlus} label={bn ? "পার্টনার যোগ করুন" : "Add partner"} onClick={() => setModal("add")} />
          <Row icon={Users} label={bn ? "সব পার্টনার (বদলান / সরান)" : "All partners (replace / remove)"} value={String(count)} onClick={() => setView("directory")} />
          <Row icon={ShieldAlert} danger label={bn ? "ইমার্জেন্সি লকআউট" : "Emergency lockout"} onClick={() => setModal("lockout")} />
        </Card>

        <SectionLabel>{bn ? "মেসেজ ও প্রাইভেসি" : "Messages & privacy"}</SectionLabel>
        <Card>
          <SwitchRow icon={Pause} label={bn ? "সব চ্যাট ফ্রিজ" : "Freeze all chats"} hint={bn ? "পার্টনাররা মেসেজ পাঠাতে পারবে না" : "Partners cannot send messages"} on={policy.freeze} onChange={(v) => set({ freeze: v })} />
          <Chips
            label={bn ? "অটো-ডিলিট টাইমার (ডিফল্ট)" : "Default disappearing timer"}
            value={isPreset ? policy.disappearing : -1}
            options={[
              { v: 0, text: bn ? "বন্ধ" : "Off" },
              ...PRESETS.map((v) => ({ v, text: fmtSecs(v, bn) })),
              { v: -1, text: isPreset ? (bn ? "কাস্টম" : "Custom") : fmtSecs(policy.disappearing, bn) },
            ]}
            onChange={(v) => (v === -1 ? setModal("timer") : set({ disappearing: v }))}
          />
          <SwitchRow icon={CopyX} label={bn ? "কপি ও ফরওয়ার্ড বন্ধ" : "No copy & forward"} hint={bn ? "পার্টনার মেসেজ কপি/ফরওয়ার্ড করতে পারবে না" : "Partners cannot copy or forward messages"} on={policy.noCopy} onChange={(v) => set({ noCopy: v })} />
          <SwitchRow icon={Ghost} label={bn ? "ঘোস্ট মোড" : "Ghost mode"} hint={bn ? "পার্টনাররা আপনার অনলাইন/লাস্ট সিন দেখবে না" : "Partners cannot see your online / last seen"} on={policy.ghost} onChange={(v) => set({ ghost: v })} />
          <SwitchRow icon={EyeOff} label={bn ? "স্টেলথ রিড ও টাইপিং" : "Stealth read & typing"} hint={bn ? "পার্টনার আপনার সিন টিক ও টাইপিং দেখবে না" : "Partners cannot see your read ticks or typing"} on={policy.stealth} onChange={(v) => set({ stealth: v })} />
        </Card>

        <SectionLabel>{bn ? "কল নিয়ন্ত্রণ" : "Calls"}</SectionLabel>
        <Card>
          <SwitchRow icon={PhoneIncoming} label={bn ? "শুধু ইনকামিং কল" : "Incoming calls only"} hint={bn ? "পার্টনার কল দিতে পারবে না, শুধু আপনার কল ধরবে" : "Partners cannot start calls, only answer yours"} on={!policy.callOut} onChange={(v) => set({ callOut: !v })} />
          <Chips<CallMode>
            label={bn ? "কলের ধরন" : "Allowed call type"}
            hint={bn ? "পার্টনার কোন ধরনের কল দিতে পারবে" : "What partners may start"}
            value={policy.callMode}
            options={[
              { v: "both", text: bn ? "ভয়েস + ভিডিও" : "Voice + video" },
              { v: "voice", text: bn ? "শুধু ভয়েস" : "Voice only" },
              { v: "video", text: bn ? "শুধু ভিডিও" : "Video only" },
            ]}
            onChange={(v) => set({ callMode: v })}
          />
        </Card>

        <SectionLabel>{bn ? "মিডিয়া ও ডেটা" : "Media & data"}</SectionLabel>
        <Card>
          <SwitchRow icon={ImageOff} label={bn ? "গ্যালারিতে সেভ বন্ধ" : "Block saving to gallery"} hint={bn ? "পার্টনার ছবি/ফাইল ডাউনলোড করতে পারবে না" : "Partners cannot download media"} on={policy.noSave} onChange={(v) => set({ noSave: v })} />
          <Chips
            label={bn ? "সর্বোচ্চ ফাইল সাইজ" : "Max upload size"}
            value={policy.maxMb}
            options={[
              { v: 0, text: bn ? "সীমাহীন" : "No limit" },
              { v: 5, text: "5 MB" },
              { v: 10, text: "10 MB" },
              { v: 25, text: "25 MB" },
            ]}
            onChange={(v) => set({ maxMb: v })}
          />
          <SwitchRow icon={Video} label={bn ? "ভিডিও পাঠানো বন্ধ" : "Block video uploads"} on={policy.blockVideo} onChange={(v) => set({ blockVideo: v })} />
          <SwitchRow icon={FileUp} label={bn ? "ডকুমেন্ট পাঠানো বন্ধ" : "Block document uploads"} hint={bn ? "PDF, Word ইত্যাদি" : "PDF, Word, etc."} on={policy.blockDocs} onChange={(v) => set({ blockDocs: v })} />
          <Row icon={HardDrive} label={bn ? "পুরনো মিডিয়া মুছুন" : "Clean old media"} onClick={() => setModal("clean")} />
        </Card>

        <SectionLabel>{bn ? "SOS ও অ্যালার্ট" : "SOS & alerts"}</SectionLabel>
        <Card>
          <SwitchRow icon={Siren} label={bn ? "SOS অ্যালার্ট" : "SOS alert"} hint={bn ? "পার্টনারের চ্যাটে SOS বাটন আসবে, চাপলে আপনার ফোনে সাইরেন বাজবে" : "Adds an SOS button for partners; your phone sounds a siren"} on={policy.sos} onChange={(v) => set({ sos: v })} />
          <Chips
            label={bn ? "অফলাইন অ্যালার্ট" : "Offline alert"}
            hint={bn ? "পার্টনার এত ঘণ্টা অফলাইন থাকলে জানাবে" : "Notify me when a partner stays offline this long"}
            value={policy.offlineHours}
            options={[
              { v: 0, text: bn ? "বন্ধ" : "Off" },
              { v: 6, text: bn ? "৬ ঘণ্টা" : "6 h" },
              { v: 12, text: bn ? "১২ ঘণ্টা" : "12 h" },
              { v: 24, text: bn ? "২৪ ঘণ্টা" : "24 h" },
            ]}
            onChange={(v) => set({ offlineHours: v })}
          />
        </Card>

        <SectionLabel>{bn ? "ব্রডকাস্ট ও এডমিন টুলস" : "Broadcast & admin tools"}</SectionLabel>
        <Card>
          <Row icon={Megaphone} label={bn ? "সবাইকে নোটিশ পাঠান" : "Broadcast notice"} onClick={() => setModal("broadcast")} />
          <Row icon={Download} label={bn ? "সব চ্যাট ব্যাকআপ (ডাউনলোড)" : "Export / backup all chats"} onClick={() => exportAll(pairs.data ?? [], bn)} />
          <Row icon={ScrollText} label={bn ? "অ্যাক্টিভিটি লগ" : "Activity log"} onClick={() => setView("log")} />
        </Card>
      </Page>

      {view === "directory" && <Directory ownerId={ownerId} onBack={() => setView(null)} onAdd={() => setModal("add")} />}
      {view === "log" && <ActivityLog ownerId={ownerId} onBack={() => setView(null)} />}

      {modal === "add" && <AddPartner onClose={close} />}
      {modal === "timer" && <CustomTimer current={policy.disappearing} onClose={close} onSave={async (v) => { await set({ disappearing: v }); close(); }} />}
      {modal === "lockout" && <Lockout pairs={pairs.data ?? []} onClose={close} onFreeze={() => save({ freeze: true })} />}
      {modal === "broadcast" && <Broadcast pairs={pairs.data ?? []} ownerId={ownerId} onClose={close} />}
      {modal === "clean" && <CleanMedia pairs={pairs.data ?? []} onClose={close} />}
    </SubBack>
  );
}

/* ---------------- Directory (full page) ---------------- */
function Directory({ ownerId, onBack, onAdd }: { ownerId: string; onBack: () => void; onAdd: () => void }) {
  const { lang, t } = useT();
  const bn = lang === "bn";
  const pairs = useQuery({ queryKey: ["pairs", ownerId], queryFn: () => fetchPairs(ownerId) });
  const act = useQuery({ queryKey: ["partner-activity", ownerId], queryFn: () => getPartnerActivity() });
  const bat = useQuery({
    queryKey: ["partner-battery", pairs.data?.map((p) => p.partner_id).join(",")],
    enabled: !!pairs.data?.length,
    queryFn: async () => (await supabase.from("device_status").select("user_id, battery_level, charging").in("user_id", pairs.data!.map((p) => p.partner_id))).data ?? [],
  });
  const [sel, setSel] = useState<PairRow | null>(null);

  return (
    <SubBack onBack={onBack}>
      <Page title={bn ? "সব পার্টনার" : "All partners"} onBack={onBack} right={<button onClick={onAdd} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground"><UserPlus className="h-4 w-4" /> {bn ? "যোগ" : "Add"}</button>}>
        {pairs.data?.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">{bn ? "এখনো কোনো পার্টনার নেই।" : "No partners yet."}</p>}
        {!!pairs.data?.length && (
          <Card>
            {pairs.data.map((p) => {
              const b = bat.data?.find((x) => x.user_id === p.partner_id);
              return (
                <button key={p.id} onClick={() => setSel(p)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 active:bg-muted">
                  <FpAvatar name={p.other.display_name} status={presenceOf(p.other.last_seen)} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.other.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {act.data?.find((a) => a.partnerId === p.partner_id)?.loginId ?? "…"} · {isOnline(p.other.last_seen) ? t("online") : t("offline")}
                      {b?.battery_level != null && ` · 🔋${b.battery_level}%${b.charging ? "⚡" : ""}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </Card>
        )}
      </Page>
      {sel && <PartnerActions pair={sel} loginId={act.data?.find((a) => a.partnerId === sel.partner_id)?.loginId ?? ""} onClose={() => setSel(null)} />}
    </SubBack>
  );
}

export function PartnerActions({ pair, loginId, onClose, initial = "menu" }: { pair: PairRow; loginId: string; onClose: () => void; initial?: "menu" | "replace" | "remove" }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const { busy, run } = useBusy();
  const [step, setStep] = useState<"menu" | "replace" | "remove" | "done">(initial);
  const [token, setToken] = useState("");

  const replace = () => run(async () => {
    try {
      const r = await renewPartnerToken({ data: { partnerUserId: pair.partner_id } });
      await supabase.rpc("revoke_partner_sessions", { _partner: pair.partner_id }); // logs the old device out
      setToken(r.token);
      setStep("done");
    } catch (e) { toast.error(errMsg(e)); }
  });
  const remove = () => run(async () => {
    await supabase.rpc("revoke_partner_sessions", { _partner: pair.partner_id });
    const { error } = await supabase.from("pairs").delete().eq("id", pair.id);
    if (error) { toast.error(error.message); return; }
    toast.success(bn ? "পার্টনার সরানো হয়েছে" : "Partner removed");
    qc.invalidateQueries({ queryKey: ["pairs"] });
    onClose();
  });

  return (
    <Modal title={pair.other.display_name} onClose={onClose}>
      {step === "menu" && (
        <div className="-mx-2">
          <p className="mb-2 px-2 text-xs text-muted-foreground">ID: {loginId || "…"}</p>
          <Link to="/chat/$pairId" params={{ pairId: pair.id }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 font-semibold active:bg-muted"><MessageCircle className="h-5 w-5 text-primary" /> {bn ? "চ্যাট খুলুন" : "Open chat"}</Link>
          <button onClick={() => setStep("replace")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold active:bg-muted"><RefreshCw className="h-5 w-5 text-primary" /> {bn ? "ডিভাইস/টোকেন বদলান" : "Replace device / token"}</button>
          <button onClick={() => setStep("remove")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold text-destructive active:bg-destructive/10"><Trash2 className="h-5 w-5" /> {bn ? "পার্টনার সরান" : "Remove partner"}</button>
        </div>
      )}
      {step === "replace" && (
        <>
          <p className="text-sm text-muted-foreground">{bn ? "নতুন টোকেন তৈরি হবে। পুরনো ডিভাইস সাথে সাথে লগআউট হবে। চ্যাটের ইতিহাস থাকবে।" : "A new token is created and the old device is signed out now. Chat history stays."}</p>
          <ConfirmButtons cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "বদলান" : "Replace"} onCancel={onClose} onOk={replace} busy={busy} />
        </>
      )}
      {step === "remove" && (
        <>
          <p className="text-sm text-muted-foreground">{bn ? "এই পার্টনারের সাথে সংযোগ ও চ্যাট এক্সেস স্থায়ীভাবে বন্ধ হবে।" : "This permanently ends access and the chat link with this partner."}</p>
          <ConfirmButtons danger cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "সরান" : "Remove"} onCancel={onClose} onOk={remove} busy={busy} />
        </>
      )}
      {step === "done" && <Credentials id={loginId} token={token} onClose={onClose} />}
    </Modal>
  );
}

function Credentials({ id, token, onClose }: { id: string; token: string; onClose: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  useEffect(() => { if (id && token) localStorage.setItem(`fp-ptoken-${id}`, token); }, [id, token]);
  return (
    <div className="space-y-2 text-sm">
      <div className="mx-auto w-fit rounded-xl bg-white p-2"><QRCodeSVG value={`fixedpair-login:${id}:${token}`} size={150} /></div>
      <p>ID: <b>{id}</b></p>
      <p className="break-all rounded-xl bg-muted p-2 font-mono text-xs">Token: {token}</p>
      <button
        onClick={() => { navigator.clipboard?.writeText(`ID: ${id}\nToken: ${token}`); toast.success(bn ? "কপি হয়েছে" : "Copied"); }}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 font-bold text-primary-foreground"
      ><Copy className="h-4 w-4" /> {bn ? "আইডি + টোকেন কপি" : "Copy ID + token"}</button>
      <button onClick={onClose} className="w-full py-1 text-sm font-bold text-muted-foreground">{bn ? "বন্ধ করুন" : "Close"}</button>
    </div>
  );
}

/* ---------------- Activity log (full page) ---------------- */
function ActivityLog({ ownerId, onBack }: { ownerId: string; onBack: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const pairs = useQuery({ queryKey: ["pairs", ownerId], queryFn: () => fetchPairs(ownerId) });
  const act = useQuery({ queryKey: ["partner-activity", ownerId], queryFn: () => getPartnerActivity() });
  const sos = useQuery({
    queryKey: ["sos-log", ownerId],
    queryFn: async () => (await supabase.from("device_reports").select("id, partner_id, created_at").eq("kind", "sos").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString(bn ? "bn-BD" : "en-GB") : "—");
  const name = (pid: string) => pairs.data?.find((p) => p.partner_id === pid)?.other.display_name ?? "?";
  return (
    <SubBack onBack={onBack}>
      <Page title={bn ? "অ্যাক্টিভিটি লগ" : "Activity log"} onBack={onBack}>
        <SectionLabel>{bn ? "শেষ লগইন" : "Last sign-in"}</SectionLabel>
        <Card>
          {act.data?.map((a) => (
            <div key={a.partnerId} className="border-b border-border px-4 py-3 last:border-0">
              <p className="font-semibold">{name(a.partnerId)} <span className="text-xs font-normal text-muted-foreground">({a.loginId})</span></p>
              <p className="text-xs text-muted-foreground">{bn ? "শেষ লগইন" : "Last sign-in"}: {fmt(a.lastSignIn)} · {bn ? "তৈরি" : "Created"}: {fmt(a.createdAt)}</p>
            </div>
          ))}
          {act.isLoading && <p className="p-5 text-center text-sm text-muted-foreground">…</p>}
          {act.data?.length === 0 && <p className="p-5 text-center text-sm text-muted-foreground">{bn ? "কোনো পার্টনার নেই" : "No partners"}</p>}
        </Card>
        <SectionLabel>SOS</SectionLabel>
        <Card>
          {sos.data?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <Siren className="h-5 w-5 text-destructive" />
              <p className="flex-1 text-sm font-semibold">{name(r.partner_id)}</p>
              <p className="text-xs text-muted-foreground">{fmt(r.created_at)}</p>
            </div>
          ))}
          {sos.data?.length === 0 && <p className="p-5 text-center text-sm text-muted-foreground">{bn ? "কোনো SOS আসেনি" : "No SOS alerts"}</p>}
        </Card>
      </Page>
    </SubBack>
  );
}

/* ---------------- Small windows ---------------- */
function AddPartner({ onClose }: { onClose: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const { busy, run } = useBusy();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ partnerId: string; token: string } | null>(null);
  const submit = () => run(async () => {
    try {
      const r = await createPartner({ data: name.trim() ? { partnerId: id, name: name.trim() } : { partnerId: id } });
      setMade({ partnerId: r.partnerId, token: r.token });
      qc.invalidateQueries({ queryKey: ["pairs"] });
      qc.invalidateQueries({ queryKey: ["partner-activity"] });
    } catch (e) { toast.error(errMsg(e)); }
  });
  return (
    <Modal title={made ? (bn ? "পার্টনার তৈরি হয়েছে — সংরক্ষণ করুন" : "Partner created — save these") : bn ? "নতুন পার্টনার" : "New partner"} onClose={onClose}>
      {made ? (
        <Credentials id={made.partnerId} token={made.token} onClose={onClose} />
      ) : (
        <div className="space-y-3">
          <input autoFocus value={id} maxLength={32} autoCapitalize="none" onChange={(e) => setId(e.target.value)} placeholder={bn ? "পার্টনার আইডি (৩-৩২ অক্ষর/সংখ্যা)" : "Partner ID (3-32 letters/numbers)"} className={inputCls} />
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={bn ? "নাম (ঐচ্ছিক)" : "Name (optional)"} className={inputCls} />
          <ConfirmButtons cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "তৈরি করুন" : "Create"} onCancel={onClose} onOk={submit} busy={busy || id.trim().length < 3} />
        </div>
      )}
    </Modal>
  );
}

function Lockout({ pairs, onClose, onFreeze }: { pairs: PairRow[]; onClose: () => void; onFreeze: () => Promise<void> }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const { busy, run } = useBusy();
  const go = () => run(async () => {
    try {
      await onFreeze();
      await Promise.all(pairs.map((p) => supabase.rpc("revoke_partner_sessions", { _partner: p.partner_id })));
      qc.invalidateQueries({ queryKey: ["pairs"] });
      toast.success(bn ? "সব চ্যাট ফ্রিজ ও সব পার্টনার লগআউট" : "All chats frozen and partners signed out");
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  });
  return (
    <Modal title={bn ? "ইমার্জেন্সি লকআউট" : "Emergency lockout"} onClose={onClose}>
      <p className="text-sm text-muted-foreground">{bn ? "সব চ্যাট ফ্রিজ হবে এবং সব পার্টনার এখনই লগআউট হবে। পরে সেটআপ থেকে 'সব চ্যাট ফ্রিজ' বন্ধ করলে আবার চালু হবে।" : "Freezes every chat and signs all partners out right now. Turn off “Freeze all chats” later to resume."}</p>
      <ConfirmButtons danger cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "লকআউট" : "Lock out"} onCancel={onClose} onOk={go} busy={busy} />
    </Modal>
  );
}

function Broadcast({ pairs, ownerId, onClose }: { pairs: PairRow[]; ownerId: string; onClose: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const { busy, run } = useBusy();
  const [text, setText] = useState("");
  const send = () => run(async () => {
    const body = `📢 ${text.trim()}`;
    const results = await Promise.all(pairs.map((p) => supabase.from("messages").insert({ pair_id: p.id, sender_id: ownerId, body })));
    const bad = results.find((r) => r.error);
    if (bad?.error) { toast.error(bad.error.message); return; }
    pairs.forEach((p) => qc.invalidateQueries({ queryKey: ["messages", p.id] }));
    toast.success(bn ? `${pairs.length} জনকে পাঠানো হয়েছে` : `Sent to ${pairs.length} partner(s)`);
    onClose();
  });
  return (
    <Modal title={bn ? "সবাইকে নোটিশ" : "Broadcast notice"} onClose={onClose}>
      {pairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{bn ? "আগে একজন পার্টনার যোগ করুন।" : "Add a partner first."}</p>
      ) : (
        <>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={500} placeholder={bn ? "সব পার্টনারের চ্যাটে যাবে…" : "Goes to every partner's chat…"} className={inputCls} />
          <ConfirmButtons cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "পাঠান" : "Send"} onCancel={onClose} onOk={send} busy={busy || !text.trim()} />
        </>
      )}
    </Modal>
  );
}

function CleanMedia({ pairs, onClose }: { pairs: PairRow[]; onClose: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const { busy, run } = useBusy();
  const [days, setDays] = useState(30);
  const go = () => run(async () => {
    const ids = pairs.map((p) => p.id);
    if (!ids.length) { onClose(); return; }
    const before = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await supabase.from("messages").select("id, file_path").in("pair_id", ids).not("file_path", "is", null).lt("created_at", before);
    if (error) { toast.error(error.message); return; }
    const rows = data ?? [];
    if (!rows.length) { toast(bn ? "মোছার মতো পুরনো ফাইল নেই" : "No old files to clean"); onClose(); return; }
    const { error: de } = await supabase.from("messages").delete().in("id", rows.map((r) => r.id));
    if (de) { toast.error(de.message); return; }
    await supabase.storage.from("fixedpair-files").remove(rows.map((r) => r.file_path!).filter(Boolean));
    ids.forEach((id) => qc.invalidateQueries({ queryKey: ["messages", id] }));
    toast.success(bn ? `${rows.length}টি ফাইল মোছা হয়েছে` : `${rows.length} file(s) removed`);
    onClose();
  });
  return (
    <Modal title={bn ? "পুরনো মিডিয়া মুছুন" : "Clean old media"} onClose={onClose}>
      <p className="text-sm text-muted-foreground">{bn ? "এর চেয়ে পুরনো ছবি/ফাইল সব চ্যাট থেকে চিরতরে মুছে যাবে।" : "Photos and files older than this are deleted from every chat for good."}</p>
      <div className="-mx-4">
        <Chips label={bn ? "কত দিনের পুরনো" : "Older than"} value={days} options={[7, 30, 90].map((d) => ({ v: d, text: bn ? `${d} দিন` : `${d} days` }))} onChange={setDays} />
      </div>
      <ConfirmButtons danger cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "মুছুন" : "Delete"} onCancel={onClose} onOk={go} busy={busy} />
    </Modal>
  );
}

/** Asks for the admin PIN, verifies it, then hands back the stored token. */
function usePinCheck(email: string) {
  const { lang } = useT();
  const bn = lang === "bn";
  return async (pin: string): Promise<string | null> => {
    const tok = localStorage.getItem("fp-owner-token");
    if (!tok) { toast.error(bn ? "এই ডিভাইসে টোকেন সংরক্ষিত নেই। একবার লগআউট করে আবার লগইন করুন।" : "Token not stored on this device. Sign out and sign in again once."); return null; }
    const { error } = await supabase.auth.signInWithPassword({ email, password: await ownerSecret(tok, pin) });
    if (error) { toast.error(bn ? "পিন ভুল" : "Wrong PIN"); return null; }
    return tok;
  };
}

export function PinDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const check = usePinCheck(email);
  const { busy, run } = useBusy();
  const [oldPin, setOld] = useState("");
  const [newPin, setNew] = useState("");
  const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, ""));
  const go = () => run(async () => {
    const tok = await check(oldPin);
    if (!tok) return;
    const { error } = await supabase.auth.updateUser({ password: await ownerSecret(tok, newPin) });
    if (error) { toast.error(error.message); return; }
    toast.success(bn ? "পিন বদলানো হয়েছে" : "PIN changed");
    onClose();
  });
  return (
    <Modal title={bn ? "এডমিন পিন বদলান" : "Change admin PIN"} onClose={onClose}>
      <div className="space-y-3">
        <input autoFocus type="password" inputMode="numeric" maxLength={6} value={oldPin} onChange={digits(setOld)} placeholder={bn ? "বর্তমান পিন" : "Current PIN"} className={inputCls} />
        <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={digits(setNew)} placeholder={bn ? "নতুন পিন (৪-৬ সংখ্যা)" : "New PIN (4-6 digits)"} className={inputCls} />
      </div>
      <ConfirmButtons cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "বদলান" : "Change"} onCancel={onClose} onOk={go} busy={busy || oldPin.length < 4 || newPin.length < 4 || oldPin === newPin} />
    </Modal>
  );
}

/* ---------------- Export ---------------- */
async function exportAll(pairs: PairRow[], bn: boolean) {
  if (!pairs.length) { toast(bn ? "ব্যাকআপ নেওয়ার মতো কোনো চ্যাট নেই" : "No chats to back up"); return; }
  const { data, error } = await supabase
    .from("messages")
    .select("pair_id, sender_id, body, file_name, kind, created_at")
    .in("pair_id", pairs.map((p) => p.id))
    .order("created_at", { ascending: true });
  if (error) { toast.error(error.message); return; }
  const out = pairs.map((p) => ({
    partner: p.other.display_name,
    messages: (data ?? []).filter((m) => m.pair_id === p.id).map((m) => ({ at: m.created_at, from: m.sender_id === p.partner_id ? p.other.display_name : "admin", text: m.body, file: m.file_name, kind: m.kind })),
  }));
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `fixedpair-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast.success(bn ? "ব্যাকআপ ডাউনলোড হচ্ছে" : "Backup downloading");
}

function CustomTimer({ current, onClose, onSave }: { current: number; onClose: () => void; onSave: (sec: number) => Promise<void> }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const { busy, run } = useBusy();
  const init = current > 0 && !PRESETS.includes(current) ? current : 7200;
  const unit0 = init % 86400 === 0 ? 86400 : init % 3600 === 0 ? 3600 : 60;
  const [unit, setUnit] = useState(unit0);
  const [num, setNum] = useState(String(init / unit0));
  const sec = Math.floor(Number(num) * unit);
  const valid = Number.isFinite(sec) && sec >= 60 && sec <= 365 * 86400;
  return (
    <Modal title={bn ? "কাস্টম টাইমার" : "Custom timer"} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">{bn ? "মেসেজ পাঠানোর এই সময় পরে নিজে থেকে মুছে যাবে (ন্যূনতম ১ মিনিট, সর্বোচ্চ ৩৬৫ দিন)।" : "Messages vanish this long after sending (1 minute to 365 days)."}</p>
      <div className="flex gap-3">
        <input autoFocus type="number" inputMode="numeric" min={1} value={num} onChange={(e) => setNum(e.target.value)} className={inputCls} />
        <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} className={inputCls}>
          <option value={60}>{bn ? "মিনিট" : "Minutes"}</option>
          <option value={3600}>{bn ? "ঘণ্টা" : "Hours"}</option>
          <option value={86400}>{bn ? "দিন" : "Days"}</option>
        </select>
      </div>
      <ConfirmButtons cancel={bn ? "বাতিল" : "Cancel"} ok={bn ? "সংরক্ষণ" : "Save"} onCancel={onClose} onOk={() => run(() => onSave(sec))} busy={busy || !valid} />
    </Modal>
  );
}
