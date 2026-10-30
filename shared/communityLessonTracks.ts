import { buildCommunityResourceEvidenceRef } from "./communityEvidenceContract";
import type { CommunityLessonFields } from "./communityLessonContract";

// Skill tracks: a community can show several roadmaps.
// Each track is an ordered path of stages over the one lesson library, so a
// lesson can sit in many tracks and a lesson done once counts in all of them.
// A checkpoint keeps the rest of its own track closed until it is done, and a
// track opens when every rule in opens_when holds. The track called "main" is
// the roadmap communities already have: unless the owner gave it stages of its
// own, they come from the lesson fields (stage, stage_order, order, gate).

export const COMMUNITY_MAIN_TRACK_KEY = "main";
export const COMMUNITY_TRACK_LIMITS = {
  tracks: 40, stages: 40, steps: 300, rules: 8, title: 120, summary: 600, outcomes: 6, outcome: 160, audience: 300,
} as const;

// The built-in covers, drawn in the community's own colours. A cover_url wins over them.
export const COMMUNITY_TRACK_COVER_STYLES = ["route", "diagram", "terminal"] as const;
export type CommunityTrackCoverStyle = (typeof COMMUNITY_TRACK_COVER_STYLES)[number];

export type CommunityTrackRule =
  | { type: "after_track"; track: string }
  | { type: "after_checkpoint"; resource_id: string }
  | { type: "workflow_stage"; milestone_key: string }
  | { type: "client_property"; property: string; equals: string | number | boolean }
  // Sold through the community's Offers: open to members on this offer or a higher one.
  | { type: "offer"; offer: string };

export type CommunityTrackStep = { resource_id: string; checkpoint?: boolean };
export type CommunityTrackStageDefinition = { name: string; steps: CommunityTrackStep[] };

export type CommunityTrackDefinition = {
  key: string;
  title: string;
  // The promise: one line on what the member walks away with.
  summary?: string | null;
  cover_url?: string | null;
  cover_style?: CommunityTrackCoverStyle | null;
  // "What you'll be able to do", up to six lines.
  outcomes?: string[];
  // "Who it's for".
  audience?: string | null;
  order: number;
  // "when_open" keeps a closed track off the member's list instead of "Coming up".
  show: "always" | "when_open";
  opens_when: CommunityTrackRule[];
  stages: CommunityTrackStageDefinition[];
  // The main track's stages are read from the lesson fields.
  derived?: boolean;
};

/** What a rule can be checked against for one member. */
export type CommunityTrackMemberContext = {
  // The member's Workflow stage and the Workflow's stage order, when they have one.
  workflowMilestoneKey?: string | null;
  workflowMilestoneOrder?: readonly string[];
  clientValues?: Readonly<Record<string, unknown>>;
  // The offers the member holds: their own and every one ranked below it.
  heldOffers?: readonly string[];
};

export type CommunityTrackStepView = {
  resource_id: string;
  ref: string;
  title: string;
  checkpoint: boolean;
  done: boolean;
  locked: boolean;
};

export type CommunityTrackStageView = {
  name: string;
  position: number;
  step_count: number;
  done_count: number;
  locked: boolean;
  // The checkpoint that keeps this stage closed, when it is in this track.
  blocked_by: string | null;
  steps: CommunityTrackStepView[];
};

export type CommunityTrackStatus = "locked" | "open" | "in_progress" | "done";

export type CommunityTrackView = {
  key: string;
  title: string;
  summary: string | null;
  cover_url: string | null;
  cover_style: CommunityTrackCoverStyle;
  outcomes: string[];
  audience: string | null;
  order: number;
  show: "always" | "when_open";
  derived: boolean;
  open: boolean;
  status: CommunityTrackStatus;
  // Plain words for a closed track: what opens it.
  opens_reason: string | null;
  opens_when: CommunityTrackRule[];
  step_count: number;
  done_count: number;
  // Sum of the lessons' minutes, when the owner gave any.
  minutes: number | null;
  next: { resource_id: string; ref: string; title: string; stage: string } | null;
  // A closed track that only an offer keeps closed: the offer to add, and its
  // first lesson, which stays open as a free preview.
  paid: { offer: string; offer_name: string; preview: { resource_id: string; ref: string; title: string } | null } | null;
  // A closed track that progress opens: how far the member is, and the lesson to do next.
  opens_progress: { done: number; total: number; next: { resource_id: string; ref: string; title: string } | null } | null;
  // Tracks this one's checkpoints open, keyed by checkpoint resource id.
  opens_tracks: Array<{ resource_id: string; track: string; title: string }>;
  stages: CommunityTrackStageView[];
};

