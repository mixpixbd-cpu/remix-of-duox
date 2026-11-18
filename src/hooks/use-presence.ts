import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Marks the signed-in user as online by updating last_seen every 60s. */
export function usePresence(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    const ping = () =>
      supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", userId);
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [userId]);
}
