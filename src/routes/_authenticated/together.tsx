import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs } from "@/lib/fp";
import { carePet, careGarden, petFace, petHappiness, petLevel, plantStage, todaysDates, onThisDay, type Pet, type Garden, type Dates, type PetAction } from "@/lib/corner";

export const Route = createFileRoute("/_authenticated/together")({
  head: () => ({
    meta: [
      { title: "আমাদের দুজন — DuoX" },
      { name: "description", content: "স্মৃতির অ্যালবাম, পোষা বিড়াল, ফুলের বাগান ও মজার স্টিকার ক্যামেরা।" },
      { property: "og:title", content: "আমাদের দুজন — DuoX" },
      { property: "og:description", content: "স্মৃতির অ্যালবাম, পোষা বিড়াল, ফুলের বাগান ও মজার স্টিকার ক্যামেরা।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Together,
});

type Tab = "memories" | "pet" | "garden" | "camera";
const TABS: { k: Tab; l: string }[] = [
  { k: "memories", l: "📸 স্মৃতি" }, { k: "pet", l: "🐱 পোষা" }, { k: "garden", l: "🌸 বাগান" }, { k: "camera", l: "👑 স্টিকার" },
];
const DATE_LABEL: Record<keyof Dates, string> = { anniversary: "বিবাহবার্ষিকী", bdayOwner: "আমার জন্মদিন", bdayPartner: "উনার জন্মদিন" };

function Together() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("memories");
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({ queryKey: ["pairs", me.data?.id], queryFn: () => fetchPairs(me.data!.id), enabled: !!me.data });
  const pair = pairs.data?.[0];
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2">
        <button aria-label="Back" onClick={() => navigate({ to: "/home" })} className="rounded-full p-2 text-primary"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="flex-1 text-ui font-semibold">আমাদের দুজন ❤️</h1>
      </header>
      <nav className="grid shrink-0 grid-cols-4 gap-1 p-2">
        {TABS.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-xl py-2 text-ui ${tab === t.k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{t.l}</button>)}
      </nav>
      {!pair || !me.data ? <p className="p-6 text-center text-ui text-muted-foreground">{pairs.isLoading ? "লোড হচ্ছে…" : "আগে একজন পার্টনার যুক্ত করুন"}</p> : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "camera" ? <StickerCam pairId={pair.id} me={me.data.id} /> : tab === "memories" ? <Memories pairId={pair.id} isOwner={me.data.role === "owner"} /> : <Care pairId={pair.id} tab={tab} />}
        </div>
      )}
    </div>
  );
}

function useCorner(pairId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["corner", pairId],
    queryFn: async () => (await supabase.from("couple_corner").select("*").eq("pair_id", pairId).maybeSingle()).data,
  });
  useEffect(() => {
    const ch = supabase.channel(`corner-${pairId}`).on("postgres_changes", { event: "*", schema: "public", table: "couple_corner", filter: `pair_id=eq.${pairId}` }, () => qc.invalidateQueries({ queryKey: ["corner", pairId] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pairId, qc]);
  const save = async (patch: { pet?: Pet; garden?: Garden; dates?: Dates }) => {
    const { error } = await supabase.from("couple_corner").upsert({ pair_id: pairId, ...(patch as Record<string, never>), updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["corner", pairId] });
  };
  return {
    pet: (q.data?.pet ?? {}) as Pet, garden: (q.data?.garden ?? {}) as Garden, dates: (q.data?.dates ?? {}) as Dates, save,
  };
}

function Care({ pairId, tab }: { pairId: string; tab: "pet" | "garden" }) {
  const c = useCorner(pairId);
  const [bounce, setBounce] = useState(0);
  if (tab === "pet") {
    const h = petHappiness(c.pet);
    const act = (a: PetAction) => { c.save({ pet: carePet(c.pet, a) }); setBounce((b) => b + 1); };
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-ui text-muted-foreground">লেভেল {petLevel(c.pet)} • খুশি {"❤️".repeat(h)}{"🤍".repeat(3 - h)}</p>
        <div key={bounce} className="text-[120px] leading-none animate-in zoom-in-50 duration-500">{petFace(c.pet)}</div>
        <p className="text-ui">{h === 3 ? "মিনু খুব খুশি! 🎉" : h === 0 ? "মিনুর খিদে পেয়েছে…" : "আরেকটু যত্ন নিন"}</p>
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
          {([["fed", "🍗", "খাবার"], ["bath", "🛁", "গোসল"], ["pat", "🐾", "আদর"]] as const).map(([a, e, l]) => (
            <button key={a} onClick={() => act(a)} className="flex flex-col items-center gap-1 rounded-2xl bg-muted py-4 text-ui active:scale-95"><span className="text-4xl">{e}</span>{l}</button>
          ))}
        </div>
      </div>
    );
  }
  const g = c.garden, today = new Date().toISOString().slice(0, 10);
  const done = (t?: string) => t?.slice(0, 10) === today;
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="text-[110px] leading-none">{plantStage(g)}</div>
      <div className="flex min-h-10 max-w-sm flex-wrap justify-center gap-1 text-3xl">{Array.from({ length: Math.min(g.flowers ?? 0, 30) }, (_, i) => <span key={i}>{["🌸", "🌺", "🌼", "🌷", "🌹"][i % 5]}</span>)}</div>
      <p className="text-ui text-muted-foreground">মোট ফুল: {g.flowers ?? 0} • আজ পানি ও রোদ দুটোই দিলে নতুন ফুল ফুটবে</p>
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <button onClick={() => c.save({ garden: careGarden(g, "water") })} className="flex flex-col items-center gap-1 rounded-2xl bg-muted py-4 text-ui active:scale-95"><span className="text-4xl">💧</span>{done(g.water) ? "পানি দেওয়া ✓" : "পানি দিন"}</button>
        <button onClick={() => c.save({ garden: careGarden(g, "sun") })} className="flex flex-col items-center gap-1 rounded-2xl bg-muted py-4 text-ui active:scale-95"><span className="text-4xl">☀️</span>{done(g.sun) ? "রোদ দেওয়া ✓" : "রোদ দিন"}</button>
      </div>
    </div>
  );
}

