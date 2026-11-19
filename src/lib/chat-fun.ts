/** In-chat fun features: love tap, gifts, spin wheel, tic-tac-toe, watch together. */
export const FUN_KINDS = ["love", "gift", "spin", "game", "watch"] as const;
export type FunKind = (typeof FUN_KINDS)[number];
export const isFunKind = (k: string): k is FunKind => (FUN_KINDS as readonly string[]).includes(k);

export const GIFTS = [
  { e: "🌹", bn: "লাল গোলাপ", en: "Red rose" },
  { e: "🍫", bn: "চকলেট বক্স", en: "Chocolate box" },
  { e: "💐", bn: "ফুলের তোড়া", en: "Bouquet" },
  { e: "💍", bn: "আংটি", en: "Ring" },
  { e: "🧸", bn: "টেডি বিয়ার", en: "Teddy bear" },
  { e: "🎂", bn: "কেক", en: "Cake" },
];

export const WHEEL = [
  { bn: "৫টা মিষ্টি কথা লিখুন 💌", en: "Write 5 sweet words 💌" },
  { bn: "একটা ভয়েস মেসেজে গান 🎤", en: "Sing in a voice note 🎤" },
  { bn: "প্রথম দেখার স্মৃতি বলুন 🌸", en: "Tell your first-meeting memory 🌸" },
  { bn: "আজ রাতের রান্না আপনি ঠিক করুন 🍲", en: "You pick tonight's dinner 🍲" },
  { bn: "একটা সুন্দর ছবি পাঠান 📸", en: "Send a lovely photo 📸" },
  { bn: "৩টা প্রশংসা করুন ✨", en: "Give 3 compliments ✨" },
];

/** Tic-tac-toe: board is 9 chars of "X" | "O" | "-". X = game starter. */
export type Game = { b: string; x: string; o: string; id: string };
const LINES: [number, number, number][] = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function winner(b: string): "X" | "O" | "draw" | null {
  for (const [a, c, d] of LINES) if (b[a] !== "-" && b[a] === b[c] && b[a] === b[d]) return b[a] as "X" | "O";
  return b.includes("-") ? null : "draw";
}
export function turnOf(g: Game): string {
  const xs = [...g.b].filter((c) => c === "X").length;
  const os = [...g.b].filter((c) => c === "O").length;
  return xs === os ? g.x : g.o;
}
/** Returns the next game state, or null if the move is not allowed. */
export function play(g: Game, cell: number, userId: string): Game | null {
  if (winner(g.b) || g.b[cell] !== "-" || turnOf(g) !== userId) return null;
  const mark = userId === g.x ? "X" : "O";
  return { ...g, b: g.b.slice(0, cell) + mark + g.b.slice(cell + 1) };
}
export function parse<T>(s: string | null): T | null {
  try { return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
/** Watch together: seconds into the media both players should be at now. */
export function watchOffset(startedAt: number, now = Date.now()) {
  return Math.max(0, (now - startedAt) / 1000);
}
