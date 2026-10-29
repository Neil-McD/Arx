/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { sampleFormAnswers } from "./communityTestMemberAutoplay";

const modules = import.meta.glob([
  "./auth.ts",
  "./authActor.ts",
  "./communityClients.ts",
  "./communityForms.ts",
  "./communityFormRequests.ts",
  "./communityInteractions.ts",
  "./communityMemberWorkflows.ts",
  "./communityResourceProgress.ts",
  "./communityTestMemberAutoplay.ts",
  "./communityTestMembers.ts",
  "./_generated/**/*.*s",
]);

const OWNER = "autoplay-owner";
const nowMs = 1_787_478_400_000;

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const lessonBody = [
  "Install it.",
  "",
  "```button installed required",
  "I installed Claude Code",
  "```",
  "",
  "```quiz which required",
  "Where do you run it?",
  "- [ ] In Word",
  "- [x] In a terminal",
  "```",
].join("\n");

async function fixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: OWNER, displayName: "Ada Builder", createdAt: nowMs, updatedAt: nowMs });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: nowMs, updatedAt: nowMs });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "autoplay", name: "Autoplay", lifecycleStatus: "active", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 0, createdAt: nowMs, updatedAt: nowMs,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId, createdByUserId: ownerId, status: "live", name: "Start", sortOrder: 1, createdAt: nowMs, updatedAt: nowMs,
    });
    const lessonId = await ctx.db.insert("communityResources", {
      communityId, moduleId, createdByUserId: ownerId, type: "post", role: "page", status: "published", lesson: { order: 1 },
      title: "Install Claude Code", bodyMd: lessonBody, bodyChars: lessonBody.length, pinned: false, sortOrder: 1, createdAt: nowMs, updatedAt: nowMs,
    } as any);
    for (const [key, name, questions] of [
      ["intake", "Intake", [
        { key: "goal", title: "Your goal", description: "", type: "long_text", required: true, options: [] },
        { key: "size", title: "Team size", description: "", type: "single_choice", required: true, options: ["Solo", "2-10"] },
      ]],
      ["checkpoint", "Checkpoint", [{ key: "proof", title: "Link to your setup", description: "", type: "short_text", required: true, options: [] }]],
    ] as const) {
      const formId = await ctx.db.insert("communityForms", {
        communityId, key, name, questions: questions as any, revision: 1, publishedRevision: 1, createdAt: nowMs, updatedAt: nowMs,
      });
      await ctx.db.insert("communityFormVersions", { communityId, formId, revision: 1, name, questions: questions as any, publishedBy: ownerId, publishedAt: nowMs });
    }
    await ctx.db.insert("communityMemberWorkflows", {
      communityId, welcomeGate: false, revision: 1, createdByUserId: ownerId, updatedByUserId: ownerId,
      milestones: [
        { key: "welcome", name: "Welcome", automations: [
          { key: "join", trigger: { type: "member_joined" }, action: { key: "send-intake", type: "request_form", formKey: "intake" } },
          { key: "greet", trigger: { type: "form_submitted", formKey: "intake" }, action: { key: "say-hi", type: "prompt_agent", prompt: "Welcome them" } },
          { key: "lesson", trigger: { type: "lesson_completed", resourceId: String(lessonId) },
            action: { key: "send-checkpoint", type: "request_form", formKey: "checkpoint" } },
        ] },
        { key: "week1", name: "First week", automations: [
          { key: "checkin", timerGeneration: "g1", trigger: { type: "milestone_elapsed", delayMinutes: 1440 },
            action: { key: "check-in", type: "prompt_agent", prompt: "Check in" } },
          { key: "intro", trigger: { type: "member_contributed" }, action: { key: "reply", type: "prompt_agent", prompt: "Reply to their intro" } },
        ] },
      ],
      createdAt: nowMs, updatedAt: nowMs,
    } as any);
    return { ownerId, communityId };
  });
}

test("sample answers fit each question's type and format", () => {
  expect(sampleFormAnswers([
    { key: "a", title: "Name", description: "", type: "short_text", required: true, options: [] },
    { key: "b", title: "Seats", description: "", type: "short_text", required: true, options: [], answerFormat: "number" },
    { key: "c", title: "Start", description: "", type: "short_text", required: true, options: [], answerFormat: "date" },
    { key: "d", title: "Site", description: "", type: "short_text", required: true, options: [], answerFormat: "url" },
    { key: "e", title: "Tools", description: "", type: "multiple_choice", required: true, options: ["x", "y"] },
  ], "Test member 1", nowMs)).toEqual({ a: "Sample answer from Test member 1", b: "3", c: "2026-08-23", d: "https://example.com", e: ["0"] });
});

