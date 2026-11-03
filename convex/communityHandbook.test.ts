/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

// Owners and admins edit, draft and approve; members and the agent see only
// the approved text; draft sources are what every member can read.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_780_000_000_000;

afterEach(() => { vi.useRealTimers(); });

async function fixture(t: any) {
  return t.run(async (ctx: any) => {
    const user = async (handle: string, name: string) => {
      const id = await ctx.db.insert("users", { authSubject: handle, displayName: name, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("userProfileDetails", { userId: id, displayName: name, avatarUrl: `https://example.com/${handle}.png`, createdAt: NOW, updatedAt: NOW });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", { userId: id, documentKey: document.key, documentVersion: document.version, acceptedAt: NOW, source: "test", createdAt: NOW });
      }
      return id;
    };
    const owner = await user("neil", "Neil");
    const theo = await user("theo", "Theo Brennan");
    const communityId = await ctx.db.insert("communities", {
      ownerId: owner, slug: "sunrise", name: "Sunrise", oneLiner: "Early climbers.", about: "We meet at 5:30.", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("communityMemberships", { communityId, userId: theo, role: "member", accessSource: "free_grant", active: true, activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW });
    const channel = (slug: string, accessMode: string, general = false) => ctx.db.insert("communityChannels", {
      communityId, ...(general ? { systemRole: "general" } : { createdByUserId: owner }), slug, name: general ? "General" : slug, normalizedName: slug,
      accessMode, postingPolicy: "members", status: "active", position: general ? 0 : 1, createdAt: NOW, updatedAt: NOW,
    });
    const general = await channel("general", "all_members", true);
    const crew = await channel("crew", "restricted");
    const post = (channelId: any, text: string) => ctx.db.insert("communityInteractionRoots", {
      communityId, channelId, actorType: "human", actorUserId: owner, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: text, replyCount: 0, reactionSummary: [], idempotencyKey: text, createdAt: NOW, updatedAt: NOW,
    });
    await post(general, "Maya leads the dawn sessions; bring shoes and chalk.");
    await post(crew, "Private crew plan: do not share.");
    await ctx.db.insert("communityEvents", {
      communityId, createdByUserId: owner, title: "Dawn Patrol", descriptionMd: "Board session", startsAt: NOW + 86_400_000, endsAt: NOW + 90_000_000,
      timezone: "America/New_York", locationType: "physical", locationLabel: "The gym", visibility: "members", status: "live", recurrenceFrequency: "weekly", createdAt: NOW, updatedAt: NOW,
    });
    return { communityId, owner, theo };
  });
}

test("owners save, approve and withdraw; members can't; only the approved text is readable", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const asOwner = t.withIdentity({ subject: "neil" });
  const asTheo = t.withIdentity({ subject: "theo" });
  await asOwner.mutation(api.communityHandbook.saveCommunityHandbookDraft, { communityId: f.communityId, text: "## Who runs what\n\n- Draft only." });
  expect(await t.query(internal.communityHandbook.readApprovedCommunityHandbookInternal, { communityId: f.communityId })).toBeNull();
  const approved = await asOwner.mutation(api.communityHandbook.approveCommunityHandbook, { communityId: f.communityId, text: "## Who runs what\n\n- Maya runs the dawn sessions." });
  expect(approved.approved_md).toContain("Maya runs the dawn sessions");
  expect(await t.query(internal.communityHandbook.readApprovedCommunityHandbookInternal, { communityId: f.communityId }))
    .toMatchObject({ communityName: "Sunrise", approvedMd: "## Who runs what\n\n- Maya runs the dawn sessions." });
  await expect(asTheo.mutation(api.communityHandbook.approveCommunityHandbook, { communityId: f.communityId, text: "hijack" })).rejects.toThrow();
  await expect(asTheo.query(api.communityHandbook.getCommunityHandbookForManager, { communityId: f.communityId })).rejects.toThrow();
  // The card points to it once approved.
  const card = await t.query(internal.communityOntologyCards.loadCommunityCardSourceInternal, { communityId: f.communityId });
  expect(card?.handbookApprovedAt).toBeGreaterThan(0);
  await asOwner.mutation(api.communityHandbook.approveCommunityHandbook, { communityId: f.communityId, text: "  " });
  expect(await t.query(internal.communityHandbook.readApprovedCommunityHandbookInternal, { communityId: f.communityId })).toBeNull();
});

test("draft sources: about text, channels, recurring events and shared posts, never a private room", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.mutation(internal.communitySearchDocs.backfillCommunitySearchDocsInternal, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const loaded = await t.query(internal.communityHandbook.loadCommunityHandbookSourcesInternal, { communityId: f.communityId });
  const all = JSON.stringify(loaded!.sources);
  expect(all).toContain("We meet at 5:30.");
  expect(all).toContain("#General");
  expect(all).toContain("Dawn Patrol, repeats weekly");
  expect(all).toContain("Maya leads the dawn sessions");
  expect(all).not.toContain("Private crew plan");
  expect(loaded!.sources.map((source: any) => source.id)).toEqual(loaded!.sources.map((_: any, i: number) => `s${i + 1}`));
});

test("draft sources read lesson text from its contents table, and skip memory whose evidence is gone", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx: any) => {
    const moduleId = await ctx.db.insert("communityResourceModules", { communityId: f.communityId, createdByUserId: f.owner, name: "Start here", sortOrder: 0, status: "live", createdAt: NOW, updatedAt: NOW });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, type: "note", pinned: false, title: "First session", status: "published", role: "page", bodyChars: 34, sortOrder: 0, createdByUserId: f.owner, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("communityResourceContents", { communityId: f.communityId, resourceId, bodyMd: "Arrive at 5:20 and sign the waiver.", bodyChars: 34, bodyHash: "h", createdAt: NOW, updatedAt: NOW });
    const node = (title: string, tags: string[]) => ctx.db.insert("communityIntelligenceNodes", {
      communityId: f.communityId, type: "playbook", title, bodyMd: `${title} body`, status: "canonical", visibilityScope: "community", sourceVisibility: "community",
      confidence: 0.9, evidenceStrength: "anecdotal", workflowIds: [], tags, sourceTraceIds: [], outcomeObservationIds: [], stalenessScore: 0, retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0, createdByActorType: "member", lastUpdatedByActorType: "member", version: 1, createdAt: NOW, updatedAt: NOW,
    });
    await node("Founder-written playbook", []);
    // Compiler memory with no surviving evidence must not come back through the handbook.
    await node("Orphaned compiler note", ["compiler_memory"]);
  });
  const loaded = await t.query(internal.communityHandbook.loadCommunityHandbookSourcesInternal, { communityId: f.communityId });
  const all = JSON.stringify(loaded!.sources);
  expect(all).toContain("Arrive at 5:20 and sign the waiver.");
  expect(all).toContain("Founder-written playbook");
  expect(all).not.toContain("Orphaned compiler note");
});

test("asking for a draft without AI funding fails cleanly and leaves the approved text alone", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const asOwner = t.withIdentity({ subject: "neil" });
  await asOwner.mutation(api.communityHandbook.approveCommunityHandbook, { communityId: f.communityId, text: "## Purpose\n\n- Climb early." });
  const requested = await asOwner.mutation(api.communityHandbook.requestCommunityHandbookDraft, { communityId: f.communityId });
  expect(requested.draft_status).toBe("drafting");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await asOwner.query(api.communityHandbook.getCommunityHandbookForManager, { communityId: f.communityId });
  expect(after.draft_status).toBe("failed");
  expect(after.draft_error).toMatch(/^funding_unavailable/);
  expect(after.approved_md).toBe("## Purpose\n\n- Climb early.");
});
