/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob(["./communityPods.ts", "./communityChannels.ts", "./communityEvents.ts", "./communityChannelParticipants.ts", "./_generated/**/*.*s"]);
const set = "communityChannelParticipants:setParticipant" as any;
const people = "communityPods:listPodPeople" as any;

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const user = async (name: string) => ctx.db.insert("users", { authSubject: name, displayName: name, createdAt: 1, updatedAt: 1 });
    const ownerId = await user("owner"), memberId = await user("member"), adminId = await user("admin"), outsiderId = await user("outsider");
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Builders", slug: "builders",
      visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1 });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member",
      active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("communityMemberships", { communityId, userId: adminId, role: "admin",
      active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: 2, updatedAt: 2 });
    await ctx.db.insert("communityMemberships", { communityId, userId: outsiderId, role: "member",
      active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: 3, updatedAt: 3 });
    const podId = await ctx.db.insert("communityChannels", { communityId, name: "Agency owners", slug: "agency-owners", position: 1,
      accessMode: "restricted", postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 });
    const topicId = await ctx.db.insert("communityChannels", { communityId, name: "Wins", slug: "wins", position: 2,
      accessMode: "all_members", postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 });
    return { ownerId, memberId, adminId, outsiderId, communityId, membershipId, podId, topicId };
  });
  const owner = t.withIdentity({ subject: "owner" });
  const member = t.withIdentity({ subject: "member" });
  const outsider = t.withIdentity({ subject: "outsider" });
  return { t, f, owner, member, outsider };
}

test("a pod lists its invited members, admins and owner, and the agent when it has a grant", async () => {
  const { t, f, owner, member } = await fixture();
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: true });
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "community_agent" }, active: true });
  const now = Date.now();
  await t.run(ctx => ctx.db.insert("communityPresence", { communityId: f.communityId, userId: f.memberId,
    lastSeenAt: now, activeUntil: now + 90000, createdAt: now, updatedAt: now }));
  const result: any = await member.query(people, { communityId: f.communityId, channelIds: [f.podId] });
  expect(result.pods).toHaveLength(1);
  expect(result.pods[0]).toMatchObject({ channel_id: String(f.podId), people_count: 3, agent: true });
  expect(result.pods[0].people.map((row: any) => [row.profile.display_name, row.role])).toEqual([["member", "member"], ["admin", "admin"], ["owner", "owner"]]);
  expect(result.pods[0].people[0]).toMatchObject({ last_seen_at: now, active_until: now + 90000 });
});

test("pods leave out rooms the caller can't open, shared channels and revoked or stale grants", async () => {
  const { t, f, owner, outsider } = await fixture();
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: true });
  expect((await outsider.query(people, { communityId: f.communityId, channelIds: [f.podId, f.topicId] }) as any).pods).toEqual([]);
  // Rejoining doesn't bring an old grant back, so the member drops out of the faces.
  await t.run(ctx => ctx.db.patch(f.membershipId, { activationSequence: 2 }));
  const afterRejoin: any = await owner.query(people, { communityId: f.communityId, channelIds: [f.podId] });
  expect(afterRejoin.pods[0].people.map((row: any) => row.profile.display_name)).toEqual(["admin", "owner"]);
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: false });
  const afterRevoke: any = await owner.query(people, { communityId: f.communityId, channelIds: [f.podId] });
  expect(afterRevoke.pods[0]).toMatchObject({ people_count: 2, agent: false });
});

test("the owner's agent reads every pod with the user ids participant.set takes; members can't", async () => {
  const { f, owner, member } = await fixture();
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: true });
  const result: any = await owner.query("communityPods:listBuilderPods" as any, { communityId: f.communityId });
  expect(result.contract).toBe("polynet.builder_pods.v1");
  expect(result.pods).toEqual([{ channel_id: String(f.podId), slug: "agency-owners", name: "Agency owners", agent_in_pod: false, pinned_root_id: null, people: [
    { user_id: String(f.memberId), name: "member", role: "member" },
    { user_id: String(f.adminId), name: "admin", role: "admin" },
    { user_id: String(f.ownerId), name: "owner", role: "owner" },
  ] }]);
  await expect(member.query("communityPods:listBuilderPods" as any, { communityId: f.communityId })).rejects.toThrow();
});

