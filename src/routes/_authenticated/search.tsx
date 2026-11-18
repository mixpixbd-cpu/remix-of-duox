import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Phone, QrCode, SearchX, UserPlus, X } from "lucide-react";
import { fetchMe, fetchPairs, presenceOf } from "@/lib/fp";
import { useT } from "@/lib/i18n";
import { FpAvatar } from "@/components/fp/Avatar";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Search — DuoX" },
      { name: "description", content: "Search your DuoX contacts and chats." },
      { property: "og:title", content: "Search — DuoX" },
      { property: "og:description", content: "Search your DuoX contacts and chats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { lang } = useT();
  const bn = lang === "bn";
  const router = useRouter();
  const [q, setQ] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const pairs = useQuery({
    queryKey: ["pairs", me.data?.id],
    queryFn: () => fetchPairs(me.data!.id),
    enabled: !!me.data,
  });
  const all = pairs.data ?? [];
  const term = q.trim().toLowerCase();
  const list = all.filter((p) => !term || p.other.display_name.toLowerCase().includes(term));
  const myName = me.data?.profile?.display_name ?? "";
  const meMatch = !term || myName.toLowerCase().includes(term);
  const isOwner = me.data?.role === "owner";
  const navigate = useNavigate();
  function goHome(tab: string) {
    sessionStorage.setItem("fp-tab", tab);
    navigate({ to: "/home" });
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <button aria-label="Back" onClick={() => router.history.back()} className="rounded-full p-2 text-primary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={bn ? "খুঁজুন…" : "Search…"}
          className="min-w-0 flex-1 rounded-full bg-muted px-4 py-2 text-base outline-none"
        />
        {q && (
          <button aria-label="Clear" onClick={() => setQ("")} className="rounded-full p-2 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/40 p-3">
        {!term && me.data && (
          <Card title={bn ? "দ্রুত কাজ" : "Quick Actions"}>
            <div className="flex justify-around py-3">
              {isOwner && (
                <button onClick={() => goHome("2")} className="flex flex-col items-center gap-1 text-xs text-foreground">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent"><UserPlus className="h-[22px] w-[22px] text-primary" /></span>
                  {bn ? "বন্ধু যোগ করুন" : "Add Friends"}
                </button>
              )}
              <button onClick={() => goHome("0")} className="flex flex-col items-center gap-1 text-xs text-foreground">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent"><QrCode className="h-[22px] w-[22px] text-primary" /></span>
                {bn ? "আমার পেয়ার কোড" : "My Pair Code"}
              </button>
            </div>
          </Card>
        )}
        {!term && all.length > 0 && (
          <Card title={bn ? "প্রায়ই যোগাযোগ" : "Frequently Contacted"}>
            <ul>
              {all.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center pl-3">
                  <Link to="/chat/$pairId" params={{ pairId: p.id }} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 active:bg-muted">
                    <FpAvatar name={p.other.display_name} photo={p.other.avatar_url} status={presenceOf(p.other.last_seen)} size={42} />
                    <span className="truncate text-[15px] font-semibold text-foreground">{p.other.display_name}</span>
                  </Link>
                  <Link to="/call/$pairId" params={{ pairId: p.id }} search={{ type: "voice" }} aria-label="Voice call" className="px-4 py-2.5 text-primary">
                    <Phone className="h-6 w-6 fill-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {(meMatch || list.length > 0) && (
          <Card title={bn ? "DuoX পরিচিতি" : "DuoX Contacts"}>
            <ul>
              {meMatch && me.data && (
                <li className="flex items-center gap-3 px-3 py-2.5">
                  <FpAvatar name={myName || "?"} status="online" size={42} />
                  <span className="text-[15px] font-semibold text-foreground">{myName}{bn ? "(আপনি)" : "(You)"}</span>
                </li>
              )}
              {list.map((p) => (
                <li key={p.id}>
                  <Link to="/chat/$pairId" params={{ pairId: p.id }} className="flex items-center gap-3 px-3 py-2.5 active:bg-muted">
                    <FpAvatar name={p.other.display_name} photo={p.other.avatar_url} status={presenceOf(p.other.last_seen)} size={42} />
                    <span className="truncate text-[15px] font-semibold text-foreground">{p.other.display_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {term && !meMatch && list.length === 0 && (
          <div className="flex flex-col items-center pt-16 text-center text-muted-foreground">
            <SearchX className="h-12 w-12" />
            <p className="mt-3 text-sm">{bn ? "কোনো ফলাফল পাওয়া যায়নি" : "No results found"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl bg-background shadow-sm">
      <h2 className="px-3 pt-3 text-xs font-semibold uppercase text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
