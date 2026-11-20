/** In-chat fun features: love tap, gifts, spin wheel, tic-tac-toe, watch together. */
export const FUN_KINDS = ["love", "gift", "spin", "game", "watch", "quiz", "ludo", "tap"] as const;
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

/* ---------- Gift with a secret love note ---------- */
export type GiftBody = { e: string; note?: string };
export function parseGift(s: string | null): GiftBody | null {
  if (!s) return null;
  const j = parse<GiftBody>(s.startsWith("{") ? s : null);
  return j?.e ? { e: j.e, note: j.note?.slice(0, 300) } : { e: s };
}

/* ---------- Couple quiz ---------- */
export const QUIZ = [
  { bn: "আমার সবচেয়ে প্রিয় খাবার কোনটা?", en: "My favourite food?", o: ["বিরিয়ানি", "ভর্তা-ভাত", "পিঠা", "ফুচকা"] },
  { bn: "আমার প্রিয় রং কোনটা?", en: "My favourite colour?", o: ["লাল", "নীল", "সবুজ", "গোলাপি"] },
  { bn: "অবসরে আমি কী করতে ভালোবাসি?", en: "What do I love in free time?", o: ["ঘুমাতে", "গল্প করতে", "রান্না করতে", "ঘুরতে"] },
  { bn: "আমার প্রিয় সময় কোনটা?", en: "My favourite time of day?", o: ["সকাল", "দুপুর", "বিকেল", "রাত"] },
  { bn: "আমাকে কিসে সবচেয়ে খুশি করে?", en: "What makes me happiest?", o: ["উপহার", "মিষ্টি কথা", "একসাথে সময়", "সারপ্রাইজ"] },
  { bn: "আমার প্রিয় ঋতু কোনটা?", en: "My favourite season?", o: ["শীত", "বর্ষা", "বসন্ত", "গ্রীষ্ম"] },
];
/** Asker sets a = own answer; partner replies with the same id and g = guess. */
export type Quiz = { id: string; q: number; by: string; a: number; g?: number };
export const quizCorrect = (z: Quiz) => z.g !== undefined && z.g === z.a;

/* ---------- Mini Ludo (2 players, 2 tokens each) ---------- */
export const LUDO_END = 24; // 0 = home, 1..24 track, 24 = finished
export type Ludo = { id: string; x: string; o: string; px: number[]; po: number[]; turn: string; last?: number };
export const newLudo = (me: string, other: string): Ludo => ({ id: crypto.randomUUID(), x: me, o: other, px: [0, 0], po: [0, 0], turn: me });
export const ludoWinner = (g: Ludo) => (g.px.every((p) => p === LUDO_END) ? g.x : g.po.every((p) => p === LUDO_END) ? g.o : null);
/** Can this token move with this roll? Need a 6 to leave home, exact roll to finish. */
export function canMove(pos: number, roll: number) {
  if (pos === LUDO_END) return false;
  if (pos === 0) return roll === 6;
  return pos + roll <= LUDO_END;
}
/** Shared track: X and O travel the same squares; O's square n is X's square ((n+11)%23)+1 to avoid instant collisions. */
const absPos = (side: "x" | "o", p: number) => (p === 0 || p === LUDO_END ? -1 : side === "x" ? p : ((p + 11) % 23) + 1);
/** Move token (or pass if nothing can move). Returns null if not allowed. A 6 gives another turn; landing on the rival sends it home. */
export function ludoMove(g: Ludo, me: string, roll: number, token: number | null): Ludo | null {
  if (ludoWinner(g) || g.turn !== me || roll < 1 || roll > 6) return null;
  const side = me === g.x ? "x" : "o";
  const mine = [...(side === "x" ? g.px : g.po)];
  const theirs = [...(side === "x" ? g.po : g.px)];
  const other = side === "x" ? g.o : g.x;
  if (token === null) {
    if (mine.some((p) => canMove(p, roll))) return null;
    return { ...g, turn: other, last: roll };
  }
  if (!canMove(mine[token]!, roll)) return null;
  mine[token] = mine[token] === 0 ? 1 : mine[token]! + roll;
  const at = absPos(side, mine[token]!);
  const rival = side === "x" ? "o" : "x";
  theirs.forEach((p, i) => { if (at > 0 && absPos(rival, p) === at) theirs[i] = 0; });
  const next = { ...g, last: roll, turn: roll === 6 ? me : other };
  return side === "x" ? { ...next, px: mine, po: theirs } : { ...next, po: mine, px: theirs };
}

/* ---------- Fastest finger ---------- */
export const TAP_SECONDS = 5;
export type Tap = { id: string; by: string; n: number; reply?: boolean };
export function tapResult(start: Tap, reply: Tap, me: string): "win" | "lose" | "draw" {
  if (start.n === reply.n) return "draw";
  const winner = start.n > reply.n ? start.by : reply.by;
  return winner === me ? "win" : "lose";
}

/* ---------- Watch together ---------- */
/** Watch state: at = epoch ms when position 0 would have played; p = paused at seconds. */
export type Watch = { url: string; at: number; p?: number; sync?: boolean };
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1]! : null;
}
/** Position (seconds) both players should be at now. */
export const watchPos = (w: Watch, now = Date.now()) => (w.p !== undefined ? w.p : watchOffset(w.at, now));
