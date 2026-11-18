import { createServerFn } from "@tanstack/react-start";

export type LinkPreview = { url: string; title: string | null; description: string | null; image: string | null; site: string };

function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i");
    const m = html.match(re) ?? html.match(re2);
    if (m?.[1]) return decode(m[1]);
  }
  return null;
}
function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Fetches Open Graph title/description/image for a URL shown in chat. */
export const getLinkPreview = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => {
    const u = new URL(d.url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("Bad URL");
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error("Bad URL");
    return { url: u.toString() };
  })
  .handler(async ({ data }): Promise<LinkPreview> => {
    const site = new URL(data.url).hostname.replace(/^www\./, "");
    try {
      const res = await fetch(data.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; FixedPairBot/1.0)", accept: "text/html" }, signal: AbortSignal.timeout(6000) });
      const html = (await res.text()).slice(0, 200_000);
      const title = meta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null);
      let image = meta(html, ["og:image", "twitter:image"]);
      if (image) { try { image = new URL(image, data.url).toString(); } catch { image = null; } }
      return { url: data.url, title: title ? decode(title) : null, description: meta(html, ["og:description", "description", "twitter:description"]), image, site };
    } catch {
      return { url: data.url, title: null, description: null, image: null, site };
    }
  });