test("autoplay walks a test member through the whole Workflow, previewing agent steps", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(nowMs);
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER });
  const started = await owner.mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const args = { communityId: f.communityId, testMemberId: started.id as any };

  const beats: string[] = [];
  let status = "";
  for (let i = 0; i < 20 && status !== "finished"; i += 1) {
    const step = await owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, args);
    status = step.status;
    if (step.beat) beats.push(`${step.beat.ok ? "ok" : "failed"}: ${step.beat.text}`);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  }
  expect(status).toBe("finished");
  expect(beats).toEqual([
    "ok: Filled in the Intake form with sample answers",
    "ok: Clicked “I installed Claude Code” in “Install Claude Code”",
    "ok: Answered the quiz “Where do you run it?” in “Install Claude Code”",
    "ok: Marked “Install Claude Code” complete",
    "ok: Filled in the Checkpoint form with sample answers",
    "ok: Posted an intro in the general channel",
    "ok: Skipped the 1 day wait",
  ]);

  // The test member's own tab follows along: it reads the latest step, and where it happened.
  const mine: any = await owner.query(api.communityTestMembers.getMyTestRun, { authSubject: started.auth_subject });
  expect(mine.autoplay).toMatchObject({ text: "Skipped the 1 day wait", path: null });
  await owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, { ...args, stop: true });
  expect((await owner.query(api.communityTestMembers.getMyTestRun, { authSubject: started.auth_subject }) as any).autoplay).toBeNull();

  const sequence = await owner.query(api.communityTestMembers.getTestRunSequence, args);
  expect(sequence.completed_at).not.toBeNull();
  expect(sequence.stages.flatMap((stage: any) => stage.steps.map((step: any) => [step.key, step.status, step.note])))
    .toEqual([["join", "done", null], ["greet", "done", "Previewed, not sent"], ["lesson", "done", null],
      ["checkin", "done", "Previewed, not sent"], ["intro", "done", "Previewed, not sent"]]);
  // Nothing went to the agent.
  expect(await t.run(async (ctx) => (await ctx.db.query("communityAgentServeRequests").collect()).length)).toBe(0);

  // Ending the run takes the intro post down with it.
  await owner.mutation(api.communityTestMembers.endTestMember, args);
  const posts = await t.run(async (ctx) => (await ctx.db.query("communityInteractionRoots").collect()).map((row) => row.status));
  expect(posts).toEqual(["hidden"]);
});

test("on screen, the member tab does the step; one it doesn't take up is done in the background", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(nowMs);
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER });
  const started = await owner.mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const args = { communityId: f.communityId, testMemberId: started.id as any, onScreenPace: 300 };
  const asTest = { authSubject: started.auth_subject };

  // The owner's player hands the form to the member tab.
  await expect(owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, args))
    .resolves.toMatchObject({ status: "acting", beat: { text: "Filled in the Intake form with sample answers", on_screen: true } });
  const step = (await owner.query(api.communityTestMembers.getMyTestRun, asTest) as any).autoplay_step;
  expect(step).toMatchObject({ kind: "form", formName: "Intake", pace: 300, answers: { size: "0" } });
  await owner.mutation(api.communityTestMemberAutoplay.reportAutoplayScreenStep, { ...asTest, stepId: step.id, phase: "seen" });
  await expect(owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, args)).resolves.toMatchObject({ status: "acting" });

  // The member tab fills it in through the member's own form, then says it's done.
  const forms = await owner.query(api.communityFormRequests.listMyRequests, { ...asTest, communityId: f.communityId }) as any[];
  await owner.mutation(api.communityFormRequests.saveMyAnswers, { ...asTest, communityId: f.communityId, requestId: forms[0].id,
    expectedRevision: 0, answers: step.answers, submit: true });
  await owner.mutation(api.communityTestMemberAutoplay.reportAutoplayScreenStep, { ...asTest, stepId: step.id, phase: "finished", ok: true });
  await expect(owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, args))
    .resolves.toMatchObject({ status: "acted", beat: { ok: true, on_screen: true, text: "Filled in the Intake form with sample answers" } });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  // The next step nobody takes up: after a few seconds Autoplay does it itself.
  await expect(owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, args)).resolves.toMatchObject({ status: "acting" });
  vi.setSystemTime(nowMs + 6_000);
  const fallback = await owner.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, args);
  expect(fallback.beat).toMatchObject({ ok: true, text: "Clicked “I installed Claude Code” in “Install Claude Code”" });
  expect(fallback.beat?.on_screen).toBeUndefined();
  expect(fallback.beat?.detail).toContain("member tab isn't open");
});
