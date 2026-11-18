import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { idToEmail, newToken, ownerSecret, partnerSecret, sha256Hex, validId } from "./login";
import { mergePolicy, policyToPair } from "./policy";


async function idOwnerExists() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Check the accounts themselves, so missing role rows never re-open the setup screen.
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).some(
    (u) => u.email?.endsWith("@fixedpair.app") && (u.user_metadata as { role?: string })?.role === "owner",
  );
}


// Make sure every account has its profile and role rows. Does not rely on the
// database signup trigger, which a remix can leave missing.
async function ensureAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = u.user;
  if (!user) return;
  const meta = (user.user_metadata ?? {}) as { role?: string; display_name?: string };
  const app = (user.app_metadata ?? {}) as { role?: string };
  let role: "owner" | "partner" = (app.role ?? meta.role) === "owner" ? "owner" : "partner";
  // A user who is someone's partner can never become owner by editing their own metadata.
  if (role === "owner" && app.role !== "owner") {
    const { count } = await supabaseAdmin.from("pairs").select("id", { count: "exact", head: true }).eq("partner_id", userId);
    if (count) role = "partner";
  }
  const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!prof) {
    const { data: code } = await supabaseAdmin.rpc("generate_pair_code");
    await supabaseAdmin.from("profiles").insert({
      id: userId,
      display_name: meta.display_name || (user.email ?? "user").split("@")[0] || "user",
      pair_code: String(code ?? Math.random().toString(36).slice(2, 10).toUpperCase()),
    });
  }
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r) => r.role === role)) await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
  if (app.role !== role) await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { ...app, role } });
}

export const repairMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAccount(context.userId);
    return { ok: true };
  });

export const getOwnerStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { hasOwner: await idOwnerExists() };
});

async function findUserByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

function newRecoveryCode() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  const hex = Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export const setupOwner = createServerFn({ method: "POST" })
  .inputValidator((d: { ownerId: string; pin: string }) => d)
  .handler(async ({ data }) => {
    if (!validId(data.ownerId)) throw new Error("Owner ID: 3-32 letters/numbers (any language)");
    if (!/^\d{4,6}$/.test(data.pin)) throw new Error("Admin PIN must be 4-6 digits");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await idOwnerExists()) throw new Error("Owner already set up");
    const email = idToEmail(data.ownerId);
    // Remove a broken leftover account (no role) with the same ID so setup can finish.
    const stale = await findUserByEmail(email);
    if (stale) {
      // Never delete a real admin account: if roles are missing, restore them instead.
      if ((stale.user_metadata as { role?: string })?.role === "owner") {
        await ensureAccount(stale.id);
        throw new Error("This admin already exists. Sign in with your Token and PIN, or use Forgot.");
      }
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", stale.id);
      if (roles && roles.length) throw new Error("This ID is already in use");
      await supabaseAdmin.auth.admin.deleteUser(stale.id);
    }
    const token = newToken();
    const recoveryCode = newRecoveryCode();
    const { data: made, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: await ownerSecret(token, data.pin),
      email_confirm: true,
      user_metadata: { role: "owner", display_name: data.ownerId.trim() },
      app_metadata: { role: "owner", recovery_hash: await sha256Hex(`recovery:${recoveryCode}`) },
    });
    if (error || !made.user) throw new Error(error?.message ?? "Could not create owner");
    await ensureAccount(made.user.id);
    return { token, recoveryCode };
  });

// Owner forgot Token/PIN: ID + Recovery Code -> new Token + new PIN.
export const recoverOwner = createServerFn({ method: "POST" })
  .inputValidator((d: { ownerId: string; recoveryCode: string; newPin: string }) => d)
  .handler(async ({ data }) => {
    if (!/^\d{4,6}$/.test(data.newPin)) throw new Error("New PIN must be 4-6 digits");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const u = await findUserByEmail(idToEmail(data.ownerId));
    const hash = await sha256Hex(`recovery:${data.recoveryCode.trim().toUpperCase()}`);
    if (!u || (u.app_metadata as { recovery_hash?: string })?.recovery_hash !== hash)
      throw new Error("ID or Recovery Code is wrong");
    const token = newToken();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
      password: await ownerSecret(token, data.newPin),
    });
    if (error) throw new Error("Could not reset. Try again.");
    return { token };
  });