type Media = { id: string; file_path: string; file_type: string | null; created_at: string };
function Memories({ pairId, isOwner }: { pairId: string; isOwner: boolean }) {
  const c = useCorner(pairId);
  const items = useQuery({
    queryKey: ["memories", pairId],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("id, file_path, file_type, created_at").eq("pair_id", pairId).is("deleted_at", null).not("file_path", "is", null).or("file_type.like.image/%,file_type.like.video/%").order("created_at", { ascending: false }).limit(200);
      return (data ?? []) as Media[];
    },
  });
  const [open, setOpen] = useState<Media | null>(null);
  const special = todaysDates(c.dates);
  const past = onThisDay(items.data ?? []);
  return (
    <div className="flex flex-col gap-3 p-3">
      {special.map((s) => <div key={s.key} className="rounded-2xl bg-primary p-4 text-ui text-primary-foreground">🎉 আজ {DATE_LABEL[s.key]}! {s.years > 0 ? `${s.years} বছর পূর্ণ হলো` : ""} ❤️</div>)}
      {past.length > 0 && (
        <div className="rounded-2xl bg-muted p-3">
          <p className="mb-2 text-ui font-semibold">🕰 আগের বছরের আজকের দিনে</p>
          <div className="flex gap-2 overflow-x-auto">{past.map((m) => <Thumb key={m.id} m={m} className="h-28 w-28 shrink-0" onOpen={() => setOpen(m)} />)}</div>
        </div>
      )}
      {isOwner && (
        <details className="rounded-2xl bg-muted p-3 text-ui">
          <summary className="cursor-pointer">📅 বিশেষ দিনগুলো সেট করুন</summary>
          <div className="mt-2 flex flex-col gap-2">
            {(Object.keys(DATE_LABEL) as (keyof Dates)[]).map((k) => (
              <label key={k} className="flex items-center justify-between gap-2">{DATE_LABEL[k]}
                <input type="date" defaultValue={c.dates[k] ?? ""} onChange={(e) => c.save({ dates: { ...c.dates, [k]: e.target.value || undefined } })} className="rounded-lg bg-background px-2 py-1" />
              </label>
            ))}
          </div>
        </details>
      )}
      {items.data?.length === 0 && <p className="p-6 text-center text-ui text-muted-foreground">চ্যাটে ছবি বা ভিডিও পাঠালে এখানে স্মৃতি হিসেবে জমা হবে</p>}
      <div className="grid grid-cols-3 gap-1">{items.data?.map((m) => <Thumb key={m.id} m={m} className="aspect-square w-full" onOpen={() => setOpen(m)} />)}</div>
      {open && <Viewer m={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function useSigned(path: string) {
  return useQuery({ queryKey: ["signed", path], staleTime: 50 * 60 * 1000, queryFn: async () => (await supabase.storage.from("fixedpair-files").createSignedUrl(path, 3600)).data?.signedUrl ?? null }).data;
}
function Thumb({ m, className, onOpen }: { m: Media; className: string; onOpen: () => void }) {
  const url = useSigned(m.file_path);
  return (
    <button onClick={onOpen} className={`relative overflow-hidden rounded-lg bg-muted ${className}`}>
      {url && (m.file_type?.startsWith("video") ? <video src={url} muted className="h-full w-full object-cover" /> : <img src={url} alt="" className="h-full w-full object-cover" />)}
      {m.file_type?.startsWith("video") && <span className="absolute bottom-1 right-1 text-ui">▶️</span>}
    </button>
  );
}
function Viewer({ m, onClose }: { m: Media; onClose: () => void }) {
  const url = useSigned(m.file_path);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground" onClick={onClose}>
      <p className="p-3 text-center text-ui text-background">{new Date(m.created_at).toLocaleDateString("bn-BD", { dateStyle: "long" })}</p>
      <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {url && (m.file_type?.startsWith("video") ? <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" /> : <img src={url} alt="" className="max-h-full max-w-full object-contain" />)}
      </div>
      <button onClick={onClose} className="m-3 rounded-full bg-background py-2 text-ui">বন্ধ করুন</button>
    </div>
  );
}

const STICKERS = ["👑", "🐱", "🕶️", "🌸", "🐰", "❤️"];
function StickerCam({ pairId, me }: { pairId: string; me: string }) {
  const vref = useRef<HTMLVideoElement>(null);
  const [sticker, setSticker] = useState("👑");
  const [pos, setPos] = useState({ x: 0.5, y: 0.18, s: 0.3 });
  const [shot, setShot] = useState<Blob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => { stream = s; if (vref.current) vref.current.srcObject = s; })
      .catch(() => setErr("ক্যামেরা চালু করা যায়নি — অনুমতি দিন"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos((p) => ({ ...p, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }));
  };
  const capture = () => {
    const v = vref.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d")!; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `${c.width * pos.s}px serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(sticker, pos.x * c.width, pos.y * c.height);
    c.toBlob((b) => setShot(b), "image/jpeg", 0.9);
  };
  const send = async () => {
    if (!shot) return;
    const path = `${pairId}/${crypto.randomUUID()}-sticker.jpg`;
    const up = await supabase.storage.from("fixedpair-files").upload(path, shot, { contentType: "image/jpeg" });
    if (up.error) { toast.error(up.error.message); return; }
    const { error } = await supabase.from("messages").insert({ pair_id: pairId, sender_id: me, file_path: path, file_type: "image/jpeg", file_name: "sticker.jpg", file_size: shot.size });
    if (error) toast.error(error.message); else { toast.success("ছবি চ্যাটে পাঠানো হলো ❤️"); setShot(null); }
  };
  if (err) return <p className="p-6 text-center text-ui text-muted-foreground">{err}</p>;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-muted" style={{ containerType: "inline-size" }} onPointerMove={move} onPointerDown={move}>
        {shot ? <img src={URL.createObjectURL(shot)} alt="" className="h-full w-full object-cover" /> : <>
          <video ref={vref} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 leading-none" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, fontSize: `${pos.s * 100}cqw` }}>{sticker}</span>
        </>}
      </div>
      {!shot && <p className="text-center text-ui text-muted-foreground">স্টিকারটি আঙুল দিয়ে মাথার ওপর টেনে বসান</p>}
      {!shot && <div className="flex justify-center gap-2">{STICKERS.map((s) => <button key={s} onClick={() => setSticker(s)} className={`rounded-full p-2 text-3xl ${sticker === s ? "bg-primary" : "bg-muted"}`}>{s}</button>)}</div>}
      {!shot && <input type="range" min={0.1} max={0.6} step={0.02} value={pos.s} onChange={(e) => setPos((p) => ({ ...p, s: Number(e.target.value) }))} aria-label="স্টিকারের সাইজ" />}
      {shot ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShot(null)} className="rounded-full bg-muted py-3 text-ui">আবার তুলুন</button>
          <button onClick={send} className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-ui text-primary-foreground"><Send className="h-4 w-4" />উনাকে পাঠান</button>
        </div>
      ) : <button onClick={capture} className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-ui text-primary-foreground"><Camera className="h-5 w-5" />ছবি তুলুন</button>}
    </div>
  );
}
