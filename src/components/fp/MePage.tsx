import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowLeftRight, Bell, BadgeCheck, Check, ChevronRight, Copy, Folder, Globe, IdCard, Image as ImageIcon,
  Lock, LogOut, Moon, MoreHorizontal, Music, Pencil, Plus, QrCode, Settings, Share2, Shield, Sun, User, UserCircle, UserCog, X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs, isOnline, presenceOf, shortTime } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { FpAvatar } from "@/components/fp/Avatar";
import { PartnerSetup, PinDialog } from "@/components/fp/PartnerSetup";
import { useBackClose } from "@/components/fp/PrivacyShield";
import { idToEmail, ownerSecret } from "@/lib/login";
import { createAdmin } from "@/lib/login.functions";

type Me = Awaited<ReturnType<typeof fetchMe>>;
type Sub = null | "view" | "edit" | "visitors" | "switch" | "security" | "settings" | "partners" | "files";

/* ---------- theme ---------- */
export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("fp-theme", dark ? "dark" : "light");
}
export function useThemeInit() {
  useEffect(() => applyTheme(localStorage.getItem("fp-theme") === "dark"), []);
}

/* ---------- helpers ---------- */
async function cropTo(file: File, w: number, h: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const r = w / h;
  let sw = img.width, sh = img.width / r;
  if (sh > img.height) { sh = img.height; sw = img.height * r; }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}
