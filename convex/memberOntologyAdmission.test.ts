/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./memberOntology.ts",
  "./_generated/**/*.*s",
]);

const APPLICANT_SUBJECT = "member-ontology-admission-applicant";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_786_100_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "member-ontology-admission-owner",
      displayName: "Owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const applicantId = await ctx.db.insert("users", {
      authSubject: APPLICANT_SUBJECT,
      displayName: "Applicant",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "member-ontology-admission",
      name: "Member ontology admission",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { nowMs, ownerId, applicantId, communityId };
  });
}

function interviewArgs(communityId: any) {
  return {
    communityId,
    confirmMarker: "admission-test",
    facts: [{
      kind: "goal",
      body: "Build a trustworthy community",
      provenance: "stated_interview",
    }],
  };
}

test("an unblocked pending applicant can confirm community interview facts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityJoinRequests", {
      communityId: fixture.communityId,
      userId: fixture.applicantId,
      status: "pending",
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
  });

  await expect(t.withIdentity({ subject: APPLICANT_SUBJECT }).mutation(
    api.memberOntology.confirmMemberInterviewFacts,
    interviewArgs(fixture.communityId),
  )).resolves.toEqual({ inserted: 1 });
  expect(await t.run(async (ctx) => ctx.db.query("memberFacts").collect()))
    .toEqual([expect.objectContaining({
      userId: fixture.applicantId,
      communityId: fixture.communityId,
      consentState: "approved",
    })]);
});

test("a blocked pending applicant cannot write community interview facts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityJoinRequests", {
      communityId: fixture.communityId,
      userId: fixture.applicantId,
      status: "pending",
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    await ctx.db.insert("communityBlocks", {
      communityId: fixture.communityId,
      userId: fixture.applicantId,
      createdByUserId: fixture.ownerId,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
  });

  await expect(t.withIdentity({ subject: APPLICANT_SUBJECT }).mutation(
    api.memberOntology.confirmMemberInterviewFacts,
    interviewArgs(fixture.communityId),
  )).rejects.toThrow("community_user_blocked");
  expect(await t.run(async (ctx) => ctx.db.query("memberFacts").collect())).toEqual([]);
});

test("a block supersedes active membership for community interview writes", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityMemberships", {
      communityId: fixture.communityId,
      userId: fixture.applicantId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      activationSequence: 1,
      activatedAt: fixture.nowMs,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    await ctx.db.insert("communityBlocks", {
      communityId: fixture.communityId,
      userId: fixture.applicantId,
      createdByUserId: fixture.ownerId,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
  });

  await expect(t.withIdentity({ subject: APPLICANT_SUBJECT }).mutation(
    api.memberOntology.confirmMemberInterviewFacts,
    interviewArgs(fixture.communityId),
  )).rejects.toThrow("community_user_blocked");
  expect(await t.run(async (ctx) => ctx.db.query("memberFacts").collect())).toEqual([]);
});