type LibraryLesson = { id: string; title: string; lesson?: CommunityLessonFields | null };
type StepRef = { resource_id: string; ref: string; title: string };

const sortStages = <T extends { order: number; name: string }>(rows: T[]) =>
  rows.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

/** The main track's stages, grouped from the lesson fields the way the Roadmap always has. */
export function deriveCommunityMainTrackStages(lessons: readonly LibraryLesson[]): CommunityTrackStageDefinition[] {
  const byStage = new Map<string, { order: number; name: string; rows: LibraryLesson[] }>();
  for (const entry of lessons) {
    const stage = entry.lesson?.stage;
    if (!stage) continue;
    const group = byStage.get(stage) ?? { order: Number.MAX_SAFE_INTEGER, name: stage, rows: [] };
    group.order = Math.min(group.order, entry.lesson?.stage_order ?? Number.MAX_SAFE_INTEGER);
    group.rows.push(entry);
    byStage.set(stage, group);
  }
  return sortStages([...byStage.values()]).map((group) => ({
    name: group.name,
    steps: group.rows
      .sort((left, right) => (left.lesson?.order ?? 0) - (right.lesson?.order ?? 0) || left.title.localeCompare(right.title))
      .map((row) => ({ resource_id: row.id, ...(row.lesson?.gate ? { checkpoint: true } : {}) })),
  }));
}

