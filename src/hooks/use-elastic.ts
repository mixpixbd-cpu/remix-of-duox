import { useEffect, type RefObject } from "react";

/**
 * Smooth native scrolling for a scroll container.
 * No JS touch blocking (which caused jank) — the browser compositor handles
 * momentum, while overscroll is contained so the page behind never moves.
 */
export function useElastic(ref: RefObject<HTMLElement | null>, opts: { disabled?: boolean } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || opts.disabled) return;
    el.classList.add("smooth-scroll");
    return () => el.classList.remove("smooth-scroll");
  }, [ref, opts.disabled]);
}
