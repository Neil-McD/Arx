/// <reference types="vite/client" />

import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { actionTool, translateActionTool } from "../shared/actionTools";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SLUG = "slice3-club";
const ROOT = `/communities/${SLUG}/`;

async function seedWorld(t: ReturnType<typeof convexTest>, opts: { planTier?: "free" | "guide" | "chief_of_staff"; agentEnabled?: boolean } = {}) {
  const now = Date.now();
  const planTier = opts.planTier ?? "chief_of_staff";
  const agentEnabled = opts.agentEnabled ?? true;

  return await t.run(async (ctx) => {
    const insertUser = (subject: string, displayName: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName,
        handle,
        normalizedHandle: handle,
        createdAt: now - 30 * DAY_MS,
        updatedAt: now - 30 * DAY_MS,
      });

    const ownerId = await insertUser("sub_owner", "Neil Owner", "neil");
    const adminId = await insertUser("sub_admin", "Ada Admin", "ada");
    const modId = await insertUser("sub_mod", "Max Mod", "max");
    const samId = await insertUser("sub_sam", "Sam Member", "sam");
    const julesId = await insertUser("sub_jules", "Jules Paying", "jules");
    const planMemberId = await insertUser("sub_plan", "Pat Plan", "pat");
    const outsiderId = await insertUser("sub_outsider", "Owen Outsider", "owen");

    const communityId = await ctx.db.insert("communities", {
      slug: SLUG,
      name: "Slice 3 Club",
      ownerId,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 6,
      createdAt: now - 20 * DAY_MS,
      updatedAt: now - DAY_MS,
    });

    if (planTier !== "free") {
      await ctx.db.insert("founderSubscriptions", {
        communityId,
        ownerUserId: ownerId,
        provider: "stripe",
        providerCustomerId: "cus_slice3",
        providerSubscriptionId: `sub_slice3_${planTier}`,
        providerPriceId: planTier === "chief_of_staff" ? "price_cos" : "price_guide",
        planTier,
        status: "active",
        currentPeriodStartAt: now - 5 * DAY_MS,
        currentPeriodEndAt: now + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: now - 5 * DAY_MS,
        createdAt: now - 5 * DAY_MS,
        updatedAt: now - 5 * DAY_MS,
      });
    }

    if (!agentEnabled) {
      await ctx.db.insert("communityAgentConfigs", {
        communityId,
        systemPrompt: "",
        agentEnabled: false,
        agentDisplayName: "Slice 3 Guide",
        createdAt: now - DAY_MS,
        updatedAt: now - DAY_MS,
      });
    }

    const generalChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      systemRole: "general",
      status: "active",
      position: 0,
      createdByUserId: ownerId,
      createdAt: now - 20 * DAY_MS,
      updatedAt: now - 20 * DAY_MS,
    });

    // Listed free pod
    const listedPodChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "founders-pod",
      name: "Founders Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 10 * DAY_MS,
    });
    await ctx.db.insert("communityPods", {
      communityId,
      channelId: listedPodChannelId,
      purpose: "Weekly builder accountability",
      visibility: "listed",
      seats: 10,
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 10 * DAY_MS,
    });

    // Hidden pod
    const hiddenPodChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "secret-pod",
      name: "Secret Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 2,
      createdByUserId: ownerId,
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 10 * DAY_MS,
    });
    await ctx.db.insert("communityPods", {
      communityId,
      channelId: hiddenPodChannelId,
      purpose: "Invite-only leadership room",
      visibility: "hidden",
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 10 * DAY_MS,
    });

    // Listed paid pod
    const paidPodChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "vip-pod",
      name: "VIP Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 3,
      createdByUserId: ownerId,
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 10 * DAY_MS,
    });
    await ctx.db.insert("communityPods", {
      communityId,
      channelId: paidPodChannelId,
      purpose: "Paid mastermind",
      visibility: "listed",
      priceAmountBaseUnits: 5000,
      priceCurrency: "usd",
      providerPriceId: "price_vip_123",
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 10 * DAY_MS,
    });

    const addMember = async (userId: any, role: "admin" | "moderator" | "member") =>
      ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role,
        state: "active",
        activationSequence: 1,
        activatedAt: now - 10 * DAY_MS,
        createdAt: now - 10 * DAY_MS,
        updatedAt: now - 10 * DAY_MS,
      });

    await addMember(adminId, "admin");
    await addMember(modId, "moderator");
    const samMem = await addMember(samId, "member");
    const julesMem = await addMember(julesId, "member");
    const patMem = await addMember(planMemberId, "member");

    // Seed Jules with a PAID seat and Pat with a PLAN seat in founders-pod
    await ctx.db.insert("communityChannelParticipants", {
      communityId,
      channelId: listedPodChannelId,
      principalKey: `user:${String(julesId)}`,
      status: "active",
      reasons: ["paid"],
      membershipId: julesMem,
      membershipActivationSequence: 1,
      createdByUserId: ownerId,
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 5 * DAY_MS,
    });
    await ctx.db.insert("communityChannelParticipants", {
      communityId,
      channelId: listedPodChannelId,
      principalKey: `user:${String(planMemberId)}`,
      status: "active",
      reasons: ["plan"],
      membershipId: patMem,
      membershipActivationSequence: 1,
      createdByUserId: ownerId,
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 5 * DAY_MS,
    });

    // Seed a live post in General for pin/unpin testing
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId: generalChannelId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Welcome to Slice 3 Club!",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "root_pin_1",
      createdAt: now - 3 * HOUR_MS,
      updatedAt: now - 3 * HOUR_MS,
    });

    // Seed an existing historical Daily Founder Brief
    await ctx.db.insert("communityFounderBriefs", {
      communityId,
      ownerUserId: ownerId,
      briefDate: "2026-11-20",
      status: "sent",
      windowStartMs: now - 6 * DAY_MS,
      windowEndMs: now - 5 * DAY_MS,
      leaseExpiresAt: now - 5 * DAY_MS,
      attempts: 1,
      writer: "deterministic",
      delivery: {
        threadId: "thread_brief_slice3",
        markdown: "### Yesterday\n- 2 new members joined.",
        emailPayload: {},
        communityLifecycleGeneration: 0,
        writer: "deterministic",
      },
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 5 * DAY_MS,
      sentAt: now - 5 * DAY_MS,
    });

    return {
      communityId,
      ownerId,
      adminId,
      modId,
      samId,
      julesId,
      planMemberId,
      outsiderId,
      samMem,
      generalChannelId,
      listedPodChannelId,
      hiddenPodChannelId,
      paidPodChannelId,
      rootId,
    };
  });
}