/** The community's tracks with the main one filled in. Steps for lessons the member can't see are dropped. */
export function resolveCommunityTrackDefinitions(args: {
  stored: readonly CommunityTrackDefinition[];
  lessons: readonly LibraryLesson[];
  mainTitle?: string;
}): CommunityTrackDefinition[] {
  const visible = new Set(args.lessons.map((lesson) => lesson.id));
  const stored = args.stored.find((track) => track.key === COMMUNITY_MAIN_TRACK_KEY);
  const derivedStages = deriveCommunityMainTrackStages(args.lessons);
  const main: CommunityTrackDefinition | null = stored
    ? stored.stages.length ? stored : { ...stored, stages: derivedStages, derived: true }
    : derivedStages.length
      ? { key: COMMUNITY_MAIN_TRACK_KEY, title: args.mainTitle ?? "Roadmap", order: 0, show: "always", opens_when: [], stages: derivedStages, derived: true }
      : null;
  const tracks = [...(main ? [main] : []), ...args.stored.filter((track) => track.key !== COMMUNITY_MAIN_TRACK_KEY)];
  return tracks
    .map((track) => ({
      ...track,
      stages: track.stages
        .map((stage) => ({ ...stage, steps: stage.steps.filter((step) => visible.has(step.resource_id)) }))
        .filter((stage) => stage.steps.length > 0),
    }))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

function trackDone(track: CommunityTrackDefinition, doneRefs: ReadonlySet<string>) {
  const steps = track.stages.flatMap((stage) => stage.steps);
  return steps.length > 0 && steps.every((step) => doneRefs.has(buildCommunityResourceEvidenceRef(step.resource_id)));
}

function ruleHolds(
  rule: CommunityTrackRule,
  doneRefs: ReadonlySet<string>,
  byKey: ReadonlyMap<string, CommunityTrackDefinition>,
  context: CommunityTrackMemberContext,
): boolean {
  if (rule.type === "after_checkpoint") return doneRefs.has(buildCommunityResourceEvidenceRef(rule.resource_id));
  if (rule.type === "after_track") {
    const target = byKey.get(rule.track);
    return Boolean(target && trackDone(target, doneRefs));
  }
  if (rule.type === "workflow_stage") {
    // Reaching a stage keeps the track open after the member moves past it.
    const order = context.workflowMilestoneOrder ?? [];
    const current = context.workflowMilestoneKey ? order.indexOf(context.workflowMilestoneKey) : -1;
    const wanted = order.indexOf(rule.milestone_key);
    return current >= 0 && wanted >= 0 && current >= wanted;
  }
  if (rule.type === "offer") return (context.heldOffers ?? []).includes(rule.offer);
  const value = context.clientValues?.[rule.property];
  return Array.isArray(value) ? value.includes(rule.equals as never) : value === rule.equals;
}

/** One rule in plain words, for "Opens when…" lines and the owner's picker. */
export function describeCommunityTrackRule(
  rule: CommunityTrackRule,
  names: {
    trackTitle: (key: string) => string | null;
    lessonTitle: (id: string) => string | null;
    milestoneName?: (key: string) => string | null;
    offerName?: (key: string) => string | null;
  },
): string {
  if (rule.type === "offer") return `you add ${names.offerName?.(rule.offer) ?? "its offer"} to your plan`;
  if (rule.type === "after_checkpoint") return `you finish "${names.lessonTitle(rule.resource_id) ?? "a checkpoint"}"`;
  if (rule.type === "after_track") return `you finish ${names.trackTitle(rule.track) ?? "another track"}`;
  if (rule.type === "workflow_stage") return `you reach the ${names.milestoneName?.(rule.milestone_key) ?? rule.milestone_key} stage`;
  return "your community opens it for you";
}

/**
 * Every track for one member: which are open, where they stand, and what to do
 * next. lockedRefs holds the lessons the member can't start yet: a lesson is
 * locked when every track it is in has it locked, and a lesson in no track is
 * never locked. Computed on read, so a changed rule never leaves a stale lock.
 */
export function computeCommunityTracks(args: {
  tracks: readonly CommunityTrackDefinition[];
  lessons: readonly LibraryLesson[];
  doneRefs: ReadonlySet<string>;
  context?: CommunityTrackMemberContext;
  milestoneName?: (key: string) => string | null;
  offerName?: (key: string) => string | null;
}): { tracks: CommunityTrackView[]; lockedRefs: Set<string> } {
  const context = args.context ?? {};
  const titleById = new Map(args.lessons.map((lesson) => [lesson.id, lesson.title]));
  const minutesById = new Map(args.lessons.map((lesson) => [lesson.id, lesson.lesson?.minutes ?? 0]));
  const stepRef = (resourceId: string): StepRef =>
    ({ resource_id: resourceId, ref: buildCommunityResourceEvidenceRef(resourceId), title: titleById.get(resourceId) ?? "" });
  const byKey = new Map(args.tracks.map((track) => [track.key, track]));
  const names = {
    trackTitle: (key: string) => byKey.get(key)?.title ?? null,
    lessonTitle: (id: string) => titleById.get(id) ?? null,
    milestoneName: args.milestoneName,
    offerName: args.offerName,
  };
  const openedBy = new Map<string, Array<{ track: string; title: string }>>();
  for (const track of args.tracks) {
    for (const rule of track.opens_when) {
      if (rule.type !== "after_checkpoint") continue;
      openedBy.set(rule.resource_id, [...(openedBy.get(rule.resource_id) ?? []), { track: track.key, title: track.title }]);
    }
  }

  const lockedIn = new Map<string, boolean>();
  const views = args.tracks.map((track): CommunityTrackView => {
    const unmet = track.opens_when.filter((rule) => !ruleHolds(rule, args.doneRefs, byKey, context));
    const open = unmet.length === 0;
    const offerRule = unmet.find((rule): rule is Extract<CommunityTrackRule, { type: "offer" }> => rule.type === "offer");
    // Only an offer keeps it closed: the first lesson is a free preview.
    const previewId = offerRule && unmet.every((rule) => rule.type === "offer") ? track.stages[0]?.steps[0]?.resource_id ?? null : null;
    let blockedBy: string | null = open ? null : "";
    let stepCount = 0;
    let doneCount = 0;
    let next: CommunityTrackView["next"] = null;
    const stages = track.stages.map((stage, index): CommunityTrackStageView => {
      const locked = blockedBy !== null;
      const steps = stage.steps.map((step) => {
        const ref = buildCommunityResourceEvidenceRef(step.resource_id);
        const done = args.doneRefs.has(ref);
        const stepLocked = locked && step.resource_id !== previewId;
        lockedIn.set(ref, (lockedIn.get(ref) ?? true) && stepLocked);
        return { resource_id: step.resource_id, ref, title: titleById.get(step.resource_id) ?? "", checkpoint: Boolean(step.checkpoint), done, locked: stepLocked };
      });
      stepCount += steps.length;
      doneCount += steps.filter((step) => step.done).length;
      if (!locked && !next) {
        const first = steps.find((step) => !step.done);
        if (first) next = { resource_id: first.resource_id, ref: first.ref, title: first.title, stage: stage.name };
      }
      const view: CommunityTrackStageView = {
        name: stage.name,
        position: index + 1,
        step_count: steps.length,
        done_count: steps.filter((step) => step.done).length,
        locked,
        blocked_by: blockedBy || null,
        steps,
      };
      blockedBy = blockedBy ?? steps.find((step) => step.checkpoint && !step.done)?.ref ?? null;
      return view;
    });
    const allSteps = track.stages.flatMap((stage) => stage.steps);
    const minutes = allSteps.reduce((sum, step) => sum + (minutesById.get(step.resource_id) ?? 0), 0);
    const status: CommunityTrackStatus = !open
      ? "locked"
      : stepCount > 0 && doneCount === stepCount ? "done" : doneCount > 0 ? "in_progress" : "open";
    return {
      key: track.key,
      title: track.title,
      summary: track.summary ?? null,
      cover_url: track.cover_url ?? null,
      cover_style: track.cover_style ?? "route",
      outcomes: track.outcomes ?? [],
      audience: track.audience ?? null,
      order: track.order,
      show: track.show,
      derived: Boolean(track.derived),
      open,
      status,
      opens_reason: open ? null : `Opens when ${unmet.map((rule) => describeCommunityTrackRule(rule, names)).join(" and ")}`,
      opens_when: track.opens_when,
      step_count: stepCount,
      done_count: doneCount,
      minutes: minutes > 0 ? minutes : null,
      next,
      paid: offerRule
        ? { offer: offerRule.offer, offer_name: args.offerName?.(offerRule.offer) ?? offerRule.offer, preview: previewId ? stepRef(previewId) : null }
        : null,
      opens_progress: open ? null : progressToward(unmet.find((rule) => rule.type !== "offer"), args.tracks, args.doneRefs, stepRef),
      opens_tracks: track.stages.flatMap((stage) => stage.steps)
        .filter((step) => step.checkpoint || openedBy.has(step.resource_id))
        .flatMap((step) => (openedBy.get(step.resource_id) ?? [])
          .filter((target) => target.track !== track.key)
          .map((target) => ({ resource_id: step.resource_id, ...target }))),
      stages,
    };
  });
  const lockedRefs = new Set([...lockedIn].filter(([, locked]) => locked).map(([ref]) => ref));
  return { tracks: views, lockedRefs };
}

/**
 * Lessons a member can't read yet because they're sold: every track the lesson
 * is in is closed by an offer the member doesn't hold, and it isn't that
 * track's free first lesson. Checkpoints and other rules never hide a lesson's
 * text; only a sale does. A lesson that is also in a track the member has, or
 * in no track, stays readable.
 */
export function communityPaidLockedLessonIds(tracks: readonly CommunityTrackDefinition[], heldOffers: readonly string[]): Set<string> {
  const paid = new Set<string>();
  const free = new Set<string>();
  for (const track of tracks) {
    const sold = track.opens_when.some((rule) => rule.type === "offer" && !heldOffers.includes(rule.offer));
    const ids = track.stages.flatMap((stage) => stage.steps.map((step) => step.resource_id));
    ids.forEach((id, index) => (sold && index > 0 ? paid : free).add(id));
  }
  for (const id of free) paid.delete(id);
  return paid;
}

/**
 * How far a member is toward the rule that opens a track: the steps of the
 * track that leads there (up to the checkpoint, or the whole track), how many
 * are done, and the first one left. Null for rules progress doesn't answer.
 */
function progressToward(
  rule: CommunityTrackRule | undefined,
  tracks: readonly CommunityTrackDefinition[],
  doneRefs: ReadonlySet<string>,
  stepRef: (resourceId: string) => StepRef,
): CommunityTrackView["opens_progress"] {
  if (!rule) return null;
  let path: string[] | null = null;
  if (rule.type === "after_track") {
    path = tracks.find((track) => track.key === rule.track)?.stages.flatMap((stage) => stage.steps.map((step) => step.resource_id)) ?? null;
  } else if (rule.type === "after_checkpoint") {
    for (const track of tracks) {
      const ids = track.stages.flatMap((stage) => stage.steps.map((step) => step.resource_id));
      const at = ids.indexOf(rule.resource_id);
      if (at >= 0 && (!path || at + 1 < path.length)) path = ids.slice(0, at + 1);
    }
    path ??= [rule.resource_id];
  }
  if (!path?.length) return null;
  const refs = path.map(stepRef);
  const left = refs.filter((step) => !doneRefs.has(step.ref));
  return { done: refs.length - left.length, total: refs.length, next: left[0] ?? null };
}

/** Problems with a track the owner or an agent is saving, in plain words; empty when it can be saved. */
export function checkCommunityTrackDefinition(
  track: CommunityTrackDefinition,
  known: { lessonIds: ReadonlySet<string>; trackKeys: ReadonlySet<string>; offerKeys?: ReadonlySet<string> },
): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(track.key)) problems.push("The track key must be lowercase letters, digits and dashes.");
  if (!track.title.trim() || track.title.length > COMMUNITY_TRACK_LIMITS.title) problems.push("Give the track a title of up to 120 characters.");
  if ((track.summary ?? "").length > COMMUNITY_TRACK_LIMITS.summary) problems.push("Keep the summary under 600 characters.");
  if (track.cover_style && !COMMUNITY_TRACK_COVER_STYLES.includes(track.cover_style)) problems.push("The cover is route, diagram or terminal.");
  if ((track.outcomes ?? []).length > COMMUNITY_TRACK_LIMITS.outcomes) problems.push("List up to 6 things members will be able to do.");
  if ((track.outcomes ?? []).some((line) => !line.trim() || line.length > COMMUNITY_TRACK_LIMITS.outcome))
    problems.push("Keep each outcome to one line of up to 160 characters.");
  if ((track.audience ?? "").length > COMMUNITY_TRACK_LIMITS.audience) problems.push("Keep \"Who it's for\" under 300 characters.");
  if (track.opens_when.filter((rule) => rule.type === "offer").length > 1) problems.push("A track can be sold through one offer.");
  if (track.stages.length > COMMUNITY_TRACK_LIMITS.stages) problems.push("A track can have up to 40 sections.");
  if (track.opens_when.length > COMMUNITY_TRACK_LIMITS.rules) problems.push("A track can have up to 8 opening rules.");
  const steps = track.stages.flatMap((stage) => stage.steps);
  if (steps.length > COMMUNITY_TRACK_LIMITS.steps) problems.push("A track can have up to 300 steps.");
  const seen = new Set<string>();
  for (const stage of track.stages) {
    if (!stage.name.trim()) problems.push("Every section needs a name.");
  }
  for (const step of steps) {
    if (!known.lessonIds.has(step.resource_id)) problems.push(`Lesson ${step.resource_id} isn't in this community's library.`);
    if (seen.has(step.resource_id)) problems.push(`Lesson ${step.resource_id} is in this track twice.`);
    seen.add(step.resource_id);
  }
  for (const rule of track.opens_when) {
    if (rule.type === "after_track" && (rule.track === track.key || !known.trackKeys.has(rule.track)))
      problems.push(`"After track" must name another track (${rule.track}).`);
    if (rule.type === "after_checkpoint" && !known.lessonIds.has(rule.resource_id))
      problems.push(`Checkpoint ${rule.resource_id} isn't in this community's library.`);
    if (rule.type === "offer" && !(known.offerKeys ?? new Set()).has(rule.offer))
      problems.push(`Offer ${rule.offer} isn't one of this community's offers (Settings › Offers).`);
  }
  return [...new Set(problems)];
}
