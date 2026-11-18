import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, ClipboardPaste, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerStatus, recoverOwner, setupOwner } from "@/lib/login.functions";
import { idToEmail, ownerSecret, partnerSecret } from "@/lib/login";
import loginBadge from "@/assets/duox-login-badge.png.asset.json";
const fpLogo = loginBadge.url;

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — DuoX" },
      { name: "description", content: "Sign in to DuoX with your ID and Token." },
      { property: "og:title", content: "Sign in — DuoX" },
      { property: "og:description", content: "Sign in to DuoX with your ID and Token." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type View = "choose" | "owner" | "partner" | "setup" | "token" | "forgot";

function Logo({ size }: { size: number }) {
  return (
    <img
      src={fpLogo}
      alt="DuoX"
      width={size}
      height={size}
      className="shrink-0 object-contain drop-shadow-xl"
      style={{ width: size, height: size }}
    />
  );
}

const inputCls =
  "w-full rounded-2xl border border-input bg-background px-4 py-3.5 text-base outline-none focus:border-primary";

function warn(msg: string) {
  toast.error(msg);
}

const clean = (v: string) => v.replace(/\s+/g, "");
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

function SecretInput({
  value,
  onChange,
  placeholder,
  numeric,
  paste,
  enterHint,
  inputRef,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
  paste?: boolean;
  enterHint?: "next" | "go";
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onEnter?: (() => void) | undefined;
}) {
  const [show, setShow] = useState(false);
  const set = (v: string) => onChange(numeric ? digits(v) : clean(v));
  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={`${inputCls} ${paste ? "pr-20" : "pr-12"}`}
        type={show ? "text" : "password"}
        inputMode={numeric ? "numeric" : undefined}
        pattern={numeric ? "[0-9]*" : undefined}
        maxLength={numeric ? 6 : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        autoCapitalize="none"
        autoComplete="off"
        enterKeyHint={enterHint}
        onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {paste && (
          <button
            type="button"
            aria-label="Paste"
            className="rounded-full p-1.5 text-muted-foreground hover:text-primary"
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                if (t) set(t);
                else warn("Clipboard is empty");
              } catch {
                warn("Cannot read clipboard. Long-press to paste.");
              }
            }}
          >
            <ClipboardPaste className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          aria-label={show ? "Hide" : "Show"}
          className="rounded-full p-1.5 text-muted-foreground hover:text-primary"
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

function friendly(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "No internet. Check your connection.";
  const m = e instanceof Error ? e.message : String(e);
  if (/fetch|network|Failed to/i.test(m)) return "Cannot reach server. Try again shortly.";
  return m || "Something went wrong";
}

function AuthPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("choose");
  const [hasOwner, setHasOwner] = useState(true);
  const [id, setId] = useState("");
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [newTok, setNewTok] = useState("");
  const [newRec, setNewRec] = useState("");
  const [recCode, setRecCode] = useState("");

  // pull to refresh
  const scrollRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const TRIGGER = 70;

  // focus flow + smooth card height
  const idRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const cardInner = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState<number | null>(null);

  useEffect(() => {
    const el = cardInner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (view === "owner" || view === "partner" || view === "setup") {
      const t = setTimeout(() => idRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [view]);

  function checkServer() {
    return getOwnerStatus()
      .then((r) => setHasOwner(r.hasOwner))
      .catch((e) => warn(friendly(e)));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
    checkServer();
    const off = () => warn("No internet. Check your connection.");
    const on = () => toast.success("Back online");
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function doRefresh() {
    setRefreshing(true);
    setId("");
    setToken("");
    setPin("");
    if (view === "token") setView("choose");
    await Promise.all([checkServer(), new Promise((r) => setTimeout(r, 700))]);
    setRefreshing(false);
    setPull(0);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (busy || refreshing) return;
    if ((scrollRef.current?.scrollTop ?? 0) <= 0) startY.current = (e.touches[0]?.clientY ?? 0);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const d = (e.touches[0]?.clientY ?? 0) - startY.current;
    setPull(d > 0 ? Math.min(d * 0.5, 110) : 0);
  }
  function onTouchEnd() {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= TRIGGER) {
      setPull(TRIGGER);
      doRefresh();
    } else setPull(0);
  }

  function go(v: View) {
    setToken("");
    setPin("");
    setView(v);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!id.trim() || !token.trim() || (view === "owner" && !pin.trim())) {
      warn("Please fill in all fields");
      return;
    }
    if (!navigator.onLine) return warn("No internet. Check your connection.");
    setBusy(true);
    try {
      const password = view === "owner" ? await ownerSecret(token.trim(), pin.trim()) : await partnerSecret(token.trim());
      const { error } = await supabase.auth.signInWithPassword({ email: idToEmail(id.trim()), password });
      if (error) {
        if (/invalid/i.test(error.message))
          throw new Error(view === "owner" ? "ID, Token or PIN is wrong" : "ID or Token is wrong");
        throw error;
      }
      if (view === "owner") localStorage.setItem("fp-owner-token", token.trim());
      toast.success("Signed in");
      navigate({ to: "/home", replace: true });
    } catch (e) {
      warn(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSetup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!id.trim() || !pin.trim()) return warn("Please fill in all fields");
    if (!/^\d{4,6}$/.test(pin.trim())) return warn("PIN must be 4–6 digits");
    setBusy(true);
    try {
      const r = await setupOwner({ data: { ownerId: id, pin } });
      setNewTok(r.token);
      setNewRec(r.recoveryCode);
      setHasOwner(true);
      setView("token");
      toast.success("Owner created");
    } catch (e) {
      warn(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function doRecover(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!id.trim() || !recCode.trim() || !pin.trim()) return warn("Please fill in all fields");
    if (!/^\d{4,6}$/.test(pin.trim())) return warn("PIN must be 4–6 digits");
    setBusy(true);
    try {
      const r = await recoverOwner({ data: { ownerId: id, recoveryCode: recCode, newPin: pin } });
      setNewTok(r.token);
      setNewRec("");
      setRecCode("");
      setView("token");
      toast.success("New Token created");
    } catch (e) {
      warn(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterSetup() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: idToEmail(id),
      password: await ownerSecret(newTok, pin),
    });
    setBusy(false);
    if (error) return warn(friendly(error));
    localStorage.setItem("fp-owner-token", newTok);
    navigate({ to: "/home", replace: true });
  }

  const SubmitBtn = ({ label }: { label: string }) => (
    <button
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground disabled:opacity-60"
    >
      {busy && <Loader2 className="h-5 w-5 animate-spin" />}
      {busy ? "Please wait..." : label}
    </button>
  );

  const ringProgress = Math.min(pull / TRIGGER, 1);

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-background">
      {/* Fixed header */}
      <header className="flex shrink-0 items-center gap-2.5 px-5 pb-2 pt-4">
        <span className="font-brand text-xl font-black tracking-[0.2em] text-foreground">DUOX</span>
      </header>

      {/* Scrollable middle */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto overscroll-contain px-5"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center"
          style={{ transform: `translateY(${pull - 44}px)`, opacity: refreshing ? 1 : ringProgress, transition: startY.current == null ? "all .25s" : "none" }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background shadow-md">
            {refreshing ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="h-5 w-5 text-primary" style={{ transform: `rotate(${ringProgress * 270}deg)` }} />
            )}
          </div>
        </div>

        <div className="flex min-h-full flex-col">
          <h1 className="mt-4 text-center text-[30px] font-extrabold tracking-tight text-foreground">
            {view === "setup" ? "Setup Owner" : view === "token" ? "Your Token" : view === "forgot" ? "Recover" : "Sign in"}
          </h1>

          <div
            className="mt-4 overflow-hidden rounded-[28px] border border-primary/20 bg-accent"
            style={{ height: cardH ?? "auto", transition: "height .3s ease" }}
          >
            <div ref={cardInner} className="flex min-h-[280px] flex-col justify-center px-6 py-8">
              <div key={view} className="fp-step-in">
            {view === "choose" && (
              <div className="space-y-4">
                {hasOwner === false && (
                  <div className="space-y-3 rounded-2xl border border-primary/30 bg-background p-4 text-center">
                    <p className="text-sm font-bold text-foreground">No owner yet</p>
                    <p className="text-xs text-muted-foreground">This app is new. Old IDs and Tokens won't work here — create your Owner account first.</p>
                    <button onClick={() => go("setup")} className="w-full rounded-full bg-primary py-3.5 text-base font-bold text-primary-foreground">
                      Setup Owner
                    </button>
                  </div>
                )}
                <button
                  onClick={() => (hasOwner === false ? go("setup") : go("owner"))}
                  className={hasOwner === false ? "w-full rounded-full border border-primary/30 bg-background py-3.5 text-base font-bold text-primary" : "w-full rounded-full bg-primary py-3.5 text-base font-bold text-primary-foreground"}
                >
                  Owner
                </button>
                <button onClick={() => go("partner")} className="w-full rounded-full border border-primary/30 bg-background py-3.5 text-base font-bold text-primary">
                  Partner
                </button>
              </div>
            )}

            {(view === "owner" || view === "partner") && (
              <form onSubmit={login} className="space-y-3" noValidate>
                <p className="text-center text-sm font-bold text-primary">{view === "owner" ? "Owner login" : "Partner login"}</p>
                <input
                  ref={idRef}
                  className={inputCls}
                  placeholder={view === "owner" ? "Owner ID" : "Partner ID"}
                  value={id}
                  onChange={(e) => setId(clean(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      tokenRef.current?.focus();
                    }
                  }}
                  autoCapitalize="none"
                  autoComplete="off"
                  enterKeyHint="next"
                />
                <SecretInput
                  inputRef={tokenRef}
                  value={token}
                  onChange={setToken}
                  placeholder="Token"
                  paste
                  enterHint={view === "owner" ? "next" : "go"}
                  onEnter={view === "owner" ? () => pinRef.current?.focus() : undefined}
                />
                {view === "owner" && <SecretInput inputRef={pinRef} value={pin} onChange={setPin} placeholder="Admin PIN" numeric enterHint="go" />}
                <SubmitBtn label="Sign in" />
                <button type="button" onClick={() => go("forgot")} className="w-full text-sm font-semibold text-primary">
                  {view === "owner" ? "Forgot Token or PIN?" : "Forgot Token?"}
                </button>
                <button type="button" onClick={() => go("choose")} className="w-full text-sm text-muted-foreground">
                  ← Back
                </button>
              </form>
            )}

            {view === "setup" && (
              <form onSubmit={doSetup} className="space-y-3" noValidate>
                <input ref={idRef} className={inputCls} placeholder="Owner ID" value={id} onChange={(e) => setId(clean(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pinRef.current?.focus(); } }} autoCapitalize="none" autoComplete="off" enterKeyHint="next" />
                <SecretInput inputRef={pinRef} value={pin} onChange={setPin} placeholder="Admin PIN (4-6 digits)" numeric enterHint="go" />
                <SubmitBtn label="Create Owner" />
                <button type="button" onClick={() => go("choose")} className="w-full text-sm text-muted-foreground">
                  ← Back
                </button>
              </form>
            )}

            {view === "forgot" && (
              <form onSubmit={doRecover} className="space-y-3" noValidate>
                <p className="text-center text-sm font-bold text-primary">Forgot Token or PIN</p>
                <input className={inputCls} placeholder="Owner ID" value={id} onChange={(e) => setId(clean(e.target.value))} autoCapitalize="none" autoComplete="off" />
                <input className={inputCls} placeholder="Recovery Code (XXXX-XXXX-XXXX)" value={recCode} onChange={(e) => setRecCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
                <SecretInput value={pin} onChange={setPin} placeholder="New Admin PIN (4-6 digits)" numeric enterHint="go" />
                <SubmitBtn label="Reset" />
                <p className="text-center text-xs text-muted-foreground">Partner? Ask your Owner to renew your Token.</p>
                <button type="button" onClick={() => go("choose")} className="w-full text-sm text-muted-foreground">
                  ← Back
                </button>
              </form>
            )}

            {view === "token" && (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">Save this Token safely. You need it with your ID and PIN to sign in.</p>
                {newRec && (
                  <>
                    <p className="text-xs font-bold text-primary">Recovery Code (use if you forget Token/PIN)</p>
                    <p className="rounded-2xl bg-background p-3 font-mono text-sm text-foreground">{newRec}</p>
                  </>
                )}
                <p className="break-all rounded-2xl bg-background p-3 font-mono text-xs text-foreground">{newTok}</p>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(newTok);
                    toast.success("Token copied");
                  }}
                  className="w-full rounded-full border border-primary/30 bg-background py-3 font-bold text-primary"
                >
                  Copy Token
                </button>
                <button disabled={busy} onClick={continueAfterSetup} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground">
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                  Continue
                </button>
              </div>
            )}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-6">
            <Logo size={64} />
            <span className="font-brand mt-1.5 text-xl font-black tracking-[0.2em] text-foreground">DUOX</span>
          </div>
        </div>
      </div>

      {/* Fixed footer */}
      <footer className="shrink-0 px-5 pb-3">
        <div className="border-t border-border pt-2.5 text-center text-xs text-muted-foreground">Private • Simple • Just for Two</div>
      </footer>
    </div>
  );
}
