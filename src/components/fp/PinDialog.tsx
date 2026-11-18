import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useBackClose } from "@/components/fp/PrivacyShield";

/** In-app 4-digit keypad. mode "set" asks twice; "check" asks once. */
export function PinDialog({ mode, expected, bn, onDone, onClose }: { mode: "set" | "check"; expected?: string | null; bn: boolean; onDone: (pin: string) => void; onClose: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  useBackClose(true, onClose);
  const title = mode === "check" ? (bn ? "বর্তমান পিন দিন" : "Enter current PIN") : first ? (bn ? "পিনটি আবার দিন" : "Repeat the PIN") : bn ? "নতুন ৪ সংখ্যার পিন" : "New 4-digit PIN";
  function press(d: string) {
    setErr("");
    const n = (typed + d).slice(0, 4);
    setTyped(n);
    if (n.length < 4) return;
    setTimeout(() => {
      setTyped("");
      if (mode === "check") { if (n === expected) onDone(n); else { setErr(bn ? "ভুল পিন" : "Wrong PIN"); navigator.vibrate?.(200); } return; }
      if (!first) { setFirst(n); return; }
      if (n === first) onDone(n); else { setFirst(null); setErr(bn ? "পিন মেলেনি, আবার দিন" : "PINs did not match, try again"); navigator.vibrate?.(200); }
    }, 150);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-background px-6 pb-8 pt-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary"><KeyRound className="h-6 w-6" /></span>
          <p className="text-[15px] font-bold">{title}</p>
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${err ? "border-destructive" : i < typed.length ? "border-primary bg-primary" : "border-muted-foreground"}`} />)}
          </div>
          <p className="h-4 text-xs text-destructive">{err}</p>
          <div className="grid grid-cols-3 gap-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => d === "" ? <span key={i} /> : (
              <button key={i} type="button" aria-label={d === "⌫" ? "Delete" : d} onClick={() => (d === "⌫" ? setTyped(typed.slice(0, -1)) : press(d))}
                className="h-16 w-16 rounded-full bg-muted text-2xl font-semibold active:bg-primary/20">{d}</button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-[15px] font-semibold text-muted-foreground">{bn ? "বাতিল" : "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}
