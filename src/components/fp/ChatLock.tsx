import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

const key = (pairId: string) => `fp-chatpin-${pairId}`;
export const getChatPin = (pairId: string) => (typeof window === "undefined" ? null : localStorage.getItem(key(pairId)));
export function setChatPin(pairId: string, pin: string | null) {
  if (pin) localStorage.setItem(key(pairId), pin); else localStorage.removeItem(key(pairId));
}
export const isValidPin = (p: string) => /^\d{4}$/.test(p);

/** Asks for the 4-digit PIN once per visit before showing a locked chat. */
export function ChatLockGate({ pairId, bn, children }: { pairId: string; bn: boolean; children: ReactNode }) {
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);
  useEffect(() => { setPin(sessionStorage.getItem(`fp-unlocked-${pairId}`) ? null : getChatPin(pairId)); setTyped(""); }, [pairId]);
  if (pin === undefined) return null;
  if (!pin) return <>{children}</>;
  function press(d: string) {
    setBad(false);
    const n = (typed + d).slice(0, 4);
    setTyped(n);
    if (n.length === 4) {
      if (n === pin) { sessionStorage.setItem(`fp-unlocked-${pairId}`, "1"); setPin(null); }
      else { setBad(true); navigator.vibrate?.(200); setTimeout(() => setTyped(""), 300); }
    }
  }
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 bg-background px-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary"><Lock className="h-8 w-8" /></span>
      <p className="text-[15px] font-bold">{bn ? "চ্যাট খুলতে পিন দিন" : "Enter PIN to open chat"}</p>
      <div className={`flex gap-3 ${bad ? "animate-pulse" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${bad ? "border-destructive bg-destructive" : i < typed.length ? "border-primary bg-primary" : "border-muted-foreground"}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => d === "" ? <span key={i} /> : (
          <button key={i} type="button" aria-label={d === "⌫" ? "Delete" : d}
            onClick={() => (d === "⌫" ? setTyped(typed.slice(0, -1)) : press(d))}
            className="h-16 w-16 rounded-full bg-muted text-2xl font-semibold active:bg-primary/20">{d}</button>
        ))}
      </div>
    </div>
  );
}
