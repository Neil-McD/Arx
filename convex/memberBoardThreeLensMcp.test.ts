/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { actionTool, guideActionKey, translateActionTool } from "../shared/actionTools";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);

const ORIGINAL_PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;

beforeEach(() => {
  process.env.PUBLIC_APP_URL = "https://www.polynet.ai";
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_APP_URL === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = ORIGINAL_PUBLIC_APP_URL;
});

async function seedFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const makeUser = async (authSubject: string, displayName: string, handle: string) => {
      const id = await ctx.db.insert("users", {
        authSubject,
        displayName,
        handle,
        normalizedHandle: handle,
        email: `${handle}@example.com`,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await recordCurrentPlatformLegalAcceptance(ctx, {
        userId: id,
        termsVersion: TERMS_OF_SERVICE_DOCUMENT.version,
        privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
        source: "test",
        acceptedAt: now,
      });
      return id;
    };

    const ownerId = await makeUser("owner_subj", "Neil", "neil");
    const adminId = await makeUser("admin_subj", "Avery", "avery");
    const modId = await makeUser("mod_subj", "Maya", "maya");
    const samId = await makeUser("sam_subj", "Sam", "sam");
    const julesId = await makeUser("jules_subj", "Jules", "jules");

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      name: "Builders Guild",
      slug: "builders-guild",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 5,
      createdAt: now,
      updatedAt: now,
    });

    const addMembership = async (userId: any, role: "admin" | "moderator" | "member") =>
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role,
        state: "active",
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        activatedAt: now - 3 * 24 * 60 * 60 * 1000,
        updatedAt: now,
      });

    const adminMembershipId = await addMembership(adminId, "admin");
    const modMembershipId = await addMembership(modId, "moderator");
    const samMembershipId = await addMembership(samId, "member");
    const julesMembershipId = await addMembership(julesId, "member");

    // Seed Sam's board card with a private founder instruction, status override,
    // custom checkpoint completion, and a logged win.
    await ctx.db.insert("communityMemberJourneyCards", {
      communityId,
      userId: samId,
      stageKey: "getting_started",
      statusOverride: "needs_you",
      founderInstruction: "SECRET_HOST_NOTE: gently nudge Sam to ship lesson 1 before Friday",
      founderInstructionUpdatedAt: now,
      agentOutcomeNote: "Guide sent course check-in",
      agentOutcomeAt: now - 3600_000,
      completedMilestones: [{ key: "first_lesson", label: "Completed a lesson", completedAt: now - 1000, source: "founder" }],
      outcomes: [{ id: "win_1", text: "Published first prototype", at: now - 2000, source: "founder" }],
      createdAt: now - 5000,
      updatedAt: now,
    });

    // Seed Jules's private 1:1 thread with the community Guide to prove private
    // member words NEVER leak into builder/journey.json or members/<handle>.json.
    const julesThreadId = await ctx.db.insert("threads", {
      ownerId: julesId,
      title: "Private Guide talk",
      titleSource: "auto",
      communityId: String(communityId),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("cloudMessages", {
      threadId: julesThreadId,
      ownerId: julesId,
      messageKey: "msg_jules_1",
      seq: 1,
      role: "user",
      contentJson: [{ type: "text", text: "SUPER_PRIVATE_JULES_CONFESSION_NEVER_EXPOSE_TO_BUILDER" }],
      createdAt: now,
    });

    // Seed Jules's board card with a different stage & win so we can test cross-member isolation.
    await ctx.db.insert("communityMemberJourneyCards", {
      communityId,
      userId: julesId,
      stageKey: "active",
      statusOverride: "stuck",
      founderInstruction: "JULES_HOST_NOTE_PRIVATE",
      founderInstructionUpdatedAt: now,
      outcomes: [{ id: "jules_win", text: "JULES_SECRET_WIN_5K_MRR", at: now - 1000, source: "founder" }],
      createdAt: now - 5000,
      updatedAt: now,
    });

    return {
      now,
      communityId,
      slug: "builders-guild",
      owner: { authSubject: "owner_subj", userId: String(ownerId) },
      admin: { authSubject: "admin_subj", userId: String(adminId), membershipId: String(adminMembershipId) },
      mod: { authSubject: "mod_subj", userId: String(modId), membershipId: String(modMembershipId) },
      sam: { authSubject: "sam_subj", userId: String(samId), membershipId: String(samMembershipId) },
      jules: { authSubject: "jules_subj", userId: String(julesId), membershipId: String(julesMembershipId) },
    };
  });
}

