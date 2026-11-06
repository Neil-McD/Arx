import { v } from "convex/values";

import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import { validateProfileHandle } from "../shared/profileHandle";
import { validateProfileDisplayName } from "../shared/profileText";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { getUniqueUserByNormalizedHandle, getUniqueUserProfileDetailByUserId } from "./profileCore";

// Nobody fills in a form before getting into a community: a new account starts
// with the name and photo its sign-in gave (Google's), and a handle made from
// the name. Everything here only fills what's missing; people change any of it
// later in their profile.

function handleBase(name: string, email: string): string {
  const source = name || email.split("@")[0] || "";
  const base = source
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `member${base ? `-${base}` : ""}`;
}

export async function generateUniqueHandle(ctx: any, name: string, email: string, userId: any): Promise<string> {
  const base = handleBase(name, email);
  const candidates = [base, ...Array.from({ length: 30 }, (_, index) => `${base}-${index + 2}`)];
  for (const candidate of candidates) {
    const valid = validateProfileHandle(candidate);
    if (!valid.ok) continue;
    const taken = (await getUniqueUserByNormalizedHandle<any>(ctx, valid.normalizedHandle)) as { _id: any } | null;
    if (!taken || String(taken._id) === String(userId)) return valid.handle;
  }
  for (;;) {
    const candidate = `${base.slice(0, 20)}-${Math.random().toString(36).slice(2, 8)}`;
    const valid = validateProfileHandle(candidate);
    if (valid.ok && !(await getUniqueUserByNormalizedHandle(ctx, valid.normalizedHandle))) return valid.handle;
  }
}

function starterName(user: any): string {
  const fromSignIn = validateProfileDisplayName(user?.displayName);
  if (fromSignIn.ok && fromSignIn.value) return fromSignIn.value;
  const local = String(user?.email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  const fromEmail = validateProfileDisplayName(local.replace(/\b\w/g, (letter) => letter.toUpperCase()));
  return fromEmail.ok && fromEmail.value ? fromEmail.value : "Member";
}

export async function ensureStarterProfile(ctx: any, userId: any, nowMs: number): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const detail = (await getUniqueUserProfileDetailByUserId<any>(ctx, userId)) as any;
  const name = String(detail?.displayName ?? "").trim() || starterName(user);
  if (!validateProfileHandle(user.handle).ok) {
    const handle = await generateUniqueHandle(ctx, name, String(user.email ?? ""), userId);
    await ctx.db.patch(userId, { handle, normalizedHandle: handle, updatedAt: nowMs });
  }
  const photo = String(user.avatarUrl ?? "").trim() || undefined;
  if (!detail) {
    await ctx.db.insert("userProfileDetails", { userId, displayName: name, avatarUrl: photo, createdAt: nowMs, updatedAt: nowMs });
    return;
  }
  const patch: Record<string, unknown> = {};
  if (!String(detail.displayName ?? "").trim()) patch.displayName = name;
  if (!detail.avatarUrl && !detail.avatarStorageId && photo) patch.avatarUrl = photo;
  if (Object.keys(patch).length) await ctx.db.patch(detail._id, { ...patch, updatedAt: nowMs });
}

// Clicking Join (free, approval or paid) under "By joining you agree to
// Polynet's Terms and Privacy & AI Data Policy" is the acceptance: recorded
// with the versions shown, and the starter profile filled, so joining never
// stops at a setup form.
export async function acceptCommunityJoin(ctx: any, userId: any, nowMs: number): Promise<void> {
  await ensureStarterProfile(ctx, userId, nowMs);
  await recordCurrentPlatformLegalAcceptance(ctx, {
    userId,
    termsVersion: TERMS_OF_SERVICE_DOCUMENT.version,
    privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: "community_join",
    acceptedAt: nowMs,
  });
}

export const acceptCommunityJoinInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await acceptCommunityJoin(ctx, args.userId, Date.now());
  },
});

// One pass for accounts made before starter profiles: run once per deployment
// (staging, then production with the release); a page at a time, then itself.
export const backfillStarterProfilesInternal = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const page = await ctx.db.query("users").paginate({ cursor: args.cursor ?? null, numItems: 100 });
    let filled = 0;
    for (const user of page.page as any[]) {
      const detail = (await getUniqueUserProfileDetailByUserId<any>(ctx, user._id)) as any;
      if (validateProfileHandle(user.handle).ok && String(detail?.displayName ?? "").trim()) continue;
      await ensureStarterProfile(ctx, user._id, nowMs);
      filled += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.starterProfile.backfillStarterProfilesInternal, { cursor: page.continueCursor });
    }
    return { filled, done: page.isDone };
  },
});
