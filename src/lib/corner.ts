/** Couple corner: shared pet, flower garden, memories and special dates. */
export type Pet = { fed?: string; bath?: string; pat?: string; xp?: number };
export type Garden = { water?: string; sun?: string; flowers?: number; day?: string };
export type Dates = { anniversary?: string; bdayOwner?: string; bdayPartner?: string };
export type PetAction = "fed" | "bath" | "pat";

const H12 = 12 * 3600 * 1000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** 0–3: how many care actions happened in the last 12 hours. */
export function petHappiness(p: Pet, now = Date.now()) {
  return (["fed", "bath", "pat"] as const).filter((k) => p[k] && now - new Date(p[k]!).getTime() < H12).length;
}
export const petLevel = (p: Pet) => 1 + Math.floor((p.xp ?? 0) / 10);
export function carePet(p: Pet, a: PetAction, now = new Date()): Pet {
  return { ...p, [a]: now.toISOString(), xp: (p.xp ?? 0) + 1 };
}
export function petFace(p: Pet, now = Date.now()) {
  return ["😿", "🐱", "😺", "😻"][petHappiness(p, now)]!;
}

/** Water + sun on the same day blooms one new flower (once per day). */
export function careGarden(g: Garden, a: "water" | "sun", now = new Date()): Garden {
  const today = dayKey(now);
  const next: Garden = { ...g, [a]: now.toISOString() };
  const both = [next.water, next.sun].every((t) => t && t.slice(0, 10) === today);
  if (both && g.day !== today) { next.flowers = (g.flowers ?? 0) + 1; next.day = today; }
  return next;
}
export function plantStage(g: Garden) {
  const f = g.flowers ?? 0;
  return f === 0 ? "🌱" : f < 3 ? "🌿" : f < 7 ? "🪴" : "🌳";
}

/** Special-date reminders that fall on today (month+day match). */
export function todaysDates(d: Dates, now = new Date()) {
  const md = now.toISOString().slice(5, 10);
  const out: { key: keyof Dates; years: number }[] = [];
  (Object.keys(d) as (keyof Dates)[]).forEach((k) => {
    const v = d[k];
    if (v && v.slice(5, 10) === md) out.push({ key: k, years: now.getUTCFullYear() - Number(v.slice(0, 4)) });
  });
  return out;
}
/** Media from the same month+day in an earlier year ("on this day"). */
export function onThisDay<T extends { created_at: string }>(items: T[], now = new Date()) {
  const md = now.toISOString().slice(5, 10), y = now.getUTCFullYear();
  return items.filter((i) => i.created_at.slice(5, 10) === md && Number(i.created_at.slice(0, 4)) < y);
}