function makeCtx(t: ReturnType<typeof convexTest>, actor: { authSubject: string }) {
  const authed = t.withIdentity({ subject: actor.authSubject }) as any;
  return {
    runQuery: (ref: any, a: any) => authed.query(ref, a),
    runMutation: (ref: any, a: any) => authed.mutation(ref, a),
    runAction: (ref: any, a: any) => authed.action(ref, a),
  };
}

async function execReadOrList(
  t: ReturnType<typeof convexTest>,
  actor: { authSubject: string; userId: string },
  opts: {
    principalKind: "external_mcp" | "community_agent_for_member" | "community_agent";
    evidenceSurface: "external_mcp" | "member_agent_dock" | "community_concierge";
    mountedCommunityId?: string;
    toolName: "polynet_list" | "polynet_read";
    path: string;
  },
) {
  return await executePolynetCanonicalTool({
    ctx: makeCtx(t, actor),
    authSubject: actor.authSubject,
    userId: actor.userId,
    principalKind: opts.principalKind,
    evidenceSurface: opts.evidenceSurface,
    ...(opts.mountedCommunityId ? { mountedCommunityId: opts.mountedCommunityId } : {}),
    toolName: opts.toolName,
    input: { path: opts.path },
  });
}

async function execNamedTool(
  t: ReturnType<typeof convexTest>,
  actor: { authSubject: string; userId: string },
  door: "mcp" | "guide",
  toolName: string,
  args: Record<string, unknown>,
  opts?: { communityId?: string; callId?: string; personSaidYes?: boolean },
) {
  const entry = actionTool(toolName)!;
  const translated =
    door === "guide"
      ? translateActionTool(entry, args, Date.now(), { key: guideActionKey("run-board-1", opts?.callId ?? `${toolName}-1`) })
      : translateActionTool(entry, args, Date.now());
  return await executePolynetCanonicalTool({
    ctx: makeCtx(t, actor),
    authSubject: actor.authSubject,
    userId: actor.userId,
    principalKind: door === "mcp" ? "external_mcp" : "community_agent_for_member",
    evidenceSurface: door === "mcp" ? "external_mcp" : "member_agent_dock",
    ...(door === "mcp" ? { ownAiApp: "Claude" } : { mountedCommunityId: opts?.communityId }),
    toolName: translated.toolName,
    input: translated.input,
    ...(opts?.personSaidYes ? { personSaidYes: true } : {}),
  });
}

