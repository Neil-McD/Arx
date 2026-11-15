// Pods as community facts (docs/specs/agent-system-end-state.md, pods slice A):
// pods/ and pods/<slug>/pod.md in the guide's folder, drawn from the same
// records as the Pods page (convex/communityPods.ts). What a lens sees:
// - inside a pod (what it's for, hosts, who's in it, seats, next call, its
//   room): people in it, builders, and the guide working in that pod;
// - outside a listed pod (what it's for, hosts, seats left, what you get,
//   price): any member, and the guide in public, so it can point people to it;
// - a hidden pod you can't enter: nothing, not even that it exists.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { normalizeIdValue } from "./communityCore";
import { displayName } from "./communityFounderBrief";
import { nextPodCall } from "./communityEvents";
import { podPriceOf } from "./communityPodPayments";
import { hostNames, isHost, memberGrants, podRecord } from "./communityPods";
import { formatPrice } from "../shared/communityMemberRecords";
import type { LensName } from "../shared/lens";

const PODS_CAP = 50;
const NAMES_SHOWN = 30;

const lensArg = v.union(v.literal("member_private"), v.literal("member_own_ai"), v.literal("member_site"),
  v.literal("builder_private"), v.literal("builder_own_ai"), v.literal("guide_public"), v.literal("worker"), v.literal("retired"));

type PodSight = "inside" | "outside" | null;

// How this lens sees one pod.
async function sightOf(ctx: any, args: { communityId: any; userId: any; lens: LensName; podRoomId?: string | null }, channel: any, record: any): Promise<PodSight> {
  if (!channel || channel.accessMode !== "restricted" || channel.status !== "active") return null;
  if (args.lens === "retired" || args.lens === "worker") return null;
  const listed = record?.visibility === "listed";
  if (args.lens === "builder_private" || args.lens === "builder_own_ai") return "inside";
  if (args.lens === "guide_public") {
    // The guide is inside only the pod it is working in right now.
    return args.podRoomId && String(args.podRoomId) === normalizeIdValue(channel._id) ? "inside" : listed ? "outside" : null;
  }
  const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
  const canRead = (await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead || isHost(record, args.userId);
  return canRead ? "inside" : listed ? "outside" : null;
}

function priceLine(record: any): string | null {
  const price = podPriceOf(record);
  return price ? `${formatPrice(price.amount_base_units, price.currency, 2)} a month on top of membership` : null;
}

async function renderPod(ctx: any, args: { communityId: any; lens: LensName }, channel: any, record: any, sight: "inside" | "outside"): Promise<string> {
  const names = new Map<string, string>();
  const hosts = await hostNames(ctx, record, names);
  const grants = await memberGrants(ctx, channel._id);
  const lines = [`# ${String(channel.name ?? "")}${sight === "outside" ? " (a pod you're not in)" : ""}`, "", record?.purpose?.trim() || "_No purpose written yet._", ""];
  if (hosts.length) lines.push(`- Hosts: ${hosts.join(", ")}`);
  if (sight === "inside") {
    const people: string[] = [];
    for (const grant of grants.slice(0, NAMES_SHOWN)) people.push(await displayName(ctx, String(grant.principalKey).slice("user:".length), names));
    lines.push(`- In it (${grants.length}): ${people.join(", ")}${grants.length > NAMES_SHOWN ? ", …" : ""}`);
    lines.push(`- Seats: ${typeof record?.seats === "number" ? `${grants.length} of ${record.seats}` : "no limit"}`);
    const call = await nextPodCall(ctx, channel._id, Date.now());
    if (call) lines.push(`- Next call: ${call.title}, ${call.starts_at}`);
    lines.push(`- Its room: channels/${String(channel.slug ?? "")}/`);
    if (args.lens === "builder_private" || args.lens === "builder_own_ai") {
      const waiting = (await ctx.db.query("communityPodRequests").withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "pending")).take(100)).length;
      if (waiting) lines.push(`- Waiting to join: ${waiting}`);
    }
  } else {
    if (typeof record?.seats === "number") lines.push(`- Seats left: ${Math.max(0, record.seats - grants.length)}`);
    lines.push("- Ask to join from the Pods page.");
  }
  const price = priceLine(record);
  if (price) lines.push(`- Costs ${price}`);
  const whatYouGet: string[] = record?.whatYouGet ?? [];
  if (whatYouGet.length) lines.push("", "What you get:", ...whatYouGet.map((line) => `- ${line}`));
  return lines.join("\n");
}

export const listPodsForLensInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), lens: lensArg, podRoomId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const records = await ctx.db.query("communityPods").withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId)).take(PODS_CAP);
    const pods = [];
    for (const record of records) {
      const channel = await ctx.db.get(record.channelId) as any;
      const sight = await sightOf(ctx, args, channel, record);
      if (!sight) continue;
      pods.push({ slug: String(channel.slug ?? ""), name: String(channel.name ?? ""), purpose: record.purpose ?? "", inside: sight === "inside" });
    }
    return pods;
  },
});

export const readPodFactsInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), lens: lensArg, slug: v.string(), podRoomId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const channel = await ctx.db.query("communityChannels")
      .withIndex("by_community_slug", (q: any) => q.eq("communityId", args.communityId).eq("slug", args.slug)).first();
    if (!channel) return null;
    const record = await podRecord(ctx, args.communityId, channel._id);
    const sight = await sightOf(ctx, args, channel, record);
    if (!sight) return null;
    return { body: await renderPod(ctx, args, channel, record, sight), inside: sight === "inside" };
  },
});
