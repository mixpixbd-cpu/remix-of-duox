import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
const fpLogo = "/icon-512.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DuoX — Private one-to-one messaging" },
      {
        name: "description",
        content:
          "DuoX is a private, ad-free one-to-one app: chat, share photos, videos and files between an owner and their partners.",
      },
      { property: "og:title", content: "DuoX — Private one-to-one messaging" },
      {
        property: "og:description",
        content: "Private, ad-free one-to-one chat and file sharing between an owner and their partners.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  const { t } = useT();
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let done = false;
    setError(false);
    const hasLocal = () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const go = (signedIn: boolean) => {
      if (done) return;
      done = true;
      navigate({ to: signedIn ? "/home" : "/auth", replace: true });
    };
    // Fail-safe: never stay on the splash longer than ~3s, even on a slow network.
    const timeout = setTimeout(() => go(hasLocal()), 3000);

    Promise.all([supabase.auth.getSession(), new Promise((r) => setTimeout(r, 900))])
      .then(([{ data }]) => go(!!data.session))
      .catch(() => go(hasLocal()));

    return () => { done = true; clearTimeout(timeout); };
  }, [navigate, tick]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-primary px-6 text-primary-foreground">
      <img
        src={fpLogo}
        alt="DuoX"
        width={112}
        height={112}
        className="fp-step-in h-28 w-28 object-contain drop-shadow-2xl"
      />
      <h1 className="font-brand mt-6 text-4xl font-black tracking-[0.2em]">DUOX</h1>
      <p className="mt-1 text-sm text-primary-foreground/80">{t("tagline")}</p>
      {error ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-primary-foreground/90">{t("startupError")}</p>
          <button
            onClick={() => setTick((n) => n + 1)}
            className="mt-3 rounded-full bg-primary-foreground px-6 py-2 text-sm font-semibold text-primary"
          >
            {t("retry")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-10 h-1.5 w-40 overflow-hidden rounded-full bg-primary-foreground/25">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-foreground" />
          </div>
          <p className="mt-4 text-xs text-primary-foreground/70">{t("loading")}</p>
        </>
      )}
    </div>
  );
}