describe("Member Board three-lens privacy & ontology", () => {
  test("member lens sees ONLY own member-safe coaching focus; never sees CRM statuses, host notes, or other members", async () => {
    const t = convexTest(schema, modules);
    const f = await seedFixture(t);

    // 1. Sam reading own members/me/context.md via MCP (member_own_ai) AND private Guide talk (member_private).
    for (const [principalKind, evidenceSurface] of [
      ["external_mcp", "external_mcp"],
      ["community_agent_for_member", "member_agent_dock"],
    ] as const) {
      const selfRes = await execReadOrList(t, f.sam, {
        principalKind,
        evidenceSurface,
        ...(principalKind === "community_agent_for_member" ? { mountedCommunityId: String(f.communityId) } : {}),
        toolName: "polynet_read",
        path: `/communities/${f.slug}/members/me/context.md`,
      });
      expect(selfRes.ok).toBe(true);
      const body = String((selfRes as any).value.body ?? "");
      expect(body).toContain("never talk to them like a CRM or tracking pipeline");
      // Includes Sam's own member-safe journey data:
      expect(body).toContain("Getting started");
      expect(body).toContain("Completed a lesson");
      expect(body).toContain("Shared a goal");
      expect(body).toContain("Published first prototype");
      // NEVER leaks Sam's CRM status label, founder instruction, check-in tracking note, or Jules's data:
      expect(body).not.toContain("needs_you");
      expect(body).not.toContain("SECRET_HOST_NOTE");
      expect(body).not.toContain("Guide sent course check-in");
      expect(body).not.toContain("JULES_SECRET_WIN_5K_MRR");
      expect(body).not.toContain("JULES_HOST_NOTE_PRIVATE");
    }

    // 2. Member, moderator, and public community agent ALL fail closed on builder/journey.json.
    for (const attempt of [
      { actor: f.sam, principalKind: "external_mcp" as const, evidenceSurface: "external_mcp" as const },
      { actor: f.sam, principalKind: "community_agent_for_member" as const, evidenceSurface: "member_agent_dock" as const, mountedCommunityId: String(f.communityId) },
      { actor: f.mod, principalKind: "external_mcp" as const, evidenceSurface: "external_mcp" as const },
      { actor: f.mod, principalKind: "community_agent_for_member" as const, evidenceSurface: "member_agent_dock" as const, mountedCommunityId: String(f.communityId) },
      { actor: f.owner, principalKind: "community_agent" as const, evidenceSurface: "community_concierge" as const, mountedCommunityId: String(f.communityId) },
    ]) {
      const blocked = await execReadOrList(t, attempt.actor, {
        principalKind: attempt.principalKind,
        evidenceSurface: attempt.evidenceSurface,
        mountedCommunityId: attempt.mountedCommunityId,
        toolName: "polynet_read",
        path: `/communities/${f.slug}/builder/journey.json`,
      });
      expect(blocked.ok, JSON.stringify(attempt)).toBe(false);
    }

    // 3. Moderator listing builder/ sees ONLY join-requests/, never builder/journey.json.
    const modBuilderList = await execReadOrList(t, f.mod, {
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_list",
      path: `/communities/${f.slug}/builder/`,
    });
    expect(modBuilderList.ok).toBe(true);
    const modPaths = ((modBuilderList as any).value.entries ?? []).map((e: any) => e.path);
    expect(modPaths).toEqual([`/communities/${f.slug}/builder/join-requests/`]);

    // 4. Member and moderator reading Jules's members/jules.json NEVER see Jules's journey.
    for (const viewer of [f.sam, f.mod]) {
      const profileRes = await execReadOrList(t, viewer, {
        principalKind: "external_mcp",
        evidenceSurface: "external_mcp",
        toolName: "polynet_read",
        path: `/communities/${f.slug}/members/jules.json`,
      });
      expect(profileRes.ok).toBe(true);
      const parsed = JSON.parse(String((profileRes as any).value.body));
      expect(parsed.journey).toBeUndefined();
      expect(String((profileRes as any).value.body)).not.toContain("JULES_SECRET_WIN_5K_MRR");
      expect(String((profileRes as any).value.body)).not.toContain("JULES_HOST_NOTE_PRIVATE");
    }
  });

  test("hosted Guide silent coaching context (member_private) supplies host note & next steps and fails closed for owner/blocked", async () => {
    const t = convexTest(schema, modules);
    const f = await seedFixture(t);

    const samCoaching = await t.query(internal.communityMemberJourney.readMemberGuideCoachingContextInternal, {
      communityId: f.communityId,
      userId: f.sam.userId as any,
    });
    expect(samCoaching).toBeTruthy();
    expect(samCoaching!).toContain("MEMBER_COACHING_FOCUS");
    expect(samCoaching!).toContain("Never mention a tracking board, pipeline, stage name, checkpoints, status label, or any host note");
    expect(samCoaching!).toContain("SECRET_HOST_NOTE: gently nudge Sam to ship lesson 1 before Friday");
    expect(samCoaching!).toContain("Shared a goal");
    expect(samCoaching!).toContain("Published first prototype");
    // Does not expose CRM status label:
    expect(samCoaching!).not.toContain("needs_you");

    // Community owner never gets a member coaching block.
    const ownerCoaching = await t.query(internal.communityMemberJourney.readMemberGuideCoachingContextInternal, {
      communityId: f.communityId,
      userId: f.owner.userId as any,
    });
    expect(ownerCoaching).toBeNull();

    // Blocked member fails closed.
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("communityBlocks", {
        communityId: f.communityId,
        userId: f.sam.userId as any,
        createdByUserId: f.owner.userId as any,
        createdAt: now,
        updatedAt: now,
      });
    });
    const blockedCoaching = await t.query(internal.communityMemberJourney.readMemberGuideCoachingContextInternal, {
      communityId: f.communityId,
      userId: f.sam.userId as any,
    });
    expect(blockedCoaching).toBeNull();
  });

  test("builder lens (owner & admin) reads full builder/journey.json and per-member journey without ever seeing private 1:1 words", async () => {
    const t = convexTest(schema, modules);
    const f = await seedFixture(t);

    for (const [actor, principalKind, evidenceSurface] of [
      [f.owner, "external_mcp", "external_mcp"],
      [f.admin, "external_mcp", "external_mcp"],
      [f.owner, "community_agent_for_member", "member_agent_dock"],
    ] as const) {
      const dirRes = await execReadOrList(t, actor, {
        principalKind,
        evidenceSurface,
        ...(principalKind === "community_agent_for_member" ? { mountedCommunityId: String(f.communityId) } : {}),
        toolName: "polynet_list",
        path: `/communities/${f.slug}/builder/`,
      });
      expect(dirRes.ok).toBe(true);
      const dirPaths = ((dirRes as any).value.entries ?? []).map((e: any) => e.path);
      expect(dirPaths).toContain(`/communities/${f.slug}/builder/journey.json`);

      const boardRes = await execReadOrList(t, actor, {
        principalKind,
        evidenceSurface,
        ...(principalKind === "community_agent_for_member" ? { mountedCommunityId: String(f.communityId) } : {}),
        toolName: "polynet_read",
        path: `/communities/${f.slug}/builder/journey.json`,
      });
      expect(boardRes.ok).toBe(true);
      const rawBody = String((boardRes as any).value.body ?? "");
      expect(rawBody).not.toContain("SUPER_PRIVATE_JULES_CONFESSION_NEVER_EXPOSE_TO_BUILDER");
      const board = JSON.parse(rawBody);
      expect(board.stages.length).toBe(4);
      expect(board.summary.shown_members).toBe(4); // admin, mod, sam, jules (non-owners)
      const samCard = board.cards.find((c: any) => c.handle === "sam");
      expect(samCard).toMatchObject({
        member_ref: `user:${f.sam.userId}`,
        stage_key: "getting_started",
        status: "needs_you",
        status_is_manual: true,
        founder_instruction: "SECRET_HOST_NOTE: gently nudge Sam to ship lesson 1 before Friday",
      });
    }

    // Owner reading members/sam.json sees Sam's journey summary directly attached.
    const samProfile = await execReadOrList(t, f.owner, {
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_read",
      path: `/communities/${f.slug}/members/sam.json`,
    });
    expect(samProfile.ok).toBe(true);
    const parsed = JSON.parse(String((samProfile as any).value.body));
    expect(parsed.journey).toMatchObject({
      stage_key: "getting_started",
      status: "needs_you",
      founder_instruction: "SECRET_HOST_NOTE: gently nudge Sam to ship lesson 1 before Friday",
    });
  });

  test("builder/journey.json stays valid, parseable, and priority-sorted under 24 KB even in larger communities", async () => {
    const t = convexTest(schema, modules);
    const f = await seedFixture(t);

    // Seed 55 extra members so an unbounded pretty-printed JSON payload would exceed 24 KB.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 55; i += 1) {
        const uid = await ctx.db.insert("users", {
          authSubject: `bulk_subj_${i}`,
          displayName: `Bulk Member ${i}`,
          handle: `bulk-member-${i}`,
          normalizedHandle: `bulk-member-${i}`,
          email: `bulk${i}@example.com`,
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("communityMemberships", {
          communityId: f.communityId,
          userId: uid,
          role: "member",
          state: "active",
          createdAt: now - 2 * 24 * 60 * 60 * 1000,
          activatedAt: now - 2 * 24 * 60 * 60 * 1000,
          updatedAt: now,
        });
        await ctx.db.insert("communityMemberJourneyCards", {
          communityId: f.communityId,
          userId: uid,
          stageKey: "new",
          outcomes: [{ id: `o_${i}`, text: `Completed onboarding exercise number ${i} with full writeup`, at: now, source: "founder" }],
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const boardRes = await execReadOrList(t, f.owner, {
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_read",
      path: `/communities/${f.slug}/builder/journey.json`,
    });
    expect(boardRes.ok).toBe(true);
    const rawBody = String((boardRes as any).value.body ?? "");
    expect(rawBody.length).toBeLessThanOrEqual(24_000);
    const parsed = JSON.parse(rawBody);
    expect(parsed.error).toBeUndefined();
    expect(parsed.summary.total_active_members).toBeGreaterThanOrEqual(59);
    expect(parsed.summary.cards_truncated).toBe(true);
    // Priority sorting guarantees Sam (needs_you) and Jules (stuck) appear first, ahead of on_track bulk members.
    expect(parsed.cards[0]?.handle).toBe("sam");
    expect(parsed.cards[1]?.handle).toBe("jules");
  });
});

describe("Builder Member Board tools across Official Polynet MCP & Studio Guide Chat", () => {
  test("members and moderators fail closed on every board mutation tool", async () => {
    const t = convexTest(schema, modules);
    const f = await seedFixture(t);

    const calls: Array<[string, Record<string, unknown>]> = [
      ["polynet_move_member_stage", { community: f.slug, members: ["sam"], stage: "active" }],
      ["polynet_set_member_status", { community: f.slug, members: ["sam"], status: "done" }],
      ["polynet_set_member_milestone", { community: f.slug, member: "sam", milestone: "shipped_mvp", done: true }],
      ["polynet_record_member_win", { community: f.slug, member: "sam", text: "Unauthorized win" }],
      ["polynet_set_member_guide_note", { community: f.slug, member: "sam", note: "Unauthorized note" }],
      [
        "polynet_update_journey_stages",
        {
          community: f.slug,
          stages: [
            { key: "new", name: "New", goal: "g1" },
            { key: "getting_started", name: "Getting started", goal: "g2" },
            { key: "active", name: "Active", goal: "g3" },
            { key: "graduated", name: "Graduated", goal: "g4" },
          ],
        },
      ],
      ["polynet_remove_journey_stage", { community: f.slug, stage: "graduated" }],
    ];

    for (const actor of [f.sam, f.mod]) {
      for (const [toolName, args] of calls) {
        const res = await execNamedTool(t, actor, "mcp", toolName, args);
        expect(res.ok, `${actor.authSubject} must fail closed on ${toolName}`).toBe(false);
      }
    }
  });

  test("builders can move stages, set status, toggle milestones, log/remove wins, set coaching notes, update stages safely, and remove a stage after Yes confirmation", async () => {
    const t = convexTest(schema, modules);
    const f = await seedFixture(t);

    // 1. Move Sam by handle via MCP (and ensure owner is cleanly refused per-item without failing Sam).
    const moved = await execNamedTool(t, f.admin, "mcp", "polynet_move_member_stage", {
      community: f.slug,
      members: ["sam", "neil"],
      stage: "Active",
    });
    expect(moved.ok).toBe(true);
    expect((moved as any).value.result).toMatchObject({ succeeded: 1, failed: 1 });
    expect((moved as any).value.result.results[0]).toMatchObject({ ok: true, stage_key: "active", stage_name: "Active" });
    expect((moved as any).value.result.results[1]).toMatchObject({ ok: false, code: "owner_not_on_board" });

    // 2. Pin status and reset to auto via Studio Guide Chat door.
    const pinned = await execNamedTool(
      t,
      f.owner,
      "guide",
      "polynet_set_member_status",
      { community: f.slug, members: ["sam"], status: "on_track" },
      { communityId: String(f.communityId), callId: "status-1" },
    );
    expect(pinned.ok).toBe(true);
    expect((pinned as any).value.result.results[0]).toMatchObject({ ok: true, status_override: "on_track" });

    const autoStatus = await execNamedTool(
      t,
      f.owner,
      "guide",
      "polynet_set_member_status",
      { community: f.slug, members: ["sam"], status: "auto" },
      { communityId: String(f.communityId), callId: "status-2" },
    );
    expect(autoStatus.ok).toBe(true);
    expect((autoStatus as any).value.result.results[0]).toMatchObject({ ok: true, status_override: null });

    // 3. Toggle custom milestone via MCP (source recorded as "mcp").
    const milestoneOn = await execNamedTool(t, f.owner, "mcp", "polynet_set_member_milestone", {
      community: f.slug,
      member: "sam",
      milestone: "shipped_mvp",
      label: "Shipped MVP",
      done: true,
    });
    expect(milestoneOn.ok).toBe(true);
    expect((milestoneOn as any).value.result).toMatchObject({ milestone_key: "shipped_mvp", done: true });

    // 4. Record win via MCP with idempotency_key replay, then remove win via Guide chat.
    const win1 = await execNamedTool(t, f.owner, "mcp", "polynet_record_member_win", {
      community: f.slug,
      member: "sam",
      text: "Closed first 3 customers",
      idempotency_key: "win-sam-1",
    });
    expect(win1.ok).toBe(true);
    const outcomeId = (win1 as any).value.result.outcome.id as string;
    expect((win1 as any).value.result.outcome).toMatchObject({ text: "Closed first 3 customers", source: "mcp" });

    // Replaying exact same idempotency_key does not duplicate the win.
    const win1Replay = await execNamedTool(t, f.owner, "mcp", "polynet_record_member_win", {
      community: f.slug,
      member: "sam",
      text: "Closed first 3 customers",
      idempotency_key: "win-sam-1",
    });
    expect(win1Replay.ok).toBe(true);
    expect((win1Replay as any).value.result.outcome.id).toBe(outcomeId);

    const winRemoved = await execNamedTool(
      t,
      f.owner,
      "guide",
      "polynet_record_member_win",
      { community: f.slug, member: "sam", remove_outcome_id: outcomeId },
      { communityId: String(f.communityId), callId: "win-rm-1" },
    );
    expect(winRemoved.ok).toBe(true);
    expect((winRemoved as any).value.result.removed_outcome_id).toBe(outcomeId);

    // 5. Update and clear coaching note.
    const noteSet = await execNamedTool(t, f.owner, "mcp", "polynet_set_member_guide_note", {
      community: f.slug,
      member: "sam",
      note: "Invite Sam to demo on Thursday.",
    });
    expect(noteSet.ok).toBe(true);
    expect((noteSet as any).value.result.founder_instruction).toBe("Invite Sam to demo on Thursday.");

    // 6. Update stages: adding a 5th stage succeeds; silently omitting an existing stage is REFUSED.
    const droppedRefused = await execNamedTool(t, f.owner, "mcp", "polynet_update_journey_stages", {
      community: f.slug,
      stages: [
        { key: "new", name: "New", goal: "Welcome" },
        { key: "active", name: "Active", goal: "Participating" },
      ],
    });
    expect(droppedRefused.ok).toBe(false);
    expect((droppedRefused as any).code).toBe("stage_removal_requires_confirmation");

    const addedStage = await execNamedTool(t, f.owner, "mcp", "polynet_update_journey_stages", {
      community: f.slug,
      stages: [
        { key: "new", name: "New", goal: "Welcome", checkpoints: [{ key: "first_post", label: "Posted or replied once", kind: "first_post" }] },
        { key: "getting_started", name: "Getting started", goal: "Early wins", checkpoints: [{ key: "shipped_mvp", label: "Shipped MVP", kind: "custom" }] },
        { key: "active", name: "Active", goal: "Steady progress" },
        { key: "graduated", name: "Graduated", goal: "Helping others" },
        { name: "Alumni", goal: "Long-term mentors" },
      ],
    });
    expect(addedStage.ok).toBe(true);
    expect((addedStage as any).value.result.stages.map((s: any) => s.key)).toContain("alumni");

    // 7. Remove a stage ("active", where Sam and Jules sit) -> MUST ask first with Yes/No confirmation!
    const removePending = await execNamedTool(t, f.owner, "mcp", "polynet_remove_journey_stage", {
      community: f.slug,
      stage: "active",
      move_to_stage: "graduated",
      idempotency_key: "rm-stage-1",
    });
    expect(removePending.ok).toBe(true);
    expect((removePending as any).value.status).toBe("waiting_for_person");
    expect((removePending as any).value.question).toContain('Remove the "Active" stage');
    expect((removePending as any).value.question).toContain('2 members on it will move to "Graduated"');

    // Stage is still present before owner says Yes.
    const asOwner = t.withIdentity({ subject: f.owner.authSubject });
    const questions = await asOwner.query(api.communityGuideQuestions.listGuideQuestions, {
      communityId: f.communityId,
    });
    expect(questions).toHaveLength(1);

    // Owner clicks Yes -> stage removed and Sam & Jules move to "graduated".
    const answer = await asOwner.action(api.communityGuideQuestions.answerGuideQuestion, {
      communityId: f.communityId,
      questionId: questions[0]!.id as any,
      answer: "yes",
    });
    expect(answer).toMatchObject({ status: "done", line: "The stage was removed from the Member Board." });

    const finalBoard = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: f.communityId,
    });
    expect(finalBoard.stages.map((s: any) => s.key)).not.toContain("active");
    const finalSam = finalBoard.cards.find((c: any) => c.handle === "sam");
    const finalJules = finalBoard.cards.find((c: any) => c.handle === "jules");
    expect(finalSam?.stage_key).toBe("graduated");
    expect(finalJules?.stage_key).toBe("graduated");

    // 8. Removing a stage ("new") that holds derived members with NO stored card rows
    // (admin & mod) also materializes and moves them to the chosen move_to_stage ("alumni").
    const removeNewPending = await execNamedTool(t, f.owner, "mcp", "polynet_remove_journey_stage", {
      community: f.slug,
      stage: "new",
      move_to_stage: "alumni",
      idempotency_key: "rm-stage-new-1",
    });
    expect(removeNewPending.ok).toBe(true);
    expect((removeNewPending as any).value.status).toBe("waiting_for_person");
    expect((removeNewPending as any).value.question).toContain('2 members on it will move to "Alumni"');

    const newQuestions = await asOwner.query(api.communityGuideQuestions.listGuideQuestions, {
      communityId: f.communityId,
    });
    expect(newQuestions).toHaveLength(1);
    const removeNewAnswer = await asOwner.action(api.communityGuideQuestions.answerGuideQuestion, {
      communityId: f.communityId,
      questionId: newQuestions[0]!.id as any,
      answer: "yes",
    });
    expect(removeNewAnswer.status).toBe("done");
    const boardAfterNewRemoved = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: f.communityId,
    });
    expect(boardAfterNewRemoved.cards.find((c: any) => c.handle === "maya")?.stage_key).toBe("alumni");
    expect(boardAfterNewRemoved.cards.find((c: any) => c.handle === "avery")?.stage_key).toBe("alumni");
  });
});
