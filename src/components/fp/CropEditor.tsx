import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/** Opens a full-screen zoom/pan crop screen. Resolves with the cropped JPEG, or null if cancelled. */
export function cropWithEditor(file: File, w: number, h: number, bn: boolean): Promise<Blob | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (b: Blob | null) => {
      root.unmount();
      host.remove();
      resolve(b);
    };
    root.render(<CropEditor file={file} w={w} h={h} bn={bn} onDone={done} />);
  });
}

function CropEditor({ file, w, h, bn, onDone }: { file: File; w: number; h: number; bn: boolean; onDone: (b: Blob | null) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameW = Math.min(320, window.innerWidth - 40);
  const frameH = frameW * (h / w);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // base scale = cover the frame
  const base = img ? Math.max(frameW / img.width, frameH / img.height) : 1;
  const s = base * zoom;
  const dw = img ? img.width * s : 0;
  const dh = img ? img.height * s : 0;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(frameW - dw, o.x)),
    y: Math.min(0, Math.max(frameH - dh, o.y)),
  });
  useEffect(() => {
    if (img) setOff((o) => clamp(o.x === 0 && o.y === 0 ? { x: (frameW - dw) / 2, y: (frameH - dh) / 2 } : o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom]);

  function save() {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(img, -off.x / s, -off.y / s, frameW / s, frameH / s, 0, 0, w, h);
    c.toBlob((b) => onDone(b), "image/jpeg", 0.88);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-foreground/95 p-5">
      <p className="text-sm font-bold text-background">{bn ? "ছবি সরান ও জুম করুন" : "Drag and zoom to adjust"}</p>
      <div
        className="relative touch-none overflow-hidden border-2 border-background"
        style={{ width: frameW, height: frameH, borderRadius: w === h ? "9999px" : 12 }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
        onPointerMove={(e) => { const d = drag.current; if (d) setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }}
        onPointerUp={() => (drag.current = null)}
      >
        {img && <img src={img.src} alt="" draggable={false} style={{ position: "absolute", left: off.x, top: off.y, width: dw, height: dh, maxWidth: "none" }} />}
      </div>
      <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-64 accent-primary" aria-label="Zoom" />
      <div className="flex gap-3">
        <button onClick={() => onDone(null)} className="rounded-full bg-background/20 px-6 py-2 text-sm font-bold text-background">{bn ? "বাতিল" : "Cancel"}</button>
        <button onClick={save} className="rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground">{bn ? "সেভ" : "Save"}</button>
      </div>
    </div>
  );
}
