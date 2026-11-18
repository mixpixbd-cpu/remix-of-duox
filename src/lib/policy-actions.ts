import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { mergePolicy, policyToPair, type Policy } from "@/lib/policy";

/** The admin's saved rules (one row per admin). */
export function useAdminPolicy(ownerId: string) {
  const qc = useQueryClient();
  const key = ["admin-policy", ownerId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await supabase.from("admin_settings").select("config").eq("owner_id", ownerId).maybeSingle();
      return mergePolicy(data?.config);
    },
  });
  const policy = q.data ?? mergePolicy(null);

  /** Saves the rule(s) and copies them to every partner chat. Throws on failure. */
  async function save(patch: Partial<Policy>) {
    const next = { ...policy, ...patch };
    qc.setQueryData(key, next);
    try {
      const { error } = await supabase.from("admin_settings").upsert({ owner_id: ownerId, config: next as unknown as Json, updated_at: new Date().toISOString() });
      if (error) throw error;
      await applyToAllPairs(ownerId, patch);
      qc.invalidateQueries({ queryKey: ["pairs"] });
      qc.invalidateQueries({ queryKey: ["controls"] });
    } catch (e) {
      qc.invalidateQueries({ queryKey: key });
      throw e;
    }
  }
  return { policy, save, loading: q.isLoading };
}

export async function applyToAllPairs(ownerId: string, patch: Partial<Policy>) {
  const { cols, settings } = policyToPair(patch);
  const { data: pairs, error } = await supabase.from("pairs").select("id").eq("owner_id", ownerId);
  if (error) throw error;
  const ids = (pairs ?? []).map((p) => p.id);
  if (!ids.length) return;
  const { data: rows } = await supabase.from("pair_controls").select("pair_id, settings").in("pair_id", ids);
  const results = await Promise.all(
    ids.map((id) => {
      const old = (rows?.find((r) => r.pair_id === id)?.settings ?? {}) as Record<string, Json>;
      return supabase.from("pair_controls").upsert({
        pair_id: id,
        ...cols,
        settings: { ...old, ...settings } as Json,
        updated_at: new Date().toISOString(),
      });
    }),
  );
  const bad = results.find((r) => r.error);
  if (bad?.error) throw bad.error;
}

/** Partner presses SOS: the admin's phone shows an alert. */
export async function sendSos(myId: string) {
  let loc: { lat: number; lng: number } | null = null;
  try {
    loc = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { timeout: 6000, maximumAge: 60_000 }),
    );
  } catch { /* location is optional */ }
  const { error } = await supabase.from("device_reports").insert({
    partner_id: myId,
    kind: "sos",
    data: { at: new Date().toISOString(), ...(loc ?? {}) } as Json,
  });
  if (error) throw error;
}
