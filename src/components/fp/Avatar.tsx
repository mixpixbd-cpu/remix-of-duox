import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initials, type Presence } from "@/lib/fp";

const DOT: Record<Presence, string> = {
  online: "#22c55e",
  away: "#0ea5e9",
  offline: "#94a3b8",
};

export function FpAvatar({
  name,
  online,
  status,
  size = 48,
  photo,
}: {
  name: string;
  online?: boolean;
  status?: Presence;
  size?: number;
  /** Storage path of the profile photo (profiles.avatar_url). */
  photo?: string | null | undefined;
}) {
  const s: Presence | undefined = status ?? (online === undefined ? undefined : online ? "online" : "offline");
  const url = useQuery({
    queryKey: ["signed", photo], enabled: !!photo, staleTime: 50 * 60_000,
    queryFn: async () => (await supabase.storage.from("fixedpair-profile").createSignedUrl(photo!, 3600)).data?.signedUrl ?? null,
  });
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url.data ? (
        <img src={url.data} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-accent font-bold text-accent-foreground"
          style={{ fontSize: size * 0.4 }}
        >
          {initials(name)}
        </div>
      )}
      {s && (
        <span
          className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background"
          style={{ backgroundColor: DOT[s] }}
        >
          {s === "online" && (
            <svg viewBox="0 0 12 12" className="h-2 w-2" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2.5 6.4l2.4 2.4 4.6-5" />
            </svg>
          )}
        </span>
      )}
    </div>
  );
}
