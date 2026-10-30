import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityWelcomeLessonIds } from "./communityCore";
import { requestIsCurrent } from "./communityFormRequestCore";
import { memberFormQuestions, saveOwnAnswers } from "./communityFormRequests";
import { createCommunityInteractionComposerMessageCore } from "./communityInteractions";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { runWorkflowTimerNow } from "./communityMemberWorkflows";
import { lessonElements, listMemberVisibleLessonPages, readProgressRows, saveOwnLessonResponse, setOwnResourceProgress } from "./communityResourceProgress";
import { findTestMemberByUserId, type TestMemberRow } from "./communityTestMemberCore";
import { durationText, requireMyTestMember } from "./communityTestMembers";
import type { CommunityFormQuestion } from "../shared/communityForms";
import { communityTrackLessonIds } from "./communityLessonTracks";

// Autoplay: a test member goes through the Workflow by itself, one step per
// call, doing what a member would do: answer forms, click through lessons,
// post, and wait out timed steps (skipped). The page calls it on a timer, so
// Play, Pause, Step and speed are the page's; the server only does the next
// thing. While it plays, agent steps are previewed, not sent.
//
// In the background the server does each step itself. On screen, it hands the
// step to the test member's own tab, which does it in the real member screens
// (moving a cursor, typing, clicking) and says when it's done. A step the tab
// doesn't take up or finish is done in the background instead, and says so.

/** Agent previews last this long after the last step, so a paused run goes back to normal. */
const AUTOPLAY_WINDOW_MS = 60_000;
const DONE_KEEP = 200;
/** On screen: how long the member tab has to take up a step, then to finish it. */
const SCREEN_SEEN_MS = 5_000;
const SCREEN_FINISH_MS = 45_000;
const POST_TEXT = (label: string) => `Hi everyone, I'm ${label}. (A test post from Autoplay; it's removed when the test run ends.)`;

export type AutoplayBeat = {
  kind: "form" | "lesson_step" | "lesson_done" | "post" | "wait"; text: string; ok: boolean; detail?: string;
  /** Where in the community it happened and the words on what was pressed, for the member tab to show. */
  path?: string; target?: string;
  /** Done by the member tab in the real screens, rather than in the background. */
  on_screen?: boolean;
};

/** The next thing the test member would do, with what it takes to do it either way. */
type Plan =
  | { kind: "form"; text: string; path: string; target: string; requestId: string; formName: string;
      questions: Array<{ key: string; title: string; type: CommunityFormQuestion["type"]; options: string[]; answerFormat?: string }>; answers: Record<string, string | string[]> }
  | { kind: "lesson_step"; text: string; path: string; target: string; resourceId: string; lessonTitle: string; welcome: boolean;
      elementId: string; elementType: "button" | "checklist" | "quiz"; elementName: string; value: true | string[]; choiceLabels: string[] }
  | { kind: "lesson_done"; text: string; path: string; target: string; resourceId: string; lessonTitle: string; welcome: boolean }
  | { kind: "post"; text: string; path: string; target: string; ruleKey: string; visit: string; channelId: string | null; message: string }
  | { kind: "wait"; text: string; timerId: string };

/** Answers a form the way a member might, valid for each question's type and format. */
export function sampleFormAnswers(questions: CommunityFormQuestion[], label: string, nowMs: number): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {};
  for (const q of questions) {
    if (q.type === "single_choice") { if (q.options.length) answers[q.key] = "0"; continue; }
    if (q.type === "multiple_choice") { if (q.options.length) answers[q.key] = ["0"]; continue; }
    answers[q.key] = q.answerFormat === "number" ? "3"
      : q.answerFormat === "date" ? new Date(nowMs).toISOString().slice(0, 10)
      : q.answerFormat === "url" ? "https://example.com"
      : q.type === "long_text" ? `Sample answer from ${label} to “${q.title}”. Autoplay wrote this to test the Workflow.`
      : `Sample answer from ${label}`;
  }
  return answers;
}

function quoted(text: string | undefined, fallback: string): string {
  const value = String(text ?? "").trim();
  return value ? `“${value.length > 60 ? `${value.slice(0, 60)}…` : value}”` : fallback;
}