test("a pod's shelf lists the files and videos posted in it, and the pinned post", async () => {
  const { t, f, owner, member, outsider } = await fixture();
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: true });
  const rootId = await t.run(async ctx => {
    const root = (createdAt: number, summary: string, status: "live" | "deleted" = "live") => ctx.db.insert("communityInteractionRoots", {
      communityId: f.communityId, channelId: f.podId, actorType: "human", actorUserId: f.ownerId, kind: "discussion", status,
      visibilityScope: "community", contentSummary: summary, replyCount: 0, reactionSummary: [], idempotencyKey: summary, createdAt, updatedAt: createdAt });
    const first = await root(10, "Playbook");
    const second = await root(20, "Walkthrough");
    const gone = await root(30, "Deleted", "deleted");
    const file = (rootId: any, name: string, attachmentKind: "file" | "video", mimeType: string, status: "uploaded" | "pending" = "uploaded") =>
      ctx.db.insert("communityInteractionAttachments", { communityId: f.communityId, channelId: f.podId, rootId, attachmentKind, status,
        name, mimeType, sizeBytes: 2048, createdByActorType: "human", createdByUserId: f.ownerId, createdAt: 1, updatedAt: 1 });
    await file(first, "playbook.pdf", "file", "application/pdf");
    await file(first, "half-uploaded.pdf", "file", "application/pdf", "pending");
    await file(second, "walkthrough.mp4", "video", "video/mp4");
    await file(gone, "deleted.pdf", "file", "application/pdf");
    await ctx.db.insert("communityInteractionEmbeds", { communityId: f.communityId, rootId: second, embedKind: "link", status: "ready",
      visibilityScope: "community", previewKind: "video", provider: "YouTube", title: "Live call replay", sourceUrl: "https://youtu.be/x", createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(f.podId, { pinnedRootId: first });
    return first;
  });
  const shelf: any = await member.query("communityPods:listPodShelf" as any, { communityId: f.communityId, channelId: f.podId });
  expect(shelf.pinned_root_id).toBe(String(rootId));
  expect(shelf.files.map((item: any) => [item.name, item.author_name])).toEqual([["playbook.pdf", "owner"]]);
  expect(shelf.videos.map((item: any) => [item.name, item.provider])).toEqual([["walkthrough.mp4", null], ["Live call replay", "YouTube"]]);
  await expect(outsider.query("communityPods:listPodShelf" as any, { communityId: f.communityId, channelId: f.podId })).rejects.toThrow();
  await expect(owner.query("communityPods:listPodShelf" as any, { communityId: f.communityId, channelId: f.topicId })).rejects.toThrow();
});

test("members' guide channels: the member's own is theirs, everyone else's is listed apart", async () => {
  const { t, f, owner, member, outsider } = await fixture();
  await t.run(ctx => ctx.db.patch(f.membershipId, { serviceChannelId: f.podId }));
  expect(await member.query("communityPods:listPodSpaces" as any, { communityId: f.communityId })).toEqual({ mine: String(f.podId), member_spaces: [], test_spaces: [] });
  expect(await owner.query("communityPods:listPodSpaces" as any, { communityId: f.communityId })).toEqual({ mine: null, member_spaces: [String(f.podId)], test_spaces: [] });
  // Pods are private: another member never learns whose personal pod exists.
  expect(await outsider.query("communityPods:listPodSpaces" as any, { communityId: f.communityId })).toEqual({ mine: null, member_spaces: [], test_spaces: [] });
});

test("pods are private: someone not in a pod never sees it, the owner and admins see every pod", async () => {
  const { t, f, owner, member, outsider } = await fixture();
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: true });
  const admin = t.withIdentity({ subject: "admin" });
  const list = async (who: typeof owner) => ((await who.query("communityChannels:listCommunityChannels" as any, { communityId: f.communityId })).channels as any[])
    .map((channel) => channel.slug).sort();
  expect(await list(outsider)).not.toContain("agency-owners");
  expect(await list(member)).toContain("agency-owners");
  expect(await list(admin)).toContain("agency-owners");
  expect(await list(owner)).toContain("agency-owners");
  expect(await outsider.query(people, { communityId: f.communityId, channelIds: [f.podId] })).toEqual({ pods: [] });
});

test("a pod's call is seen only by the pod, and only the pod's ids can be used", async () => {
  const { f, owner, member, outsider } = await fixture();
  await owner.mutation(set, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.memberId }, active: true });
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const call: any = await owner.mutation("communityEvents:saveCommunityEvent" as any, { communityId: f.communityId,
    payload: { title: "Cohort call", starts_at: startsAt, timezone: "UTC", location_type: "online", visibility: "public", channel_id: String(f.podId) } });
  expect(call).toMatchObject({ channel_id: String(f.podId), visibility: "members" });
  await owner.mutation("communityEvents:saveCommunityEvent" as any, { communityId: f.communityId,
    payload: { title: "Town hall", starts_at: startsAt, timezone: "UTC", location_type: "online" } });
  const titles = async (who: any, extra = {}) => ((await who.query("communityEvents:listCommunityEvents" as any, { communityId: f.communityId, ...extra })) as any[]).map((row) => row.title).sort();
  expect(await titles(member)).toEqual(["Cohort call", "Town hall"]);
  expect(await titles(outsider)).toEqual(["Town hall"]);
  expect(await titles(member, { channelId: f.podId })).toEqual(["Cohort call"]);
  await expect(owner.mutation("communityEvents:saveCommunityEvent" as any, { communityId: f.communityId,
    payload: { title: "Bad", starts_at: startsAt, timezone: "UTC", channel_id: String(f.topicId) } })).rejects.toThrow("community_event_channel_invalid");
});

test("a test member's own pod is listed apart so the owner's lists leave it out, ended runs too", async () => {
  const { t, f, owner } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(f.membershipId, { serviceChannelId: f.podId });
    await ctx.db.insert("communityTestMembers", { communityId: f.communityId, userId: f.memberId, authSubject: "member",
      ownerUserId: f.ownerId, ownerAuthSubject: "owner", label: "Test member 1", number: 1, createdAt: 1, endedAt: 2 } as any);
  });
  expect(await owner.query("communityPods:listPodSpaces" as any, { communityId: f.communityId }))
    .toEqual({ mine: null, member_spaces: [String(f.podId)], test_spaces: [String(f.podId)] });
});

test("pod faces mark the viewer, so a card names someone else as here", async () => {
  const { f, owner } = await fixture();
  const result: any = await owner.query(people, { communityId: f.communityId, channelIds: [f.podId] });
  expect(result.pods[0].people.map((row: any) => [row.profile.display_name, row.is_you])).toEqual([["admin", false], ["owner", true]]);
});
