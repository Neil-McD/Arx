import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import { acquireAuthenticatedConvexRealtimeClient, type ConvexRealtimeEnsureSession } from "./convexRealtimeAuth";

export type CloudCommunityTestMember = {
  id: string;
  label: string;
  membership_id: string | null;
  created_at: string;
  /** The Workflow stage the run started in, when not the first. */
  start_milestone_key: string | null;
  /** Started by the viewer, who alone can open the community as it. */
  mine: boolean;
  auth_subject: string | null;
  /** Who the owner said this test member is; Autoplay writes in their words when the agent runs free. */
};
export type CloudCommunityTestMembers = { limit: number; test_members: CloudCommunityTestMember[] };
export type CloudCommunityTestMemberStarted = { id: string; label: string; auth_subject: string; membership_id: string };
export type CloudCommunityClientTimelineEntry = { at: string; type: string; summary: string; ref?: string; actor?: string };
export type CloudMyTestRunAutoplay = { at: string; text: string; path: string | null; target: string | null };
/** On screen: the step a test member's own tab should do now, in the real member screens. */
export type CloudAutoplayScreenStep = { id: string; pace: number; text: string; path?: string; target?: string } & (
  | { kind: "form"; formName: string; questions: Array<{ key: string; title: string; type: string; options: string[] }>; answers: Record<string, string | string[]> }
  | { kind: "lesson_step"; lessonTitle: string; welcome: boolean; elementType: "button" | "checklist" | "quiz"; elementName: string; choiceLabels: string[] }
  | { kind: "lesson_done"; lessonTitle: string; welcome: boolean }
  | { kind: "post"; message: string });
export type CloudMyTestRun = {
  label: string; community_id: string; community_slug: string | null; community_name: string | null;
  /** Autoplay's latest step while it plays. */
  autoplay?: CloudMyTestRunAutoplay | null;
  autoplay_step?: CloudAutoplayScreenStep | null;
};

export async function listCloudCommunityTestMembers(session: unknown, communityId: string): Promise<CloudCommunityTestMembers> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityTestMembers.listTestMembers, { authSubject, communityId: communityId as Id<"communities"> });
}

/**
 * Starts a test member; with a stage key it starts in that Workflow stage instead of joining at the first.
 */
export async function startCloudCommunityTestMember(session: unknown, communityId: string, milestoneKey?: string | null): Promise<CloudCommunityTestMemberStarted> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityTestMembers.startTestMember, {
    authSubject, communityId: communityId as Id<"communities">, ...(milestoneKey ? { milestoneKey } : {}),
  });
}

export type CloudTestRunStepStatus = "done" | "failed" | "running" | "scheduled" | "waiting" | "skipped" | "not_reached";
export type CloudTestRunStep = { key: string; when: string; does: string; status: CloudTestRunStepStatus; at: string | null; due_at: string | null; error: string | null; note?: string | null };
export type CloudTestRunStage = { key: string; name: string; is_current: boolean; reached: boolean; entered_at: string | null; steps: CloudTestRunStep[] };
export type CloudTestRunSequence = { stages: CloudTestRunStage[]; completed_at: string | null };

/** The test member's way through the Workflow, live: each stage's rules and whether they ran. */
export function subscribeCloudTestRunSequence<S>(params: {
  session: S; ensureSession: ConvexRealtimeEnsureSession<S>; communityId: string; testMemberId: string;
  update: (sequence: CloudTestRunSequence) => void; error: () => void;
}): () => void {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session: params.session, convexUrl: requireConvexUrl(), ensureSession: params.ensureSession });
  const watch = lease.client.watchQuery(api.communityTestMembers.getTestRunSequence, {
    authSubject: lease.authSubject, communityId: params.communityId as Id<"communities">,
    testMemberId: params.testMemberId as Id<"communityTestMembers">,
  });
  let closed = false;
  const publish = () => {
    if (closed) return;
    try {
      const value = watch.localQueryResult() as CloudTestRunSequence | undefined;
      if (value !== undefined) params.update(value);
    } catch { params.error(); }
  };
  const stop = watch.onUpdate(publish);
  publish();
  return () => { closed = true; stop(); lease.close(); };
}