function errorText(error: unknown): string {
  return String(error instanceof Error ? error.message : error).replace(/_/g, " ");
}

type Scope = { ctx: any; row: TestMemberRow; membership: any; communityId: any; base: string; done: Set<string> };

async function remember(scope: Scope, ...keys: string[]) {
  for (const key of keys) scope.done.add(key);
  await scope.ctx.db.patch(scope.row._id, { autoplayDone: [...scope.done].slice(-DONE_KEEP) });
}

async function currentVisit(scope: Scope) {
  const { ctx, communityId, membership } = scope;
  const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId });
  if (!workflow?.milestones.length) return null;
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  return { workflow, current: resolveCurrentMilestone({ workflow, membership, state }) };
}


/** What the test member would do next, or why there's nothing: finished, or waiting on rules still running. */
async function planNext(scope: Scope): Promise<Plan | "finished" | "idle"> {
  const { ctx, row, membership, communityId, base, done } = scope;
  const nowMs = Date.now();
  const userId = row.userId;

  // 1. A form waiting for them: fill it in and send it.
  const pending = await ctx.db.query("communityFormRequests")
    .withIndex("by_member_status", (q: any) => q.eq("membershipId", membership._id).eq("status", "pending")).take(20);
  for (const request of pending) {
    if (done.has(`form:${request._id}`) || !await requestIsCurrent(ctx, request)) continue;
    const version = await ctx.db.get(request.versionId);
    if (!version) continue;
    const questions = await memberFormQuestions(ctx, communityId, version.questions);
    return { kind: "form", text: `Filled in the ${version.name} form with sample answers`, path: `${base}/chat`, target: version.name,
      requestId: String(request._id), formName: version.name, answers: sampleFormAnswers(questions, row.label, nowMs),
      questions: questions.map((q: CommunityFormQuestion) => ({ key: q.key, title: q.title, type: q.type, options: q.options,
        ...(q.answerFormat ? { answerFormat: q.answerFormat } : {}) })) };
  }

  const visit = await currentVisit(scope);
  if (!visit || visit.current.completedAt) return "finished";
  const { workflow, current } = visit;
  const visitKey = `${current.milestone.key}:${current.milestoneEnteredAt}`;
  const runs = await ctx.db.query("communityMemberWorkflowRuns")
    .withIndex("by_workflow_membership_createdAt", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
    .order("desc").take(200);
  const ranThisVisit = (ruleKey: string) => runs.some((run: any) => run.automationKey === ruleKey
    && run.milestoneKey === current.milestone.key && run.milestoneEnteredAt === current.milestoneEnteredAt);
  const open = current.milestone.automations.filter((rule: any) => !ranThisVisit(rule.key));

  // 2. Lessons: the welcome lessons, then any lesson or course a rule here waits for.
  const source = await listMemberVisibleLessonPages(ctx, communityId);
  const moduleOrder = new Map(source.modules.map((module: any) => [String(module._id), module.sortOrder ?? 0]));
  const pages = [...source.pages].sort((a: any, b: any) =>
    (moduleOrder.get(String(a.moduleId)) ?? 0) - (moduleOrder.get(String(b.moduleId)) ?? 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const progress = await readProgressRows(ctx, communityId, userId);
  const finished = new Set(progress.filter((p: any) => p.status === "done").map((p: any) => String(p.resourceId)));
  const welcome = await communityWelcomeLessonIds(ctx, communityId);
  const wanted: any[] = pages.filter((page: any) => welcome.has(String(page._id)));
  for (const rule of open) {
    const trigger: any = rule.trigger;
    if (trigger.type === "lesson_completed") {
      const page = trigger.resourceId ? pages.find((p: any) => String(p._id) === trigger.resourceId)
        : pages.find((p: any) => !finished.has(String(p._id)) && !done.has(`lesson:${p._id}`)) ?? pages[0];
      if (page) wanted.push(page);
    } else if (trigger.type === "track_completed") {
      const ids = await communityTrackLessonIds(ctx, communityId, trigger.trackKey ?? "main");
      wanted.push(...ids.map((id) => pages.find((p: any) => String(p._id) === id)).filter(Boolean));
    } else if (trigger.type === "course_completed") {
      const moduleId = trigger.moduleId ?? pages.find((p: any) => p.moduleId)?.moduleId;
      wanted.push(...pages.filter((p: any) => moduleId && String(p.moduleId) === String(moduleId)));
    }
  }
  for (const page of wanted) {
    const id = String(page._id);
    if (finished.has(id) || done.has(`lesson:${id}`)) continue;
    const title = quoted(page.title, "a lesson");
    const isWelcome = welcome.has(id);
    const lessonPath = isWelcome ? `${base}/chat` : `${base}/resources${page.moduleId ? `/${encodeURIComponent(String(page.moduleId))}` : ""}`;
    const responses = progress.find((p: any) => String(p.resourceId) === id)?.responses ?? [];
    const complete = new Set(responses.filter((r: any) => r.complete).map((r: any) => r.element));
    for (const element of await lessonElements(ctx, page)) {
      if (complete.has(element.id) || element.type === "form" || done.has(`element:${id}:${element.id}`)) continue;
      if (element.type === "button" && element.action !== "confirm" && element.action !== undefined && !element.required) continue;
      const choices = element.choices ?? [];
      const value: true | string[] = element.type === "button" ? true
        : element.type === "checklist" ? choices.map((choice) => choice.id)
        : element.correct?.length ? element.correct : choices.slice(0, 1).map((choice) => choice.id);
      const text = element.type === "button" ? `Clicked ${quoted(element.label ?? element.prompt, "a button")} in ${title}`
        : element.type === "checklist" ? `Ticked every item of ${quoted(element.prompt, "a checklist")} in ${title}`
        : `Answered the quiz ${quoted(element.prompt, "")} in ${title}`.replace("  ", " ");
      return { kind: "lesson_step", text, path: lessonPath, resourceId: id, lessonTitle: String(page.title ?? ""), welcome: isWelcome,
        target: element.type === "button" ? String(element.label ?? element.prompt ?? "") : String(element.prompt ?? ""),
        elementId: element.id, elementType: element.type as "button" | "checklist" | "quiz",
        elementName: String(element.prompt || element.label || element.type), value,
        choiceLabels: Array.isArray(value) ? choices.filter((choice) => value.includes(choice.id)).map((choice) => choice.label) : [] };
    }
    return { kind: "lesson_done", text: `Marked ${title} complete`, path: lessonPath, target: String(page.title ?? ""),
      resourceId: id, lessonTitle: String(page.title ?? ""), welcome: isWelcome };
  }

  // 3. A rule waiting for them to post: post an intro where it listens.
  for (const rule of open) {
    const trigger: any = rule.trigger;
    if (trigger.type !== "member_contributed" || done.has(`post:${visitKey}:${rule.key}`)) continue;
    const channelId = trigger.channelId ? ctx.db.normalizeId("communityChannels", trigger.channelId) : null;
    const channel: any = channelId ? await ctx.db.get(channelId) : await ctx.db.query("communityChannels")
      .withIndex("by_community_systemRole", (q: any) => q.eq("communityId", communityId).eq("systemRole", "general")).first();
    const channelPath = `${base}/chat${channel?.slug && channel.slug !== "general" ? `/${encodeURIComponent(channel.slug)}` : ""}`;
    return { kind: "post", text: `Posted an intro in ${channel?.name ? `#${channel.name}` : "the general channel"}`, path: channelPath, target: "Send",
      ruleKey: rule.key, visit: visitKey, channelId: channelId ? String(channelId) : null, message: POST_TEXT(row.label) };
  }

  // 4. Timed steps: skip the wait on the next one due.
  const timers = (await ctx.db.query("communityMemberWorkflowTimers")
    .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id)).take(100))
    .filter((timer: any) => timer.status === "pending").sort((a: any, b: any) => a.dueAt - b.dueAt);
  if (timers.length) {
    const timer: any = timers[0];
    const rule: any = current.milestone.automations.find((r: any) => r.key === timer.automationKey);
    const wait = rule?.trigger?.type === "milestone_elapsed" || rule?.trigger?.delayMinutes ? durationText(rule.trigger.delayMinutes) : "timed";
    return { kind: "wait", text: `Skipped the ${wait} wait`, timerId: String(timer._id) };
  }
  return "idle";
}

/** Does the step in the background, as the test member. */
async function runInBackground(scope: Scope, plan: Plan): Promise<AutoplayBeat> {
  const { ctx, row, communityId } = scope;
  const userId = row.userId;
  const beat = (ok: boolean, detail?: string, text = plan.text): AutoplayBeat => ({ kind: plan.kind, text, ok,
    ...(detail ? { detail } : {}), ...("path" in plan ? { path: plan.path, target: plan.target } : {}) });
  if (plan.kind === "form") {
    await remember(scope, `form:${plan.requestId}`);
    try {
      const request = await ctx.db.get(ctx.db.normalizeId("communityFormRequests", plan.requestId));
      if (!request) throw new Error("form_request_not_found");
      await saveOwnAnswers(ctx, { expectedRevision: request.revision, answers: plan.answers, submit: true }, request);
      return beat(true);
    } catch (error) { return beat(false, errorText(error), `Couldn't send the ${plan.formName} form`); }
  }
  if (plan.kind === "lesson_step") {
    await remember(scope, `element:${plan.resourceId}:${plan.elementId}`);
    const saved: any = await saveOwnLessonResponse(ctx, { userId, communityId, resourceId: plan.resourceId, element: plan.elementId, value: plan.value });
    return beat(saved.ok !== false, saved.ok === false ? saved.message : undefined);
  }
  if (plan.kind === "lesson_done") {
    await remember(scope, `lesson:${plan.resourceId}`);
    const marked: any = await setOwnResourceProgress(ctx, { userId, communityId, resourceId: plan.resourceId, status: "done" });
    return beat(marked.ok !== false, marked.ok === false ? marked.message : undefined);
  }
  if (plan.kind === "post") {
    try {
      const channelId = plan.channelId ? ctx.db.normalizeId("communityChannels", plan.channelId) : null;
      const result: any = await createCommunityInteractionComposerMessageCore(ctx, {
        communityId, ...(channelId ? { channelId } : {}), idempotencyKey: `autoplay:${row._id}:${plan.visit}:${plan.ruleKey}`,
        text: plan.message, skipAgentIntake: true,
      }, userId);
      const rootId = result?.interaction?.root_id;
      await remember(scope, `post:${plan.visit}:${plan.ruleKey}`, ...(rootId ? [`posted:${rootId}`] : []));
      return beat(true);
    } catch (error) {
      await remember(scope, `post:${plan.visit}:${plan.ruleKey}`);
      return beat(false, errorText(error), "Couldn't post");
    }
  }
  const timer = await ctx.db.get(ctx.db.normalizeId("communityMemberWorkflowTimers", plan.timerId));
  return beat(!!timer && await runWorkflowTimerNow(ctx, timer));
}

/** After the member tab says it's done (or gives up): did the step really happen? Also remembers it. */
async function screenStepHappened(scope: Scope, plan: Plan, issuedAt: number): Promise<boolean> {
  const { ctx, row, communityId } = scope;
  if (plan.kind === "form") {
    const request = await ctx.db.get(ctx.db.normalizeId("communityFormRequests", plan.requestId));
    const happened = !!request && request.status !== "pending";
    if (happened) await remember(scope, `form:${plan.requestId}`);
    return happened;
  }
  if (plan.kind === "lesson_step" || plan.kind === "lesson_done") {
    const progress = (await readProgressRows(ctx, communityId, row.userId)).find((p: any) => String(p.resourceId) === plan.resourceId);
    const happened = plan.kind === "lesson_done" ? progress?.status === "done"
      : !!progress?.responses?.some((r: any) => r.element === plan.elementId && r.complete);
    if (happened) await remember(scope, plan.kind === "lesson_done" ? `lesson:${plan.resourceId}` : `element:${plan.resourceId}:${plan.elementId}`);
    return happened;
  }
  if (plan.kind === "post") {
    const roots = await ctx.db.query("communityInteractionRoots")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId).gte("createdAt", issuedAt)).take(50);
    const mine = roots.find((root: any) => String(root.actorUserId) === String(row.userId) && root.status === "live");
    if (mine) await remember(scope, `post:${plan.visit}:${plan.ruleKey}`, `posted:${mine._id}`);
    return !!mine;
  }
  return false;
}

