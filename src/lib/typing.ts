import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const chan = (pairId: string) => `typing-${pairId}`;

/** In the chat room: returns a function to call on every keystroke (throttled). */
export function useTypingSender(pairId: string, userId?: string) {
  const ref = useRef<RealtimeChannel | null>(null);
  const last = useRef(0);
  useEffect(() => {
    if (!userId) return;
    const c = supabase.channel(chan(pairId)).subscribe();
    ref.current = c;
    return () => {
      supabase.removeChannel(c);
      ref.current = null;
    };
  }, [pairId, userId]);
  return () => {
    const now = Date.now();
    if (!ref.current || !userId || now - last.current < 2000) return;
    last.current = now;
    ref.current.send({ type: "broadcast", event: "typing", payload: { user: userId } });
  };
}

/** In the chat list: set of pairIds where the other person is typing right now. */
export function useTypingWatch(pairIds: string[], myId?: string) {
  const [typing, setTyping] = useState<Record<string, number>>({});
  const key = pairIds.join(",");
  useEffect(() => {
    if (!myId || !pairIds.length) return;
    const chans = pairIds.map((id) =>
      supabase
        .channel(chan(id))
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.user === myId) return;
          setTyping((t) => ({ ...t, [id]: Date.now() }));
        })
        .subscribe(),
    );
    const tick = setInterval(() => {
      setTyping((t) => {
        const n: Record<string, number> = {};
        for (const [k, v] of Object.entries(t)) if (Date.now() - v < 4000) n[k] = v;
        return Object.keys(n).length === Object.keys(t).length ? t : n;
      });
    }, 1000);
    return () => {
      clearInterval(tick);
      chans.forEach((c) => supabase.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, myId]);
  return (pairId: string) => !!typing[pairId];
}
