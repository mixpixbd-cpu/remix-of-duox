/** Family library: categories and pure helpers (browser-safe). */
export type FeedCat = "recipe" | "mehendi" | "fashion" | "islamic" | "fun";
export const FEED_CATS: { key: FeedCat; bn: string; en: string; emoji: string }[] = [
  { key: "recipe", bn: "রান্না", en: "Recipes", emoji: "🍳" },
  { key: "mehendi", bn: "মেহেদি ও রূপচর্চা", en: "Mehendi & beauty", emoji: "🌿" },
  { key: "fashion", bn: "জামা, শাড়ি ও গয়না", en: "Clothes & jewellery", emoji: "👗" },
  { key: "islamic", bn: "বয়ান ও তিলাওয়াত", en: "Islamic", emoji: "🕌" },
  { key: "fun", bn: "হাসির ভিডিও", en: "Family fun", emoji: "😄" },
];
export type FeedItem = { id: string; pair_id: string; added_by: string; category: string; kind: string; title: string | null; file_path: string; file_type: string | null; poster_path: string | null; status: string; created_at: string };

/** AI reply → stored status. Anything not a clear SAFE is blocked. */
export function verdictFrom(reply: string | null | undefined): "safe" | "blocked" {
  return (reply ?? "").trim().toUpperCase().startsWith("SAFE") ? "safe" : "blocked";
}

export function kindOf(mime: string): "image" | "video" | "audio" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** Chat text for the one-tap "আবদার ❤️" wish. */
export function wishText(title: string | null, cat: string): string {
  const c = FEED_CATS.find((x) => x.key === cat);
  return `❤️ আমার পছন্দ / আবদার: ${title?.trim() || c?.bn || "এটা"}`;
}
