import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMe, fetchPairs } from "@/lib/fp";
import { useT } from "@/lib/i18n";

let LANG = "en";
const L = (en: string, bn: string) => (LANG === "bn" ? bn : en);
import { carePet, careGarden, petFace, petHappiness, petLevel, plantStage, todaysDates, onThisDay, type Pet, type Garden, type Dates, type PetAction } from "@/lib/corner";

export const Route = createFileRoute("/_authenticated/together")({
  head: () => ({
    meta: [
      { title: "Together — DuoX" },
      { name: "description", content: "Shared memories, a couple pet, a flower garden and a face-tracking sticker camera." },
      { property: "og:title", content: "Together — DuoX" },
      { property: "og:description", content: "Shared memories, a couple pet, a flower garden and a face-tracking sticker camera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => (["memories", "pet", "garden", "camera"].includes(s["tab"] as string) ? { tab: s["tab"] as Tab } : {}),
  component: Together,
});

type Tab = "memories" | "pet" | "garden" | "camera";
const TITLE: Record<Tab, [string, string]> = { memories: ["Memories", "স্মৃতি"], pet: ["Pet", "পোষা"], garden: ["Garden", "বাগান"], camera: ["Camera", "ক্যামেরা"] };
const DATE_LABEL: Record<keyof Dates, [string, string]> = { anniversary: ["Anniversary", "বিবাহবার্ষিকী"], bdayOwner: ["My birthday", "আমার জন্মদিন"], bdayPartner: ["Partner's birthday", "উনার জন্মদিন"] };
const dl = (k: keyof Dates) => L(...DATE_LABEL[k]);

function Together() {
  const navigate = useNavigate();
  const tab: Tab = Route.useSearch().tab ?? "memories";
  LANG = useT().lang;
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({ queryKey: ["pairs", me.data?.id], queryFn: () => fetchPairs(me.data!.id), enabled: !!me.data });
  const pair = pairs.data?.[0];
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2">
        <button aria-label="Back" onClick={() => navigate({ to: "/home" })} className="rounded-full p-2 text-primary"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="flex-1 text-ui font-semibold">{L(...TITLE[tab])}</h1>
      </header>
      {!pair || !me.data ? <p className="p-6 text-center text-ui text-muted-foreground">{pairs.isLoading ? L("Loading…", "লোড হচ্ছে…") : L("Add a partner first", "আগে একজন পার্টনার যুক্ত করুন")}</p> : (
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
        <p className="text-ui text-muted-foreground">{L("Level", "লেভেল")} {petLevel(c.pet)} • {L("Mood", "খুশি")} {"❤️".repeat(h)}{"🤍".repeat(3 - h)}</p>
        <div key={bounce} className="text-[120px] leading-none animate-in zoom-in-50 duration-500">{petFace(c.pet)}</div>
        <p className="text-ui">{h === 3 ? L("Minu is very happy! 🎉", "মিনু খুব খুশি! 🎉") : h === 0 ? L("Minu is hungry…", "মিনুর খিদে পেয়েছে…") : L("A little more care, please", "আরেকটু যত্ন নিন")}</p>
        <div className="grid w-full max-w-sm grid-cols-3 gap-3">
          {([["fed", "🍗", L("Feed", "খাবার")], ["bath", "🛁", L("Bath", "গোসল")], ["pat", "🐾", L("Cuddle", "আদর")]] as [PetAction, string, string][]).map(([a, e, l]) => (
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
      <p className="text-ui text-muted-foreground">{L("Flowers", "মোট ফুল")}: {g.flowers ?? 0} • {L("Give water and sun today to grow a new flower", "আজ পানি ও রোদ দুটোই দিলে নতুন ফুল ফুটবে")}</p>
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <button onClick={() => c.save({ garden: careGarden(g, "water") })} className="flex flex-col items-center gap-1 rounded-2xl bg-muted py-4 text-ui active:scale-95"><span className="text-4xl">💧</span>{done(g.water) ? L("Watered ✓", "পানি দেওয়া ✓") : L("Water", "পানি দিন")}</button>
        <button onClick={() => c.save({ garden: careGarden(g, "sun") })} className="flex flex-col items-center gap-1 rounded-2xl bg-muted py-4 text-ui active:scale-95"><span className="text-4xl">☀️</span>{done(g.sun) ? L("Sunned ✓", "রোদ দেওয়া ✓") : L("Sunlight", "রোদ দিন")}</button>
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
      {special.map((s) => <div key={s.key} className="rounded-2xl bg-primary p-4 text-ui text-primary-foreground">🎉 {L("Today", "আজ")}: {dl(s.key)}! {s.years > 0 ? L(`${s.years} years`, `${s.years} বছর পূর্ণ হলো`) : ""} ❤️</div>)}
      {past.length > 0 && (
        <div className="rounded-2xl bg-muted p-3">
          <p className="mb-2 text-ui font-semibold">🕰 {L("On this day", "আগের বছরের আজকের দিনে")}</p>
          <div className="flex gap-2 overflow-x-auto">{past.map((m) => <Thumb key={m.id} m={m} className="h-28 w-28 shrink-0" onOpen={() => setOpen(m)} />)}</div>
        </div>
      )}
      {isOwner && (
        <details className="rounded-2xl bg-muted p-3 text-ui">
          <summary className="cursor-pointer">📅 {L("Set special dates", "বিশেষ দিনগুলো সেট করুন")}</summary>
          <div className="mt-2 flex flex-col gap-2">
            {(Object.keys(DATE_LABEL) as (keyof Dates)[]).map((k) => (
              <label key={k} className="flex items-center justify-between gap-2">{dl(k)}
                <input type="date" defaultValue={c.dates[k] ?? ""} onChange={(e) => c.save({ dates: { ...c.dates, [k]: e.target.value || undefined } })} className="rounded-lg bg-background px-2 py-1" />
              </label>
            ))}
          </div>
        </details>
      )}
      {items.data?.length === 0 && <p className="p-6 text-center text-ui text-muted-foreground">{L("Photos and videos you share in chat will appear here", "চ্যাটে ছবি বা ভিডিও পাঠালে এখানে স্মৃতি হিসেবে জমা হবে")}</p>}
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
      <p className="p-3 text-center text-ui text-background">{new Date(m.created_at).toLocaleDateString(LANG === "bn" ? "bn-BD" : "en-GB", { dateStyle: "long" })}</p>
      <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {url && (m.file_type?.startsWith("video") ? <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" /> : <img src={url} alt="" className="max-h-full max-w-full object-contain" />)}
      </div>
      <button onClick={onClose} className="m-3 rounded-full bg-background py-2 text-ui">{L("Close", "বন্ধ করুন")}</button>
    </div>
  );
}

type Anchor = "top" | "eyes" | "nose" | "cheek";
const STICKERS: { e: string; a: Anchor; s: number }[] = [
  { e: "👑", a: "top", s: 0.9 }, { e: "🕶️", a: "eyes", s: 0.9 }, { e: "🐰", a: "top", s: 1 },
  { e: "🌸", a: "top", s: 0.6 }, { e: "🐽", a: "nose", s: 0.35 }, { e: "❤️", a: "cheek", s: 0.25 },
];
type Box = { x: number; y: number; w: number; h: number; ex: number; ey: number; nx: number; ny: number };
/** Sticker centre and size (fractions of frame) from a detected face box. */
function place(b: Box, a: Anchor, scale: number) {
  const size = b.w * scale;
  if (a === "eyes") return { x: b.ex, y: b.ey, size };
  if (a === "nose") return { x: b.nx, y: b.ny, size };
  if (a === "cheek") return { x: b.x + b.w * 0.82, y: b.y + b.h * 0.7, size };
  return { x: b.x + b.w / 2, y: b.y - size * 0.35, size };
}
function StickerCam({ pairId, me }: { pairId: string; me: string }) {
  const vref = useRef<HTMLVideoElement>(null);
  const [pick, setPick] = useState(0);
  const [face, setFace] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<Blob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, alive = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => { stream = s; if (vref.current) vref.current.srcObject = s; })
      .catch(() => setErr(L("Couldn't start the camera — please allow access", "ক্যামেরা চালু করা যায়নি — অনুমতি দিন")));
    (async () => {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      const det = await FaceDetector.createFromOptions(fs, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite", delegate: "GPU" },
        runningMode: "VIDEO",
      });
      if (!alive) return;
      setReady(true);
      const loop = () => {
        const v = vref.current;
        if (v && v.videoWidth && v.readyState >= 2) {
          const d = det.detectForVideo(v, performance.now()).detections[0];
          const bb = d?.boundingBox, k = d?.keypoints ?? [];
          if (bb && k.length >= 3) {
            const W = v.videoWidth, H = v.videoHeight;
            // mirrored preview: flip x
            setFace({ x: 1 - (bb.originX + bb.width) / W, y: bb.originY / H, w: bb.width / W, h: bb.height / H,
              ex: 1 - (k[0]!.x + k[1]!.x) / 2, ey: (k[0]!.y + k[1]!.y) / 2, nx: 1 - k[2]!.x, ny: k[2]!.y });
          } else setFace(null);
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    })().catch(() => setErr(L("Face tracking isn't supported on this device", "এই ডিভাইসে ফেস ট্র্যাকিং চলছে না")));
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const st = STICKERS[pick]!;
  const pos = face ? place(face, st.a, st.s) : null;
  const capture = () => {
    const v = vref.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext("2d")!; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    if (pos) { g.font = `${c.width * pos.size}px serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(st.e, pos.x * c.width, pos.y * c.height); }
    c.toBlob((b) => setShot(b), "image/jpeg", 0.9);
  };
  const send = async () => {
    if (!shot) return;
    const path = `${pairId}/${crypto.randomUUID()}-sticker.jpg`;
    const up = await supabase.storage.from("fixedpair-files").upload(path, shot, { contentType: "image/jpeg" });
    if (up.error) { toast.error(up.error.message); return; }
    const { error } = await supabase.from("messages").insert({ pair_id: pairId, sender_id: me, file_path: path, file_type: "image/jpeg", file_name: "sticker.jpg", file_size: shot.size });
    if (error) toast.error(error.message); else { toast.success(L("Photo sent to chat ❤️", "ছবি চ্যাটে পাঠানো হলো ❤️")); setShot(null); }
  };
  if (err) return <p className="p-6 text-center text-ui text-muted-foreground">{err}</p>;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="relative w-full overflow-hidden rounded-2xl bg-muted" style={{ containerType: "inline-size" }}>
        {shot ? <img src={URL.createObjectURL(shot)} alt="" className="block w-full" /> : <>
          <video ref={vref} autoPlay playsInline muted className="block w-full -scale-x-100" />
          {pos && <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 leading-none transition-all duration-75" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, fontSize: `${pos.size * 100}cqw` }}>{st.e}</span>}
        </>}
      </div>
      {!shot && <p className="text-center text-ui text-muted-foreground">{!ready ? L("Starting face tracking…", "ফেস ট্র্যাকিং চালু হচ্ছে…") : face ? L("Face found — sticker placed automatically", "মুখ শনাক্ত হয়েছে — স্টিকার নিজে বসেছে") : L("Look at the camera", "ক্যামেরার দিকে তাকান")}</p>}
      {!shot && <div className="flex justify-center gap-2">{STICKERS.map((x, i) => <button key={x.e} onClick={() => setPick(i)} className={`rounded-full p-2 text-3xl ${pick === i ? "bg-primary" : "bg-muted"}`}>{x.e}</button>)}</div>}
      {shot ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShot(null)} className="rounded-full bg-muted py-3 text-ui">{L("Retake", "আবার তুলুন")}</button>
          <button onClick={send} className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-ui text-primary-foreground"><Send className="h-4 w-4" />{L("Send to partner", "উনাকে পাঠান")}</button>
        </div>
      ) : <button onClick={capture} className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-ui text-primary-foreground"><Camera className="h-5 w-5" />{L("Take photo", "ছবি তুলুন")}</button>}
    </div>
  );
}