/** Skips the wait on timed steps: one (by rule key) or all in the current stage. */
export async function runCloudTestMemberTimedStepsNow(session: unknown, communityId: string, testMemberId: string, automationKey?: string): Promise<number> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const result = await client.mutation(api.communityTestMembers.runTestMemberTimedStepsNow, {
    authSubject, communityId: communityId as Id<"communities">, testMemberId: testMemberId as Id<"communityTestMembers">,
    ...(automationKey ? { automationKey } : {}),
  });
  return result.ran;
}

export type CloudAutoplayBeat = { kind: "form" | "lesson_step" | "lesson_done" | "post" | "wait"; text: string; ok: boolean; detail?: string; on_screen?: boolean };
export type CloudAutoplayStep = { status: "acted" | "acting" | "idle" | "finished" | "stopped"; beat: CloudAutoplayBeat | null };

/** Autoplay: the test member does its next step by itself. With stop, Autoplay ends and agent steps send again. */
export async function autoplayCloudTestMemberStep(session: unknown, communityId: string, testMemberId: string,
  options: { stop?: boolean; onScreenPace?: number } = {}): Promise<CloudAutoplayStep> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityTestMemberAutoplay.autoplayTestMemberStep, {
    authSubject, communityId: communityId as Id<"communities">, testMemberId: testMemberId as Id<"communityTestMembers">,
    ...(options.stop ? { stop: true } : {}), ...(options.onScreenPace !== undefined ? { onScreenPace: options.onScreenPace } : {}),
  });
}

/** From a test-run tab: it took up Autoplay's on-screen step, or finished (or gave up on) it. */
export async function reportCloudAutoplayScreenStep(session: unknown, stepId: string, phase: "seen" | "finished", ok?: boolean, detail?: string): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  await client.mutation(api.communityTestMemberAutoplay.reportAutoplayScreenStep, {
    authSubject, stepId, phase, ...(ok !== undefined ? { ok } : {}), ...(detail ? { detail } : {}),
  });
}

export async function endCloudCommunityTestMember(session: unknown, communityId: string, testMemberId: string): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  await client.mutation(api.communityTestMembers.endTestMember, {
    authSubject, communityId: communityId as Id<"communities">, testMemberId: testMemberId as Id<"communityTestMembers">,
  });
}

/** In a test-run tab: who it acts as, or null once the run has ended. Throws when the server refuses the run. */
export async function getCloudMyTestRun(session: unknown): Promise<CloudMyTestRun | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityTestMembers.getMyTestRun, { authSubject });
}

/** In a test-run tab, live: who it acts as (null once ended) and Autoplay's latest step. */
export function subscribeCloudMyTestRun<S>(params: {
  session: S; ensureSession: ConvexRealtimeEnsureSession<S>;
  update: (run: CloudMyTestRun | null) => void; error: () => void;
}): () => void {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session: params.session, convexUrl: requireConvexUrl(), ensureSession: params.ensureSession });
  const watch = lease.client.watchQuery(api.communityTestMembers.getMyTestRun, { authSubject: lease.authSubject });
  let closed = false;
  const publish = () => {
    if (closed) return;
    try {
      const value = watch.localQueryResult() as CloudMyTestRun | null | undefined;
      if (value !== undefined) params.update(value);
    } catch { params.error(); }
  };
  const stop = watch.onUpdate(publish);
  publish();
  return () => { closed = true; stop(); lease.close(); };
}

/** The test member's record as it changes: what they did and what Workflows did for them. */
export function subscribeCloudCommunityClientTimeline<S>(params: {
  session: S;
  ensureSession: ConvexRealtimeEnsureSession<S>;
  communityId: string;
  membershipId: string;
  update: (entries: CloudCommunityClientTimelineEntry[]) => void;
  error: () => void;
}): () => void {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session: params.session, convexUrl: requireConvexUrl(), ensureSession: params.ensureSession });
  const watch = lease.client.watchQuery(api.communityClients.getClientTimeline, {
    authSubject: lease.authSubject,
    communityId: params.communityId as Id<"communities">,
    membershipId: params.membershipId,
  });
  let closed = false;
  const publish = () => {
    if (closed) return;
    try {
      const value = watch.localQueryResult() as { entries?: CloudCommunityClientTimelineEntry[] } | undefined;
      if (value === undefined) return;
      params.update(Array.isArray(value.entries) ? value.entries : []);
    } catch { params.error(); }
  };
  const stop = watch.onUpdate(publish);
  publish();
  return () => { closed = true; stop(); lease.close(); };
}