function makeDoor(
  t: ReturnType<typeof convexTest>,
  world: Awaited<ReturnType<typeof seedWorld>>,
  who: "owner" | "admin" | "mod" | "sam",
  doorKind: "external_mcp" | "community_agent_for_member",
) {
  const map = {
    owner: { userId: world.ownerId, subject: "sub_owner" },
    admin: { userId: world.adminId, subject: "sub_admin" },
    mod: { userId: world.modId, subject: "sub_mod" },
    sam: { userId: world.samId, subject: "sub_sam" },
  }[who];
  const actor = t.withIdentity({ subject: map.subject });
  const ctxProxy = {
    runQuery: (fn: any, fnArgs: any) => actor.query(fn, fnArgs),
    runMutation: (fn: any, fnArgs: any) => actor.mutation(fn, fnArgs),
    runAction: (fn: any, fnArgs: any) => actor.action(fn, fnArgs),
  };
  return async (
    toolName: string,
    args: Record<string, unknown>,
    opts?: { personSaidYes?: boolean; idempotencyKey?: string },
  ) => {
    const named = actionTool(toolName);
    const translated = named
      ? translateActionTool(
          named,
          { community: SLUG, ...args, ...(opts?.idempotencyKey ? { idempotency_key: opts.idempotencyKey } : {}) },
          Date.now(),
        )
      : null;
    return await executePolynetCanonicalTool({
      ctx: ctxProxy as any,
      authSubject: map.subject,
      userId: String(map.userId),
      principalKind: doorKind,
      evidenceSurface: doorKind === "external_mcp" ? "external_mcp" : "member_agent_dock",
      ...(doorKind === "external_mcp" ? { ownAiApp: "Claude" } : { mountedCommunityId: String(world.communityId) }),
      toolName: (translated ? translated.toolName : toolName) as any,
      input: translated ? translated.input : args,
      ...(opts?.personSaidYes ? { personSaidYes: true } : {}),
    });
  };
}

