// Shared, browser-safe helpers for FixedPair ID + Token login.
export function idToEmail(id: string) {
  const t = id.trim().normalize("NFC").toLowerCase();
  // Plain English IDs keep their old mapping; any other script is hex-encoded so it fits an email.
  if (/^[a-z0-9._-]+$/.test(t)) return `${t}@fixedpair.app`;
  const hex = Array.from(new TextEncoder().encode(t), (b) => b.toString(16).padStart(2, "0")).join("");
  return `u-${hex}@fixedpair.app`;
}

export function validId(id: string) {
  const t = id.trim().normalize("NFC");
  return /^[\p{L}\p{M}\p{N}._-]+$/u.test(t) && [...t].length >= 3 && [...t].length <= 32;
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Owner password = hash(token + PIN); Partner password = hash(token)
export function ownerSecret(token: string, pin: string) {
  return sha256Hex(`owner:${token.trim()}:${pin.trim()}`);
}
export function partnerSecret(token: string) {
  return sha256Hex(`partner:${token.trim()}`);
}

export function newToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