function useSigned(path?: string | null) {
  return useQuery({
    queryKey: ["signed", path], enabled: !!path, staleTime: 50 * 60_000,
    queryFn: async () => (await supabase.storage.from("fixedpair-profile").createSignedUrl(path!, 3600)).data?.signedUrl ?? null,
  });
}
function useUpload(me: Me) {
  const qc = useQueryClient();
  const { t, lang } = useT();
  return async (kind: "avatar" | "cover", file?: File) => {
    if (!file) return;
    const { cropWithEditor } = await import("@/components/fp/CropEditor");
    const edited = kind === "avatar" ? await cropWithEditor(file, 512, 512, lang === "bn") : await cropWithEditor(file, 1200, 600, lang === "bn");
    if (!edited) return;
    const blob = edited ?? (await cropTo(file, 512, 512));
    const path = `${me.id}/${kind}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("fixedpair-profile").upload(path, blob, { contentType: "image/jpeg" });
    if (error) { toast.error(error.message); return; }
    const old = kind === "avatar" ? me.profile?.avatar_url : me.profile?.cover_url;
    await supabase.from("profiles").update(kind === "avatar" ? { avatar_url: path } : { cover_url: path }).eq("id", me.id);
    if (old) supabase.storage.from("fixedpair-profile").remove([old]);
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["me"] });
  };
}
function Avatar({ me, size }: { me: Me; size: number }) {
  const a = useSigned(me.profile?.avatar_url);
  return a.data ? (
    <img src={a.data} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" />
  ) : (
    <FpAvatar name={me.profile?.display_name || me.email || "?"} size={size} />
  );
}
function Page({ title, onBack, close, right, children }: { title: string; onBack: () => void; close?: boolean; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-muted animate-in slide-in-from-right duration-200">
      <header className="flex h-14 shrink-0 items-center gap-1 bg-background px-2">
        <button aria-label="Back" onClick={onBack} className="rounded-full p-2">
          {close ? <X className="h-[22px] w-[22px]" /> : <ArrowLeft className="h-[22px] w-[22px]" />}
        </button>
        <p className="flex-1 text-ui font-bold">{title}</p>
        {right}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">{children}</div>
    </div>
  );
}
function Card({ children }: { children: ReactNode }) {
  return <div className="mx-3 mt-3 overflow-hidden rounded-2xl bg-background">{children}</div>;
}
function Row({ icon: I, color = "text-primary", label, value, onClick, danger }: { icon: typeof User; color?: string; label: string; value?: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left last:border-0 active:bg-muted">
      <I className={`h-[21px] w-[21px] shrink-0 ${danger ? "text-destructive" : color}`} />
      <span className={`flex-1 text-ui ${danger ? "font-semibold text-destructive" : ""}`}>{label}</span>
      {value && <span className="flex items-center text-ui text-muted-foreground">{value}</span>}
      {!danger && onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block h-6 w-10 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}
function useLocalFlag(key: string): [boolean, () => void] {
  const [v, setV] = useState(false);
  useEffect(() => setV(localStorage.getItem(key) === "1"), [key]);
  return [v, () => { const n = !v; setV(n); localStorage.setItem(key, n ? "1" : "0"); }];
}

/* ---------- Me main panel ---------- */
export function MePage({ me, onClose }: { me: Me; onClose: () => void }) {
  const { t, lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sub, setSub] = useState<Sub>(null);
  const [qr, setQr] = useState(false);
  const [logout, setLogout] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useBackClose(qr, () => setQr(false));
  useBackClose(logout, () => setLogout(false));
  const isOwner = me.role === "owner";
  const p = me.profile;
  const unseen = useQuery({
    queryKey: ["visitors-unseen", me.id], enabled: isOwner, refetchInterval: 60_000,
    queryFn: async () => (await supabase.from("profile_views").select("id", { count: "exact", head: true }).eq("owner_id", me.id).eq("seen", false)).count ?? 0,
  });


  async function doLogout() {
    await qc.cancelQueries(); qc.clear();
    localStorage.removeItem("fp-owner-token");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-muted">
      <header className="flex h-14 shrink-0 items-center bg-background px-2">
        <button aria-label="Close" onClick={onClose} className="rounded-full p-2"><X className="h-[22px] w-[22px]" /></button>
        <p className="flex-1 pl-1 text-ui font-extrabold">{bn ? "আমি" : "Me"}</p>
        <button aria-label="Dark mode" onClick={() => { applyTheme(!dark); setDark(!dark); }} className="rounded-full p-2">
          {dark ? <Sun className="h-[21px] w-[21px]" /> : <Moon className="h-[21px] w-[21px]" />}
        </button>
        <button aria-label="QR code" onClick={() => setQr(true)} className="rounded-full p-2"><QrCode className="h-[21px] w-[21px]" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <Card>
          <button onClick={() => setSub("view")} className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-muted">
            <Avatar me={me} size={56} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-ui font-bold">
                {p?.display_name} {isOwner && <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />}
              </p>
              <p className="truncate text-ui text-muted-foreground">ID: {p?.pair_code}</p>
              <p className="text-ui text-muted-foreground">{isOwner ? (bn ? "এডমিন" : "Admin") : bn ? "পার্টনার" : "Partner"}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </Card>
        <Card>
          {isOwner && <Row icon={ArrowLeftRight} label={bn ? "অ্যাকাউন্ট পরিবর্তন" : "Switch Account"} onClick={() => setSub("switch")} />}
          <Row icon={Shield} label={bn ? "নিরাপত্তা ও গোপনীয়তা" : "Security & Privacy"} onClick={() => setSub("security")} />
          <Row icon={Settings} label={bn ? "সেটিংস" : "Settings"} onClick={() => setSub("settings")} />
          {isOwner && <Row icon={UserCog} label={bn ? "পার্টনার সেটআপ" : "Partner Setup"} onClick={() => setSub("partners")} />}
        </Card>
        <Card>
          <Row icon={Folder} color="text-amber-500" label={bn ? "আমার ফাইল" : "My Files"} onClick={() => setSub("files")} />
        </Card>
        {isOwner && (
          <Card>
            <Row icon={LogOut} danger label={t("logout")} onClick={() => setLogout(true)} />
          </Card>
        )}
      </div>

      {sub === "view" && <ProfileView me={me} unseen={unseen.data ?? 0} onBack={() => setSub(null)} onEdit={() => setSub("edit")} onBell={() => setSub("visitors")} />}
      {sub === "edit" && <EditProfile me={me} onBack={() => setSub("view")} onPrivacy={() => setSub("security")} />}
      {sub === "visitors" && <Visitors me={me} onBack={() => setSub("view")} />}
      {sub === "switch" && <SwitchAccount me={me} onBack={() => setSub(null)} />}
      {sub === "security" && <Security me={me} onBack={() => setSub(null)} />}
      {sub === "settings" && <SettingsPage onBack={() => setSub(null)} dark={dark} setDark={(v) => { applyTheme(v); setDark(v); }} />}
      {sub === "partners" && <PartnerSetup ownerId={me.id} onBack={() => setSub(null)} />}
      {sub === "files" && <MyFiles me={me} onBack={() => setSub(null)} />}

      {qr && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-6" onClick={() => setQr(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-background p-6 text-center animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 font-extrabold">{p?.display_name}</p>
            <div className="mx-auto w-fit rounded-xl bg-white p-2"><QRCodeSVG value={`fixedpair:${p?.pair_code}`} size={200} /></div>
            <p className="mt-4 text-ui text-muted-foreground">{bn ? "পেয়ার কোড" : "Pair code"}: <b className="text-foreground">{p?.pair_code}</b></p>
            <button onClick={() => { navigator.clipboard?.writeText(p?.pair_code ?? ""); toast(bn ? "কপি হয়েছে" : "Copied"); }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-ui font-bold text-primary-foreground"><Copy className="h-4 w-4" /> {bn ? "কপি" : "Copy"}</button>
          </div>
        </div>
      )}
      {logout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-8" onClick={() => setLogout(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-background p-5 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <p className="text-ui font-bold">{bn ? "লগ আউট করবেন?" : "Log out?"}</p>
            <p className="mt-1 text-ui text-muted-foreground">{bn ? "আবার ঢুকতে আইডি ও টোকেন লাগবে।" : "You will need your ID and token to sign in again."}</p>
            <div className="mt-5 flex justify-end gap-4 text-ui font-bold">
              <button onClick={() => setLogout(false)} className="text-muted-foreground">{bn ? "বাতিল" : "Cancel"}</button>
              <button onClick={doLogout} className="text-destructive">{t("logout")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function SubBack({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  useBackClose(true, onBack);
  return <>{children}</>;
}

/* ---------- Profile view ---------- */
function ProfileView({ me, unseen, onBack, onEdit, onBell }: { me: Me; unseen: number; onBack: () => void; onEdit: () => void; onBell: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  useBackClose(true, onBack);
  const p = me.profile;
  const cover = useSigned(p?.cover_url);
  const upload = useUpload(me);
  const isOwner = me.role === "owner";
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-muted animate-in slide-in-from-right duration-200">
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="relative h-56 bg-gradient-to-br from-primary to-accent">
          {cover.data && <img src={cover.data} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/40 via-transparent to-transparent" />
          <button aria-label="Back" onClick={onBack} className="absolute left-2 top-2 rounded-full p-2 text-primary-foreground"><ArrowLeft className="h-[22px] w-[22px]" /></button>
          {isOwner && (
            <button aria-label="Visitors" onClick={onBell} className="absolute right-2 top-2 rounded-full p-2 text-primary-foreground">
              <Bell className="h-[22px] w-[22px]" />
              {unseen > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-destructive px-1 text-ui font-bold leading-4 text-destructive-foreground">{unseen}</span>}
            </button>
          )}
        </div>
        <div className="relative -mt-6 rounded-t-3xl bg-muted px-3 pt-14">
          <label className="absolute -top-12 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border-[3px] border-background" aria-label="Change photo">
            <Avatar me={me} size={92} />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => upload("avatar", e.target.files?.[0])} />
          </label>
          <button onClick={onEdit} className="mx-auto flex items-center gap-1.5 text-ui font-extrabold">
            {p?.display_name} <Pencil className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="mt-4 overflow-hidden rounded-2xl bg-background">
            <button onClick={() => { navigator.clipboard?.writeText(p?.pair_code ?? ""); toast(bn ? "কপি হয়েছে" : "Copied"); }} className="flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left">
              <User className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-ui">DUOX ID: {p?.pair_code}</span>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Music className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-ui text-muted-foreground">{p?.bio || (bn ? "কোনো স্ট্যাটাস নেই" : "No status yet")}</span>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl bg-background">
            <Row icon={ImageIcon} label={bn ? "স্টোরি অ্যালবাম" : "Story Albums"} onClick={() => toast(bn ? "আপনার স্টোরি চ্যাট পেজের ওপরে দেখা যাবে" : "Your stories show at the top of Chats")} />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-3 bg-muted p-3">
        <button
          onClick={async () => {
            const text = `DUOX ID: ${p?.pair_code}`;
            if (navigator.share) navigator.share({ text }).catch(() => {});
            else { navigator.clipboard?.writeText(text); toast(bn ? "কপি হয়েছে" : "Copied"); }
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-background py-3 font-bold"
        ><Share2 className="h-4 w-4" /> {bn ? "শেয়ার" : "Share"}</button>
        <button onClick={onEdit} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 font-bold text-primary-foreground"><Pencil className="h-4 w-4" /> {bn ? "এডিট" : "Edit"}</button>
      </div>
    </div>
  );
}

/* ---------- Edit profile ---------- */
function EditProfile({ me, onBack, onPrivacy }: { me: Me; onBack: () => void; onPrivacy: () => void }) {
  const { t, lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  useBackClose(true, onBack);
  const p = me.profile;
  const cover = useSigned(p?.cover_url);
  const upload = useUpload(me);
  const [field, setField] = useState<null | "name" | "bio">(null);
  const [val, setVal] = useState("");
  async function save() {
    const v = val.trim();
    if (field === "name" && !v) { toast.error(bn ? "নাম দিন" : "Enter a name"); return; }
    const { error } = await supabase.from("profiles").update(field === "name" ? { display_name: v.slice(0, 40) } : { bio: v.slice(0, 140) || null }).eq("id", me.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["me"] });
    setField(null);
  }
  const pick = (kind: "avatar" | "cover") => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = "image/*";
    i.onchange = () => upload(kind, i.files?.[0]);
    i.click();
  };
  return (
    <Page title={bn ? "প্রোফাইল এডিট" : "Edit Profile"} onBack={onBack}>
      <Card>
        <Row icon={UserCircle} label={bn ? "অবতার" : "Avatar"} value={<Avatar me={me} size={32} />} onClick={() => pick("avatar")} />
        <Row icon={IdCard} label={bn ? "নাম" : "Username"} value={<span className="max-w-[140px] truncate">{p?.display_name}</span>} onClick={() => { setVal(p?.display_name ?? ""); setField("name"); }} />
        <Row icon={IdCard} label="DUOX ID" value={p?.pair_code} onClick={() => { navigator.clipboard?.writeText(p?.pair_code ?? ""); toast(bn ? "কপি হয়েছে" : "Copied"); }} />
      </Card>
      <Card>
        <Row icon={ImageIcon} label={bn ? "ব্যাকগ্রাউন্ড" : "Background"} value={cover.data ? <img src={cover.data} alt="" className="h-8 w-12 rounded object-cover" /> : <span className="h-8 w-12 rounded bg-gradient-to-br from-primary to-accent" />} onClick={() => pick("cover")} />
        <Row icon={Music} label={bn ? "স্ট্যাটাস / বায়ো" : "Status / Bio"} value={<span className="max-w-[140px] truncate">{p?.bio}</span>} onClick={() => { setVal(p?.bio ?? ""); setField("bio"); }} />
      </Card>
      <Card>
        <Row icon={Lock} label={bn ? "প্রাইভেসি সেটিং" : "Privacy Setting"} onClick={onPrivacy} />
      </Card>
      {field && (
        <div className="fixed inset-0 z-[60] flex items-end bg-foreground/50" onClick={() => setField(null)}>
          <div className="mx-auto w-full max-w-md rounded-t-2xl bg-background p-5 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">{field === "name" ? (bn ? "নাম পরিবর্তন" : "Change name") : bn ? "স্ট্যাটাস লিখুন" : "Write status"}</p>
            <input autoFocus value={val} maxLength={field === "name" ? 40 : 140} onChange={(e) => setVal(e.target.value)} className="mt-3 w-full border-b-2 border-primary bg-transparent py-2 text-ui outline-none" />
            <p className="mt-1 text-right text-ui text-muted-foreground">{val.length}/{field === "name" ? 40 : 140}</p>
            <div className="mt-3 flex justify-end gap-5 text-ui font-bold">
              <button onClick={() => setField(null)} className="text-muted-foreground">{bn ? "বাতিল" : "Cancel"}</button>
              <button onClick={save} className="text-primary">{t("save")}</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ---------- Visitors ---------- */
function Visitors({ me, onBack }: { me: Me; onBack: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  useBackClose(true, onBack);
  const q = useQuery({
    queryKey: ["visitors", me.id],
    queryFn: async () => {
      const { data } = await supabase.from("profile_views").select("viewer_id, viewed_at").eq("owner_id", me.id).order("viewed_at", { ascending: false }).limit(500);
      const ids = [...new Set((data ?? []).map((r) => r.viewer_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
      return ids.map((id) => {
        const rows = (data ?? []).filter((r) => r.viewer_id === id);
        return { id, name: profs?.find((x) => x.id === id)?.display_name ?? "?", last: rows[0]?.viewed_at ?? "", count: rows.length };
      });
    },
  });
  useEffect(() => {
    supabase.from("profile_views").update({ seen: true }).eq("owner_id", me.id).eq("seen", false).then(() => qc.invalidateQueries({ queryKey: ["visitors-unseen"] }));
  }, [me.id, qc]);
  return (
    <Page title={bn ? "প্রোফাইল ভিজিটর" : "Profile Visitors"} onBack={onBack}>
      {q.data?.length === 0 && (
        <div className="flex flex-col items-center p-12 text-center">
          <div className="rounded-full bg-accent p-5"><Bell className="h-8 w-8 text-primary" /></div>
          <p className="mt-4 font-bold">{bn ? "এখনও কেউ আপনার প্রোফাইল দেখেনি" : "No profile visitors yet"}</p>
        </div>
      )}
      {!!q.data?.length && (
        <Card>
          {q.data.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <FpAvatar name={v.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{v.name}</p>
                <p className="text-ui text-muted-foreground">{shortTime(v.last, lang)} · {bn ? `${v.count} বার দেখেছেন` : `Viewed ${v.count}×`}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

/* ---------- Switch account (admins only) ---------- */
type Saved = { id: string; token: string; name: string };
const KEY = "fp-admin-accounts";
const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const storeSaved = (a: Saved[]) => localStorage.setItem(KEY, JSON.stringify(a));

function SwitchAccount({ me, onBack }: { me: Me; onBack: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  useBackClose(true, onBack);
  const myId = (me.email ?? "").split("@")[0] ?? "";
  const [list, setList] = useState<Saved[]>([]);
  const [pinFor, setPinFor] = useState<Saved | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [add, setAdd] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ mode: "new" as "new" | "existing", id: "", name: "", token: "", pin: "" });
  const [made, setMade] = useState<{ id: string; token: string; rc: string } | null>(null);
  useEffect(() => setList(loadSaved()), []);
  const save = (a: Saved[]) => { setList(a); storeSaved(a); };
  const all = [{ id: myId, token: "", name: me.profile?.display_name ?? myId }, ...list.filter((a) => a.id !== myId)];

  async function signIn(a: Saved, p: string) {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: idToEmail(a.id), password: await ownerSecret(a.token, p) });
    setBusy(false);
    if (error) { toast.error(bn ? "পিন বা টোকেন ভুল" : "Wrong PIN or token"); return false; }
    window.location.href = "/home";
    return true;
  }
  async function submitAdd() {
    setBusy(true);
    try {
      if (form.mode === "new") {
        const r = await createAdmin({ data: { adminId: form.id, pin: form.pin, name: form.name } });
        save([...list, { id: r.adminId, token: r.token, name: form.name || r.adminId }]);
        setMade({ id: r.adminId, token: r.token, rc: r.recoveryCode });
      } else {
        const a = { id: form.id.trim().toLowerCase(), token: form.token.trim(), name: form.name || form.id };
        save([...list.filter((x) => x.id !== a.id), a]);
        toast.success(bn ? "অ্যাকাউন্ট যোগ হয়েছে" : "Account added");
      }
      setAdd(false);
      setForm({ mode: "new", id: "", name: "", token: "", pin: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-background animate-in slide-in-from-bottom duration-200">
      <header className="flex h-14 items-center px-2"><button aria-label="Close" onClick={onBack} className="rounded-full p-2"><X className="h-[22px] w-[22px]" /></button></header>
      <div className="flex flex-col items-center pb-6 pt-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary"><ArrowLeftRight className="h-8 w-8 text-primary-foreground" /></div>
        <p className="mt-3 text-ui font-extrabold">{bn ? "অ্যাকাউন্ট পরিবর্তন" : "Switch Account"}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {all.map((a) => {
          const current = a.id === myId;
          return (
            <div key={a.id} className="relative flex items-center gap-3 px-5 py-3 active:bg-muted">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => !current && (setPin(""), setPinFor(a))}>
                {current ? <Avatar me={me} size={48} /> : <FpAvatar name={a.name} size={48} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{current ? me.profile?.display_name : a.name}</p>
                  <p className="truncate text-ui text-muted-foreground">{bn ? "এডমিন" : "Admin"} • {a.id}</p>
                </div>
              </button>
              {current && <Check className="h-5 w-5 text-primary" />}
              {!current && <button aria-label="More" onClick={() => setMenu(menu === a.id ? null : a.id)} className="rounded-full p-1.5 text-muted-foreground"><MoreHorizontal className="h-5 w-5" /></button>}
              {menu === a.id && (
                <div className="absolute right-5 top-12 z-10 w-36 rounded-xl border border-border bg-background py-1 shadow-xl">
                  <button onClick={() => { const n = prompt(bn ? "নতুন নাম" : "New name", a.name); if (n) save(list.map((x) => (x.id === a.id ? { ...x, name: n } : x))); setMenu(null); }} className="block w-full px-4 py-2 text-left text-ui">{bn ? "নাম বদলান" : "Rename"}</button>
                  <button onClick={() => { save(list.filter((x) => x.id !== a.id)); setMenu(null); }} className="block w-full px-4 py-2 text-left text-ui text-destructive">{bn ? "সরান" : "Remove"}</button>
                </div>
              )}
            </div>
          );
        })}
        <div className="mx-5 my-1 border-t border-border" />
        <button onClick={() => setAdd(true)} className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-muted">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-border"><Plus className="h-5 w-5 text-muted-foreground" /></span>
          <span className="font-bold">{bn ? "অ্যাকাউন্ট যোগ করুন" : "Add Account"}</span>
        </button>
      </div>

      {pinFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-8" onClick={() => setPinFor(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">{pinFor.name}</p>
            <p className="text-ui text-muted-foreground">{bn ? "এই অ্যাকাউন্টের পিন দিন" : "Enter this account's PIN"}</p>
            <input autoFocus inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-center text-ui tracking-[0.5em] outline-none focus:border-primary" />
            <button disabled={busy || pin.length < 4} onClick={() => signIn(pinFor, pin)} className="mt-4 w-full rounded-full bg-primary py-2.5 font-bold text-primary-foreground disabled:opacity-50">{bn ? "সুইচ করুন" : "Switch"}</button>
          </div>
        </div>
      )}
      {add && (
        <div className="fixed inset-0 z-[60] flex items-end bg-foreground/50" onClick={() => setAdd(false)}>
          <div className="mx-auto w-full max-w-md space-y-3 rounded-t-2xl bg-background p-5 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex rounded-full bg-muted p-1 text-ui font-bold">
              {(["new", "existing"] as const).map((m) => (
                <button key={m} onClick={() => setForm({ ...form, mode: m })} className={`flex-1 rounded-full py-2 ${form.mode === m ? "bg-background shadow" : "text-muted-foreground"}`}>
                  {m === "new" ? (bn ? "নতুন এডমিন" : "New admin") : bn ? "আগের এডমিন" : "Existing admin"}
                </button>
              ))}
            </div>
            <input placeholder={bn ? "এডমিন আইডি" : "Admin ID"} value={form.id} autoCapitalize="none" onChange={(e) => setForm({ ...form, id: e.target.value })} className="w-full rounded-xl border border-input bg-background px-4 py-2.5 outline-none focus:border-primary" />
            <input placeholder={bn ? "নাম" : "Name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-input bg-background px-4 py-2.5 outline-none focus:border-primary" />
            {form.mode === "new" ? (
              <input placeholder={bn ? "পিন (৪-৬ সংখ্যা, আগেরটাও দিতে পারেন)" : "PIN (4-6 digits, can be the same)"} inputMode="numeric" type="password" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} className="w-full rounded-xl border border-input bg-background px-4 py-2.5 outline-none focus:border-primary" />
            ) : (
              <input placeholder={bn ? "টোকেন" : "Token"} value={form.token} autoCapitalize="none" onChange={(e) => setForm({ ...form, token: e.target.value })} className="w-full rounded-xl border border-input bg-background px-4 py-2.5 font-mono text-ui outline-none focus:border-primary" />
            )}
            <button disabled={busy || !form.id || (form.mode === "new" ? form.pin.length < 4 : !form.token)} onClick={submitAdd} className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{bn ? "যোগ করুন" : "Add"}</button>
          </div>
        </div>
      )}
      {made && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-6">
          <div className="w-full max-w-sm space-y-2 rounded-2xl bg-background p-5 text-ui">
            <p className="font-bold">{bn ? "নতুন এডমিন তৈরি হয়েছে — এগুলো সংরক্ষণ করুন" : "New admin created — save these"}</p>
            <p>ID: <b>{made.id}</b></p>
            <p className="break-all font-mono text-ui">Token: {made.token}</p>
            <p className="font-mono text-ui">Recovery: {made.rc}</p>
            <button onClick={() => { navigator.clipboard?.writeText(`ID: ${made.id}\nToken: ${made.token}\nRecovery: ${made.rc}`); toast("Copied"); setMade(null); }} className="w-full rounded-full bg-primary py-2.5 font-bold text-primary-foreground">{bn ? "কপি করে বন্ধ করুন" : "Copy & close"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Security & Privacy ---------- */
function Security({ onBack, me }: { onBack: () => void; me: Me }) {
  const { lang } = useT();
  const bn = lang === "bn";
  useBackClose(true, onBack);
  const [discreet, tDiscreet] = useLocalFlag("fp-discreet");
  const [lowData, tLowData] = useLocalFlag("fp-lowdata");
  const [noBlur, tBlur] = useLocalFlag("fp-no-blur");
  const isOwner = me.role === "owner";
  const [ask, setAsk] = useState(false);
  const [changePin, setChangePin] = useState(false);
  const [pin, setPin] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reveal() {
    const tok = localStorage.getItem("fp-owner-token");
    if (!tok) { toast.error(bn ? "এই ডিভাইসে টোকেন সংরক্ষিত নেই। একবার লগআউট করে আবার লগইন করুন।" : "Token not stored on this device. Sign out and sign in again once."); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: me.email ?? "", password: await ownerSecret(tok, pin) });
    setBusy(false);
    if (error) { toast.error(bn ? "পিন ভুল" : "Wrong PIN"); return; }
    setShown(tok); setAsk(false); setPin("");
  }
  return (
    <Page title={bn ? "নিরাপত্তা ও গোপনীয়তা" : "Security & Privacy"} onBack={onBack}>
      <Card>
        <Row icon={Lock} label={bn ? "অ্যাপ ছাড়লে স্ক্রিন ঝাপসা" : "Blur screen when leaving app"} value={<Toggle on={!noBlur} />} onClick={tBlur} />
        <Row icon={Bell} label={bn ? "গোপন নোটিফিকেশন (Notes)" : "Discreet notifications (Notes)"} value={<Toggle on={discreet} />} onClick={tDiscreet} />
        <Row icon={Bell} label={bn ? "লো-ডাটা মোড (ছবি ছোট করে পাঠানো)" : "Low-data mode (smaller photos)"} value={<Toggle on={lowData} />} onClick={tLowData} />
      </Card>
      <p className="mx-6 mt-2 text-ui text-muted-foreground">{bn ? "গোপন মোডে অ্যাপ বন্ধ থাকলে নাম 'Notes' দেখাবে।" : "In discreet mode the app shows as 'Notes' while hidden."}</p>
      {isOwner && (
        <Card>
          <Row icon={Shield} label={bn ? "এডমিন টোকেন দেখুন" : "Show Admin Token"} onClick={() => { setShown(null); setAsk(true); }} />
          <Row icon={Lock} label={bn ? "এডমিন পিন বদলান" : "Change Admin PIN"} onClick={() => setChangePin(true)} />
        </Card>
      )}
      {changePin && <PinDialog email={me.email ?? ""} onClose={() => setChangePin(false)} />}
      {(ask || shown) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-6" onClick={() => { setAsk(false); setShown(null); setPin(""); }}>
          <div className="w-full max-w-xs rounded-2xl bg-background p-5 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            {shown ? (
              <>
                <p className="font-bold">{bn ? "এডমিন টোকেন" : "Admin Token"}</p>
                <p className="mt-3 break-all rounded-xl bg-muted p-3 font-mono text-ui">{shown}</p>
                <button onClick={() => { navigator.clipboard?.writeText(shown); toast(bn ? "কপি হয়েছে" : "Copied"); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 font-bold text-primary-foreground"><Copy className="h-4 w-4" /> {bn ? "কপি" : "Copy"}</button>
              </>
            ) : (
              <>
                <p className="font-bold">{bn ? "এডমিন পিন দিন" : "Enter Admin PIN"}</p>
                <input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-center text-ui tracking-widest outline-none focus:border-primary" />
                <button disabled={busy || pin.length < 4} onClick={reveal} className="mt-4 w-full rounded-full bg-primary py-2.5 font-bold text-primary-foreground disabled:opacity-50">{bn ? "দেখুন" : "Show"}</button>
              </>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

/* ---------- Settings ---------- */
function SettingsPage({ onBack, dark, setDark }: { onBack: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const { lang, setLang } = useT();
  const bn = lang === "bn";
  const qc = useQueryClient();
  useBackClose(true, onBack);
  const [sound, tSound] = useLocalFlag("fp-mute");
  return (
    <Page title={bn ? "সেটিংস" : "Settings"} onBack={onBack}>
      <Card>
        <Row icon={Globe} label={bn ? "ভাষা" : "Language"} value={lang === "en" ? "English" : "বাংলা"} onClick={() => setLang(lang === "en" ? "bn" : "en")} />
        <Row icon={Moon} label={bn ? "ডার্ক মোড" : "Dark mode"} value={<Toggle on={dark} />} onClick={() => setDark(!dark)} />
      </Card>
      <Card>
        <Row icon={Bell} label={bn ? "মেসেজ শব্দ" : "Message sound"} value={<Toggle on={!sound} />} onClick={tSound} />
      </Card>
      <Card>
        <Row icon={Folder} label={bn ? "ক্যাশ পরিষ্কার" : "Clear cache"} onClick={() => { qc.clear(); toast.success(bn ? "পরিষ্কার হয়েছে" : "Cleared"); qc.invalidateQueries(); }} />
      </Card>
    </Page>
  );
}

/* ---------- My Files ---------- */
function MyFiles({ me, onBack }: { me: Me; onBack: () => void }) {
  const { lang } = useT();
  const bn = lang === "bn";
  useBackClose(true, onBack);
  const q = useQuery({
    queryKey: ["my-files", me.id],
    queryFn: async () => (await supabase.from("messages").select("id, file_name, kind, created_at").not("file_name", "is", null).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <Page title={bn ? "আমার ফাইল" : "My Files"} onBack={onBack}>
      {q.data?.length === 0 && <p className="p-12 text-center text-ui text-muted-foreground">{bn ? "এখনও কোনো ফাইল নেই" : "No files yet"}</p>}
      {!!q.data?.length && (
        <Card>
          {q.data.map((f) => (
            <div key={f.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <Folder className="h-5 w-5 text-amber-500" />
              <span className="min-w-0 flex-1 truncate text-ui">{f.file_name}</span>
              <span className="text-ui text-muted-foreground">{shortTime(f.created_at, lang)}</span>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
