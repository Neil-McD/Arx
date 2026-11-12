// One door (docs/specs/builder-modalities-v0.md): called where a member's
// access may have changed (joining, a payment, a lapse, leaving, removal, a
// pod). Each of the community's connected apps with a webhook gets a signed,
// thin "access.changed" (convex/connectedApps.ts delivers it) and asks the
// access check again. Cheap when there is no such app: one indexed read.
// Its own module so billing and room code can call it without cycles.
import { internal } from "./_generated/api";

export async function notifyConnectedApps(ctx: any, communityId: any, userId: any) {
  const apps = (await ctx.db.query("connectedApps").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect())
    .filter((row: any) => !row.revokedAt && row.webhookUrl);
  if (!apps.length) return;
  const user = await ctx.db.get(userId) as any;
  const email = user?.emailVerifiedAt ? String(user.normalizedEmail ?? user.email ?? "").trim().toLowerCase() : "";
  if (!email) return;
  const nowMs = Date.now();
  for (const app of apps) {
    const deliveryId = await ctx.db.insert("connectedAppDeliveries", {
      appId: app.appId, communityId, eventId: `evt_${crypto.randomUUID().replace(/-/g, "")}`, type: "access.changed", email,
      status: "pending", attempts: 0, nextAttemptAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.scheduler.runAfter(0, internal.connectedApps.deliverConnectedAppWebhookInternal, { deliveryId });
  }
}