// Owner renews a partner's token (partner forgot it).
export const renewPartnerToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerUserId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: pair } = await context.supabase
      .from("pairs").select("id").eq("owner_id", context.userId).eq("partner_id", data.partnerUserId).maybeSingle();
    if (!pair) throw new Error("Only the owner can renew this token");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = newToken();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.partnerUserId, {
      password: await partnerSecret(token),
    });
    if (error) throw new Error("Could not renew token");
    return { token };
  });

// An existing admin creates another admin account (own ID + PIN).
export const createAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adminId: string; pin: string; name?: string }) => d)
  .handler(async ({ data, context }) => {
    if (!validId(data.adminId)) throw new Error("Admin ID: 3-32 letters/numbers (any language)");
    if (!/^\d{4,6}$/.test(data.pin)) throw new Error("PIN must be 4-6 digits");
    const { data: isOwner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    if (!isOwner) throw new Error("Only an admin can add admin accounts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await findUserByEmail(idToEmail(data.adminId))) throw new Error("This ID is already in use");
    const token = newToken();
    const recoveryCode = newRecoveryCode();
    const { data: made, error } = await supabaseAdmin.auth.admin.createUser({
      email: idToEmail(data.adminId),
      password: await ownerSecret(token, data.pin),
      email_confirm: true,
      user_metadata: { role: "owner", display_name: (data.name || data.adminId).trim() },
      app_metadata: { role: "owner", recovery_hash: await sha256Hex(`recovery:${recoveryCode}`) },
    });
    if (error || !made.user) throw new Error(error?.message ?? "Could not create admin");
    await ensureAccount(made.user.id);
    return { adminId: data.adminId.trim().toLowerCase(), token, recoveryCode };
  });

export const createPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; name?: string }) => d)
  .handler(async ({ data, context }) => {
    if (!validId(data.partnerId)) throw new Error("Partner ID: 3-32 letters/numbers (any language)");
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Only the owner can create partners");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = newToken();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: idToEmail(data.partnerId),
      password: await partnerSecret(token),
      email_confirm: true,
      user_metadata: { role: "partner", display_name: (data.name || data.partnerId).trim() },
      app_metadata: { role: "partner" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create partner");
    await ensureAccount(created.user.id);
    const { data: pair, error: pe } = await supabaseAdmin
      .from("pairs")
      .insert({ owner_id: context.userId, partner_id: created.user.id })
      .select("id")
      .single();
    if (pe || !pair) throw new Error(pe?.message ?? "Could not create partner");
    // New partners start with the admin's current Partner Setup rules.
    const { data: cfg } = await supabaseAdmin.from("admin_settings").select("config").eq("owner_id", context.userId).maybeSingle();
    if (cfg?.config) {
      const { cols, settings } = policyToPair(mergePolicy(cfg.config));
      await supabaseAdmin.from("pair_controls").upsert({ pair_id: pair.id, ...cols, settings, updated_at: new Date().toISOString() });
    }
    return { partnerId: data.partnerId.trim(), token, pairId: pair.id };
  });

// Admin activity log: when each of my partners last signed in.
export const getPartnerActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    if (!isOwner) throw new Error("Only the owner can view this");
    const { data: pairs } = await context.supabase.from("pairs").select("partner_id").eq("owner_id", context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: { partnerId: string; loginId: string; lastSignIn: string | null; createdAt: string | null }[] = [];
    for (const p of pairs ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.partner_id);
      out.push({ partnerId: p.partner_id, loginId: (u.user?.email ?? "").split("@")[0] ?? "", lastSignIn: u.user?.last_sign_in_at ?? null, createdAt: u.user?.created_at ?? null });
    }
    return out;
  });