type StepResult = { status: "acted" | "acting" | "idle" | "finished" | "stopped"; beat: AutoplayBeat | null };

export const autoplayTestMemberStep = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    testMemberId: v.id("communityTestMembers"),
    /** Pause: agent steps go back to sending as soon as autoplay stops. */
    stop: v.optional(v.boolean()),
    /** Hand each step to the test member's own tab to do on screen, at this many ms per move. */
    onScreenPace: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<StepResult> => {
    const { row, membership } = await requireMyTestMember(ctx, args);
    const nowMs = Date.now();
    if (args.stop) {
      await ctx.db.patch(row._id, { autoplayUntil: undefined, autoplayPending: undefined });
      return { status: "stopped", beat: null };
    }
    await ctx.db.patch(row._id, { autoplayUntil: nowMs + AUTOPLAY_WINDOW_MS });
    const community: any = await ctx.db.get(args.communityId);
    const scope: Scope = { ctx, row, membership, communityId: args.communityId, done: new Set(row.autoplayDone ?? []),
      base: `/c/${encodeURIComponent(String(community?.slug ?? ""))}` };
    const settle = async (beat: AutoplayBeat): Promise<StepResult> => {
      await ctx.db.patch(row._id, { autoplayPending: undefined, autoplayLast: { at: Date.now(), text: beat.text,
        ...(beat.path ? { path: beat.path } : {}), ...(beat.target ? { target: beat.target } : {}) } });
      return { status: "acted", beat };
    };

    // A step the member tab has: wait for it, then check it really happened.
    const pending = row.autoplayPending;
    if (pending) {
      const plan = pending.plan as Plan;
      const unseen = !pending.seenAt && nowMs - pending.issuedAt > SCREEN_SEEN_MS;
      const overdue = nowMs - pending.issuedAt > SCREEN_FINISH_MS;
      if (!pending.reportedAt && !unseen && !overdue) return { status: "acting", beat: { kind: plan.kind, text: plan.text, ok: true, on_screen: true } };
      if (await screenStepHappened(scope, plan, pending.issuedAt)) {
        return await settle({ kind: plan.kind, text: plan.text, ok: true, on_screen: true, ...("path" in plan ? { path: plan.path, target: plan.target } : {}) });
      }
      const beat = await runInBackground(scope, plan);
      const why = unseen ? "The member tab isn't open, so Autoplay did this in the background."
        : `Not finished on screen${pending.reportDetail ? ` (${pending.reportDetail})` : ""}, so Autoplay did it in the background.`;
      return await settle({ ...beat, detail: beat.detail ? `${beat.detail}. ${why}` : why });
    }

    const planned = await planNext(scope);
    if (planned === "finished" || planned === "idle") return { status: planned, beat: null };
    const plan = planned;
    if (args.onScreenPace === undefined || plan.kind === "wait") return await settle(await runInBackground(scope, plan));
    const pace = Math.max(40, Math.min(2_000, Math.round(args.onScreenPace)));
    await ctx.db.patch(row._id, { autoplayPending: { id: `${nowMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`, plan, pace, issuedAt: nowMs } });
    return { status: "acting", beat: { kind: plan.kind, text: plan.text, ok: true, on_screen: true } };
  },
});

/** From the test member's own tab: it took up the on-screen step, or finished (or gave up on) it. */
export const reportAutoplayScreenStep = mutation({
  args: {
    authSubject: v.optional(v.string()),
    stepId: v.string(),
    phase: v.union(v.literal("seen"), v.literal("finished")),
    ok: v.optional(v.boolean()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const row = await findTestMemberByUserId(ctx, userId);
    const pending = row?.autoplayPending;
    if (!row || row.endedAt !== undefined || !pending || pending.id !== args.stepId) return { ok: false };
    const nowMs = Date.now();
    await ctx.db.patch(row._id, { autoplayPending: args.phase === "seen" ? { ...pending, seenAt: pending.seenAt ?? nowMs }
      : { ...pending, seenAt: pending.seenAt ?? nowMs, reportedAt: nowMs, reportOk: args.ok ?? false,
        ...(args.detail ? { reportDetail: args.detail.slice(0, 200) } : {}) } });
    return { ok: true };
  },
});
