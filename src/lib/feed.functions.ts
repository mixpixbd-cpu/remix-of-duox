import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROMPT =
  "You are a strict family-decency filter for a conservative Muslim family app. Look at the image. " +
  "Answer BLOCK if it shows nudity, revealing clothing (bare thighs, cleavage, swimwear, lingerie), sexual or romantic intimacy, " +
  "violence, gore, alcohol, drugs, gambling, obscene gestures or offensive text. Answer SAFE for modest everyday content " +
  "such as food, cooking, henna/mehendi on hands, modest clothing, sarees, jewellery, Islamic content, nature, kids playing. " +
  "Reply with exactly one word: SAFE or BLOCK.";

/** Runs the AI decency check on one library item and records the verdict. Pure verdict parsing lives in feed.ts. */
export const moderateFeedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    // The caller must be able to see the item (pair member) — checked with their own permissions.
    const { data: item } = await context.supabase.from("feed_items").select("id, kind, file_path, poster_path, pair_id").eq("id", data.id).maybeSingle();
    if (!item) throw new Error("Not allowed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verdictFrom } = await import("@/lib/feed");
    const set = async (status: string) => { await supabaseAdmin.from("feed_items").update({ status }).eq("id", item.id); return status; };

    const imgPath = item.kind === "image" ? item.file_path : item.poster_path;
    if (!imgPath) return set(item.kind === "audio" ? "safe" : "blocked");
    const { data: signed } = await supabaseAdmin.storage.from("fixedpair-files").createSignedUrl(imgPath, 600);
    if (!signed?.signedUrl) return set("blocked");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: signed.signedUrl } }] }],
      }),
    });
    if (!res.ok) return set("pending"); // stays hidden from the partner until a later check succeeds
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return set(verdictFrom(j.choices?.[0]?.message?.content));
  });