describe("Slice 3: Community Notes editing, Pods parity, Channel Pinning, and Daily Brief paused banner", () => {
  test("owners & admins create/update/delete community notes (with Yes/No on delete) and pin/unpin channel posts; members & mods fail closed", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    for (const doorKind of ["external_mcp", "community_agent_for_member"] as const) {
      const owner = makeDoor(t, w, "owner", doorKind);
      const admin = makeDoor(t, w, "admin", doorKind);
      const mod = makeDoor(t, w, "mod", doorKind);
      const sam = makeDoor(t, w, "sam", doorKind);

      // Members and moderators fail closed on notes writes and channel pinning.
      for (const nonBuilder of [mod, sam]) {
        const saveDenied: any = await nonBuilder("polynet_save_community_note", {
          title: "Unauthorized",
          text: "Should fail",
        });
        expect(saveDenied.ok).toBe(false);

        const pinDenied: any = await nonBuilder("polynet_pin_post", {
          channel: "general",
          post: `interaction:root:${String(w.rootId)}`,
        });
        expect(pinDenied.ok).toBe(false);
      }

      // Admin creates a community note.
      const created: any = await admin("polynet_save_community_note", {
        title: `House Guide ${doorKind}`,
        text: "Welcome to our shared community guide.",
      });
      expect(created.ok).toBe(true);
      expect(created.value.result.action).toBe("created");
      const slug = created.value.result.slug;

      // Owner updates that note.
      const updated: any = await owner("polynet_save_community_note", {
        slug,
        title: `House Guide ${doorKind} v2`,
        text: "Updated shared community guide.",
      });
      expect(updated.ok).toBe(true);
      expect(updated.value.result).toMatchObject({ action: "updated", slug });

      // Deleting asks Yes/No first, then deletes on Yes.
      const askDel: any = await owner(
        "polynet_delete_community_note",
        { slug },
        { idempotencyKey: `del-note-${doorKind}` },
      );
      expect(askDel.ok).toBe(true);
      expect(askDel.value.status).toBe("waiting_for_person");
      expect(askDel.value.question).toContain(`Delete the community note "House Guide ${doorKind} v2"?`);

      const doneDel: any = await owner(
        "polynet_delete_community_note",
        { slug },
        { personSaidYes: true, idempotencyKey: `del-note-yes-${doorKind}` },
      );
      expect(doneDel.ok).toBe(true);
      expect(doneDel.value.result).toMatchObject({ action: "deleted", slug });

      // Channel pin & unpin.
      const pinRes: any = await admin("polynet_pin_post", {
        channel: "general",
        post: `interaction:root:${String(w.rootId)}`,
      });
      expect(pinRes.ok).toBe(true);
      expect(pinRes.value.result.pinned_post).toBe(`interaction:root:${String(w.rootId)}`);

      const unpinRes: any = await owner("polynet_pin_post", {
        channel: "general",
        post: null,
      });
      expect(unpinRes.ok).toBe(true);
      expect(unpinRes.value.result.pinned_post).toBeNull();
    }
  });

  test("pods builder view & management, paid/plan seat protection, Guide seating confirmation, and member join request fail closed properly", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);

    const owner = makeDoor(t, w, "owner", "external_mcp");
    const admin = makeDoor(t, w, "admin", "external_mcp");
    const mod = makeDoor(t, w, "mod", "external_mcp");
    const sam = makeDoor(t, w, "sam", "external_mcp");

    // 1. Members & moderators fail closed on builder/pods.json and builder pod actions.
    for (const nonBuilder of [mod, sam]) {
      const readPods: any = await nonBuilder("polynet_read", { path: `${ROOT}builder/pods.json` });
      expect(readPods.ok).toBe(false);

      const updDenied: any = await nonBuilder("polynet_update_pod", {
        pod: "founders-pod",
        purpose: "Hijacked",
      });
      expect(updDenied.ok).toBe(false);
    }

    // 2. Member requests to join listed free pod -> pending; fails closed on hidden & paid pods!
    const hiddenReq: any = await sam("polynet_request_join_pod", { pod: "secret-pod" });
    expect(hiddenReq.ok).toBe(false);
    expect(hiddenReq.code).toBe("pod_not_found");

    const paidReq: any = await sam("polynet_request_join_pod", { pod: "vip-pod" });
    expect(paidReq.ok).toBe(false);
    expect(paidReq.code).toBe("pod_is_paid");

    const listedReq: any = await sam("polynet_request_join_pod", { pod: "founders-pod" }, { idempotencyKey: "req-pod-sam-1" });
    expect(listedReq.ok).toBe(true);
    expect(listedReq.value.result).toMatchObject({ pod: "founders-pod", status: "pending" });

    // Declining and retrying the exact same idempotencyKey replays the original receipt and NEVER reopens the declined request.
    const declineReq: any = await admin("polynet_decide_pod_request", {
      pod: "founders-pod",
      member: "sam",
      approve: false,
    });
    expect(declineReq.ok).toBe(true);
    expect(declineReq.value.result.status).toBe("declined");

    const retryReq: any = await sam("polynet_request_join_pod", { pod: "founders-pod" }, { idempotencyKey: "req-pod-sam-1" });
    expect(retryReq.ok).toBe(true);
    expect(retryReq.value.deduped).toBe(true);
    const reqRowAfterRetry = await t.run((ctx) =>
      ctx.db
        .query("communityPodRequests")
        .withIndex("by_channel_user", (q) => q.eq("channelId", w.listedPodChannelId).eq("userId", w.samId))
        .first(),
    );
    expect(reqRowAfterRetry?.status).toBe("declined");

    // A brand-new request with a fresh idempotency key creates a fresh pending request for the rest of the flow.
    const freshReq: any = await sam("polynet_request_join_pod", { pod: "founders-pod" }, { idempotencyKey: "req-pod-sam-2" });
    expect(freshReq.ok).toBe(true);
    expect(freshReq.value.result).toMatchObject({ pod: "founders-pod", status: "pending" });

    // 3. Builder reads builder/pods.json and sees all 3 pods + Sam's pending request + Jules paid seat + Pat plan seat.
    const podsDoc: any = await admin("polynet_read", { path: `${ROOT}builder/pods.json` });
    expect(podsDoc.ok).toBe(true);
    const podsJson = JSON.parse(podsDoc.value.body);
    expect(podsJson.pod_count).toBe(3);
    const founders = podsJson.pods.find((p: any) => p.slug === "founders-pod");
    expect(founders.requests).toHaveLength(1);
    expect(founders.requests[0].handle).toBe("sam");
    expect(founders.guide_seated).toBe(false);
    expect(founders.members.find((m: any) => m.handle === "jules").paid_seat).toBe(true);
    expect(founders.members.find((m: any) => m.handle === "pat").from_plan).toBe(true);

    // 4. Admin updates pod details and approves Sam's request, then makes Sam host.
    const updPod: any = await admin("polynet_update_pod", {
      pod: "founders-pod",
      purpose: "Weekly founder shipping circle",
      seats: 12,
    });
    expect(updPod.ok).toBe(true);

    const approveReq: any = await admin("polynet_decide_pod_request", {
      pod: "founders-pod",
      member: "sam",
      approve: true,
    });
    expect(approveReq.ok).toBe(true);
    expect(approveReq.value.result.status).toBe("approved");

    const hostRes: any = await owner("polynet_set_pod_host", {
      pod: "founders-pod",
      member: "sam",
      host: true,
    });
    expect(hostRes.ok).toBe(true);
    expect(hostRes.value.result.host).toBe(true);

    // 5. Removing PAID member (Jules) or PLAN member (Pat) fails closed BEFORE Yes/No card!
    const remPaid: any = await owner("polynet_remove_pod_members", {
      pod: "founders-pod",
      members: ["jules"],
    });
    expect(remPaid.ok).toBe(false);
    expect(remPaid.code).toBe("paid_pod_member_use_studio");

    const remPlan: any = await owner("polynet_remove_pod_members", {
      pod: "founders-pod",
      members: ["pat"],
    });
    expect(remPlan.ok).toBe(false);
    expect(remPlan.code).toBe("pod_seat_from_plan");

    // 6. Removing non-paying member (Sam) asks Yes/No first, then removes cleanly on Yes!
    const askRem: any = await owner(
      "polynet_remove_pod_members",
      { pod: "founders-pod", members: ["sam"] },
      { idempotencyKey: "rem-sam-pod" },
    );
    expect(askRem.ok).toBe(true);
    expect(askRem.value.status).toBe("waiting_for_person");
    expect(askRem.value.question).toContain('Remove Sam Member from the "Founders Pod" pod?');

    const doneRem: any = await owner(
      "polynet_remove_pod_members",
      { pod: "founders-pod", members: ["sam"] },
      { personSaidYes: true, idempotencyKey: "rem-sam-pod-yes" },
    );
    expect(doneRem.ok).toBe(true);
    expect(doneRem.value.result.removed).toHaveLength(1);

    // 7. Re-add Sam directly via polynet_add_pod_members.
    const reAdd: any = await admin("polynet_add_pod_members", {
      pod: "founders-pod",
      members: ["sam"],
    });
    expect(reAdd.ok).toBe(true);
    expect(reAdd.value.result.added).toHaveLength(1);

    // 8. Seating community AI in pod asks Yes/No first, then updates guide_seated on Yes!
    const askSeat: any = await owner(
      "polynet_set_pod_guide_seat",
      { pod: "founders-pod", seated: true },
      { idempotencyKey: "seat-guide-1" },
    );
    expect(askSeat.ok).toBe(true);
    expect(askSeat.value.status).toBe("waiting_for_person");
    expect(askSeat.value.question).toContain('Seat the community AI in the "Founders Pod" pod?');

    const doneSeat: any = await owner(
      "polynet_set_pod_guide_seat",
      { pod: "founders-pod", seated: true },
      { personSaidYes: true, idempotencyKey: "seat-guide-1-yes" },
    );
    expect(doneSeat.ok).toBe(true);
    expect(doneSeat.value.result).toMatchObject({ pod: "founders-pod", guide_seated: true });

    // 9. Owner can set themselves as pod host & requesting to join returns member immediately; duplicate remove_members fails before Yes/No!
    const ownerHost: any = await owner("polynet_set_pod_host", {
      pod: "founders-pod",
      member: "neil",
      host: true,
    });
    expect(ownerHost.ok).toBe(true);
    expect(ownerHost.value.result.host).toBe(true);

    const ownerReq: any = await owner("polynet_request_join_pod", { pod: "founders-pod" });
    expect(ownerReq.ok).toBe(true);
    expect(ownerReq.value.result.status).toBe("member");

    const dupRemove: any = await owner("polynet_remove_pod_members", {
      pod: "founders-pod",
      members: ["sam", "sam"],
    });
    expect(dupRemove.ok).toBe(false);
    expect(dupRemove.code).toBe("invalid_tool_args");

    // 10. End-to-end answerGuideQuestion for community.note.delete returns the right result line (never "Posted in #the channel as you.").
    const createdForAnswer: any = await owner("polynet_save_community_note", {
      title: "Delete Via Card",
      text: "Will be deleted via Yes/No card.",
    });
    expect(createdForAnswer.ok).toBe(true);
    const delSlug = createdForAnswer.value.result.slug;
    const askCard: any = await owner(
      "polynet_delete_community_note",
      { slug: delSlug },
      { idempotencyKey: "del-via-card-1" },
    );
    expect(askCard.ok).toBe(true);
    expect(askCard.value.status).toBe("waiting_for_person");
    const questions = await t.run((ctx) => ctx.db.query("communityGuideQuestions").collect());
    const delQ = questions.find((q) => String(q.question).includes("Delete Via Card"));
    expect(delQ).toBeTruthy();
    const answered: any = await t.withIdentity({ subject: "sub_owner" }).action(
      api.communityGuideQuestions.answerGuideQuestion,
      { communityId: w.communityId, questionId: delQ!._id, answer: "yes" },
    );
    expect(answered.status).toBe("done");
    expect(answered.line).toBe("The community note was deleted.");
  });

  test("builder/brief.md shows a clear paused notice when community downgraded from Chief of Staff or Guide is turned off", async () => {
    const tDowngraded = convexTest(schema, modules);
    const wDown = await seedWorld(tDowngraded, { planTier: "guide", agentEnabled: true });
    const ownerDown = makeDoor(tDowngraded, wDown, "owner", "external_mcp");
    const briefDown: any = await ownerDown("polynet_read", { path: `${ROOT}builder/brief.md` });
    expect(briefDown.ok).toBe(true);
    expect(briefDown.value.body).toContain("Daily Founder Briefs are currently paused because this community is not on the Chief of Staff plan.");
    expect(briefDown.value.body).toContain("2 new members joined.");

    const tOff = convexTest(schema, modules);
    const wOff = await seedWorld(tOff, { planTier: "chief_of_staff", agentEnabled: false });
    const ownerOff = makeDoor(tOff, wOff, "owner", "external_mcp");
    const briefOff: any = await ownerOff("polynet_read", { path: `${ROOT}builder/brief.md` });
    expect(briefOff.ok).toBe(true);
    expect(briefOff.value.body).toContain("Daily Founder Briefs are currently paused because the community Guide is turned off.");
  });
});
