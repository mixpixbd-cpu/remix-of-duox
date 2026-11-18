import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "partner";
export type Profile = { id: string; display_name: string; pair_code: string; last_seen: string; avatar_url?: string | null; cover_url?: string | null; bio?: string | null };
export type PairCtl = { chat_paused: boolean; disappearing_seconds: number; save_to_gallery_blocked: boolean; settings: unknown };
export type PairRow = { id: string; owner_id: string; partner_id: string; created_at: string; other: Profile; ctl: PairCtl | null };

export function isOnline(lastSeen?: string) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

export type Presence = "online" | "away" | "offline";
export function presenceOf(lastSeen?: string): Presence {
  if (!lastSeen) return "offline";
  const d = Date.now() - new Date(lastSeen).getTime();
  return d < 2 * 60 * 1000 ? "online" : d < 60 * 60 * 1000 ? "away" : "offline";
}

export async function fetchMe() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("no-session");
  const load = () => Promise.all([
    supabase.from("profiles").select("*").eq("id", u.user!.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", u.user!.id),
  ]);
  let [{ data: profile }, { data: roles }] = await load();
  if (!profile || !roles?.length) {
    // Self-repair: create missing profile/role rows (e.g. after a remix), then reload.
    const { repairMyAccount } = await import("@/lib/login.functions");
    await repairMyAccount().catch(() => null);
    [{ data: profile }, { data: roles }] = await load();
  }
  const role: Role = roles?.some((r) => r.role === "owner") ? "owner" : "partner";
  return { id: u.user.id, email: u.user.email ?? "", role, profile: profile as Profile | null };
}

export async function fetchPairs(myId: string): Promise<PairRow[]> {
  const { data: pairs, error } = await supabase
    .from("pairs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const otherIds = (pairs ?? []).map((p) => (p.owner_id === myId ? p.partner_id : p.owner_id));
  if (!otherIds.length) return [];
  const [{ data: profiles }, { data: ctls }] = await Promise.all([
    supabase.from("profiles").select("*").in("id", otherIds),
    supabase.from("pair_controls").select("pair_id, chat_paused, disappearing_seconds, save_to_gallery_blocked, settings").in("pair_id", (pairs ?? []).map((p) => p.id)),
  ]);
  return (pairs ?? []).map((p) => {
    const otherId = p.owner_id === myId ? p.partner_id : p.owner_id;
    const found = (profiles ?? []).find((x) => x.id === otherId) as Profile | undefined;
    const ctl = (ctls ?? []).find((c) => c.pair_id === p.id) ?? null;
    const other = found ?? { id: otherId, display_name: "—", pair_code: "", last_seen: "" };
    // Admin "ghost mode": partners never see when the admin is online or was last seen.
    const ghost = p.partner_id === myId && (ctl?.settings as Record<string, unknown> | null)?.["g_ghost"] === true;
    return { ...p, ctl, other: ghost ? { ...other, last_seen: "" } : other };
  });
}

export function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export type LastMsg = { pair_id: string; body: string | null; file_name: string | null; kind: string; created_at: string; sender_id: string; deleted_at: string | null; delivered_at?: string | null; read_at?: string | null };

/** Latest message per pair, for the chat list preview. */
export async function fetchLastMessages(pairIds: string[]): Promise<Record<string, LastMsg>> {
  if (!pairIds.length) return {};
  const { data } = await supabase
    .from("messages")
    .select("pair_id, body, file_name, kind, created_at, sender_id, deleted_at, delivered_at, read_at")
    .in("pair_id", pairIds)
    .order("created_at", { ascending: false })
    .limit(300);
  const out: Record<string, LastMsg> = {};
  for (const m of (data ?? []) as LastMsg[]) if (!out[m.pair_id]) out[m.pair_id] = m;
  return out;
}

export type Story = { id: string; author_id: string; caption: string | null; bg_color: string; media_path: string | null; created_at: string; expires_at: string };

export async function fetchStories(): Promise<Story[]> {
  const { data, error } = await supabase.from("stories").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Story[];
}

export function shortTime(iso: string, lang: string) {
  const d = new Date(iso);
  const loc = lang === "bn" ? "bn-BD" : "en-GB";
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(loc, { day: "numeric", month: "short" });
}
