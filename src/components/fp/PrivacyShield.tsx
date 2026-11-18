import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";

/** Blurs the whole app when it is hidden/minimised so chats can't be peeked at in the app switcher. */
export function PrivacyShield() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // Only a real app hide (home button / app switcher) locks; window blur from iframes or tabs never does.
    const vis = () => { if (document.visibilityState === "hidden") setHidden(true); };
    document.addEventListener("visibilitychange", vis);
    const title = document.title;
    return () => {
      document.removeEventListener("visibilitychange", vis);
      document.title = title;
    };
  }, []);
  useEffect(() => {
    if (localStorage.getItem("fp-discreet") !== "1") return;
    const t = document.title;
    if (hidden) document.title = "Notes";
    return () => { document.title = t; };
  }, [hidden]);
  if (!hidden) return null;
  return (
    <div role="button" aria-label="Unlock screen" onPointerDown={() => setHidden(false)} className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-2xl">
      <Lock className="h-10 w-10 text-primary" />
    </div>
  );
}

/**
 * Android back button: while any layer is open, ONE guard history entry exists.
 * Pressing back closes only the topmost open layer, then re-arms the guard if layers remain.
 */
type Layer = { close: { current: () => void }; popped: boolean };
const layers: Layer[] = [];
let guard = false;
let ignoreNext = false;
let listening = false;
let guardHref = "";
function arm() {
  if (!guard && layers.length) {
    // Returning to a page whose guard entry is still in history: reuse it instead of stacking another.
    if (!history.state?.fpSheet) history.pushState({ ...(history.state ?? {}), fpSheet: true }, "");
    guard = true; guardHref = location.href;
  }
}
let rootBack: (() => void) | null = null;
/** A page (e.g. chat) can claim the phone back button when no sheet is open, so back goes home instead of leaving the app. */
export function setRootBack(fn: () => void) {
  rootBack = fn;
  if (!listening) { window.addEventListener("popstate", onGlobalPop); listening = true; }
  if (!history.state?.fpRoot && !history.state?.fpSheet) history.pushState({ ...(history.state ?? {}), fpRoot: true }, "");
  return () => { if (rootBack === fn) rootBack = null; };
}
function onGlobalPop() {
  guard = false;
  if (ignoreNext) { ignoreNext = false; return; }
  const top = layers.pop();
  if (top) { top.popped = true; top.close.current(); setTimeout(arm, 0); return; }
  if (rootBack) { const f = rootBack; rootBack = null; f(); }
}
export function useBackClose(open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    if (!listening) { window.addEventListener("popstate", onGlobalPop); listening = true; }
    const layer: Layer = { close: ref, popped: false };
    layers.push(layer);
    arm();
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (layer.popped) return;
      // Closed from inside the app: drop the guard only if nothing else re-opened meanwhile.
      setTimeout(() => {
        if (!layers.length && guard) {
          guard = false;
          // If the user navigated to another page meanwhile, leave history alone (going back would undo that navigation).
          if (location.href === guardHref && history.state?.fpSheet) { ignoreNext = true; history.back(); }
        }
      }, 0);
    };
  }, [open]);
}
