import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { findTestMemberByUserId } from "./communityTestMemberCore";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { readMemberFactsForLens } from "./memberOntologyCore";
import { courseSummaries, listMemberVisibleLessonPages, readProgressRows } from "./communityResourceProgress";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { listActiveCommunityAccessIntegrations, readClientAccessForList, readCommunityAccessTimelineEntries, verifiedEmailOf } from "./communityAccessSync";
import { internal } from "./_generated/api";
import { sendCommunityManagerDirectMessage } from "./directMessages";
import { canonicalReceiptAttemptValidator, completeCanonicalOperationReceipt } from "./polynetCanonicalReceipts";
import {
  COMMUNITY_CLIENT_PROPERTY_LIMIT,
  COMMUNITY_CLIENT_STUCK_DEFAULT_DAYS,
  CommunityClientError,
  communityClientPropertyAcceptsQuestion,
  communityClientPropertyKey,
  communityClientValueFromAnswer,
  deriveCommunityClientStatus,
  deriveCommunityClientStuck,
  normalizeCommunityClientPropertyDraft,
  normalizeCommunityClientPropertyOptions,
  normalizeCommunityClientPropertyValue,
  type CommunityClientPropertyDefinition,
  type CommunityClientPropertyValue,
} from "../shared/communityClients";
import {
  COMMUNITY_CLIENT_BULK_LIMIT,
  COMMUNITY_CLIENT_DEFAULT_VIEWS,
  COMMUNITY_CLIENT_MESSAGE_MAX,
  COMMUNITY_CLIENT_VIEW_LIMIT,
  CommunityClientViewError,
  communityClientFields,
  communityClientViewKey,
  normalizeCommunityClientView,
  personalizeCommunityClientMessage,
} from "../shared/communityClientViews";

// The owner's client list. Every client field except owner properties is read
// fresh from the record that owns it; nothing here copies membership, payment,
// workflow, progress or member-fact state. Owners, admins and their agents only.

const CLIENT_PAGE_SIZE = 50;
const FACTS_PER_CLIENT = 12;

const toIso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

async function listActiveProperties(ctx: any, communityId: any) {
  const rows = await ctx.db.query("communityClientProperties")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_CLIENT_PROPERTY_LIMIT * 4);
  return rows.filter((row: any) => !row.archivedAt)
    .sort((a: any, b: any) => a.position - b.position || a.createdAt - b.createdAt);
}

function projectProperty(row: any) {
  return { key: row.key as string, name: row.name as string, type: row.type, options: row.options as string[], position: row.position as number,
    ...(row.system ? { system: row.system as "offer" } : {}) };
}

// Polynet keeps a system property (the member's offers) from the records that
// own it; the owner can move it but never edit, archive or overwrite it.
function requireOwnerEditable(row: any) {
  if (row.system) throw new CommunityClientError("client_property_system");
}

async function requireMembershipInCommunity(ctx: any, communityId: any, membershipId: string) {
  const id = ctx.db.normalizeId("communityMemberships", membershipId);
  const membership = id ? await ctx.db.get(id) : null;
  if (!membership || normalizeIdValue(membership.communityId) !== normalizeIdValue(communityId)) {
    throw new CommunityClientError("community_client_not_found");
  }
  return membership;
}

async function findProperty(ctx: any, communityId: any, key: string) {
  const row = await ctx.db.query("communityClientProperties")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", key))
    .unique();
  if (!row || row.archivedAt) throw new CommunityClientError("client_property_not_found", key);
  return row;
}

const managerArgs = { userId: v.id("users"), communityId: v.id("communities") };

async function listProperties(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  return { properties: (await listActiveProperties(ctx, args.communityId)).map(projectProperty) };
}

const createPropertyArgs = { ...managerArgs, name: v.string(), type: v.string(), options: v.optional(v.array(v.string())) };

async function createProperty(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const draft = normalizeCommunityClientPropertyDraft(args);
  const all = await ctx.db.query("communityClientProperties")
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .take(COMMUNITY_CLIENT_PROPERTY_LIMIT * 4);
  const active = all.filter((row: any) => !row.archivedAt);
  if (active.length >= COMMUNITY_CLIENT_PROPERTY_LIMIT) throw new CommunityClientError("client_property_limit_reached");
  if (active.some((row: any) => row.name.toLowerCase() === draft.name.toLowerCase())) {
    throw new CommunityClientError("client_property_name_taken");
  }
  // Keys are never reused, even after archiving, so old values never resurface.
  const base = communityClientPropertyKey(draft.name);
  const taken = new Set(all.map((row: any) => row.key));
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  const nowMs = Date.now();
  await ctx.db.insert("communityClientProperties", {
    communityId: args.communityId, key, name: draft.name, type: draft.type, options: draft.options,
    position: Math.max(-1, ...active.map((row: any) => row.position)) + 1,
    createdByUserId: args.userId, createdAt: nowMs, updatedAt: nowMs,
  });
  return { property: { key, name: draft.name, type: draft.type, options: draft.options } };
}

const updatePropertyArgs = {
  ...managerArgs, key: v.string(), name: v.optional(v.string()), options: v.optional(v.array(v.string())), position: v.optional(v.number()),
};

async function updateProperty(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await findProperty(ctx, args.communityId, args.key);
  if (args.name !== undefined || args.options !== undefined) requireOwnerEditable(row);
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (args.name !== undefined) {
    const { name } = normalizeCommunityClientPropertyDraft({ name: args.name, type: row.type, options: row.options });
    const clash = (await listActiveProperties(ctx, args.communityId))
      .some((other: any) => other.key !== row.key && other.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new CommunityClientError("client_property_name_taken");
    patch.name = name;
  }
  // A value whose option was removed reads as empty; it is not rewritten.
  if (args.options !== undefined) patch.options = normalizeCommunityClientPropertyOptions(row.type, args.options);
  if (args.position !== undefined) {
    if (!Number.isFinite(args.position)) throw new CommunityClientError("client_property_position_invalid");
    patch.position = args.position;
  }
  await ctx.db.patch(row._id, patch);
  return { property: projectProperty({ ...row, ...patch }) };
}

const archivePropertyArgs = { ...managerArgs, key: v.string() };

async function archiveProperty(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const row = await findProperty(ctx, args.communityId, args.key);
  requireOwnerEditable(row);
  const nowMs = Date.now();
  await ctx.db.patch(row._id, { archivedAt: nowMs, updatedAt: nowMs });
  return { archived: row.key };
}

const setValueArgs = {
  ...managerArgs, membershipId: v.string(), key: v.string(), value: v.any(),
  via: v.optional(v.union(v.literal("web"), v.literal("agent"))),
};

// Workflows call this too (via "workflow", as the builder who saved the
// Workflow), so a stage rule and an owner edit leave the same trail.
export async function setValue(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
  const property = await findProperty(ctx, args.communityId, args.key);
  requireOwnerEditable(property);
  return writeValue(ctx, { communityId: args.communityId, membership, property, actorUserId: args.userId,
    via: args.via ?? "web", value: normalizeCommunityClientPropertyValue(property, args.value) });
}

// A member's submitted form fills the properties its questions map to. The
// member is the actor; an answer that no longer fits its property is skipped,
// so a changed property never blocks the submission.
export async function writeMappedFormAnswers(ctx: any, args: {
  communityId: any; membership: any; questions: Array<{ key: string; type: string; options: string[]; clientPropertyKey?: string }>;
  answers: Record<string, string | string[]>;
}) {
  const written: string[] = [];
  for (const question of args.questions) {
    if (!question.clientPropertyKey) continue;
    const property = await ctx.db.query("communityClientProperties")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", question.clientPropertyKey))
      .unique();
    if (!property || property.archivedAt || property.system) continue;
    const answer = args.answers[question.key];
    let value = null;
    let fits = communityClientPropertyAcceptsQuestion(property.type, question.type);
    if (fits) { try { value = communityClientValueFromAnswer(property, question, answer); } catch { fits = false; } }
    if (!fits) {
      // Say so on the client's timeline, so the owner sees why the property stayed empty.
      if (answer !== undefined && answer !== "" && !(Array.isArray(answer) && !answer.length)) {
        await ctx.db.insert("communityClientEvents", { communityId: args.communityId, membershipId: args.membership._id,
          type: "property_skipped", actorUserId: args.membership.userId, via: "form", propertyKey: property.key,
          body: (question as { title?: string }).title ?? question.key, createdAt: Date.now() });
      }
      continue;
    }
    if (value === null) continue;
    await writeValue(ctx, { communityId: args.communityId, membership: args.membership, property,
      actorUserId: args.membership.userId, via: "form", value });
    written.push(property.key);
  }
  return written;
}

async function writeValue(ctx: any, args: { communityId: any; membership: any; property: any; actorUserId: any; via: string; value: any }) {
  const { membership, property, value } = args;
  const existing = await ctx.db.query("communityClientValues")
    .withIndex("by_membership_property", (q: any) => q.eq("membershipId", membership._id).eq("propertyKey", property.key))
    .unique();
  const via = args.via;
  const eventId = await ctx.db.insert("communityClientEvents", {
    communityId: args.communityId, membershipId: membership._id, type: "property_set", actorUserId: args.actorUserId, via,
    propertyKey: property.key, value, createdAt: Date.now(),
  });
  // Workflows → "When a member record changes". A Workflow step's own write
  // never fires it, so two automations can't keep setting each other off.
  if (via !== "workflow" && JSON.stringify(existing?.value ?? null) !== JSON.stringify(value ?? null)) {
    await ctx.scheduler.runAfter(0, (internal as any).communityMemberWorkflows.handleClientPropertyChangedInternal,
      { communityId: args.communityId, membershipId: membership._id, eventId });
  }
  if (value === null) {
    if (existing) await ctx.db.delete(existing._id);
  } else {
    const row = { value, updatedByUserId: args.actorUserId, updatedVia: via, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("communityClientValues", {
      communityId: args.communityId, membershipId: membership._id, propertyKey: property.key, ...row,
    });
  }
  return { membership_id: String(membership._id), key: property.key, value };
}

// Reads one stored value as its property defines it today, so a changed
// option list or type never shows a value that no longer fits.
function currentValue(property: CommunityClientPropertyDefinition, value: unknown): CommunityClientPropertyValue | null {
  try { return normalizeCommunityClientPropertyValue(property, value); } catch { return null; }
}

async function readLastSubmittedFormAt(ctx: any, membership: any) {
  const rows = await ctx.db.query("communityFormRequests")
    .withIndex("by_member_status", (q: any) => q.eq("membershipId", membership._id).eq("status", "submitted"))
    .order("desc").take(10);
  const current = rows.filter((row: any) => row.activationSequence === (membership.activationSequence ?? 0) && row.submittedAt);
  return { count: current.length, last_submitted_at_ms: Math.max(0, ...current.map((row: any) => row.submittedAt)) || null };
}

async function readLatestSubscription(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communitySubscriptions")
    .withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId))
    .take(20);
  return rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0] ?? null;
}

const CLIENT_EVENT_TYPES = ["flagged", "note", "drafted", "contacted"] as const;
const CLIENT_CONTACT_CHANNELS = ["email", "message", "call", "other"] as const;
const CLIENT_EVENT_BODY_MAX = 2000;
const TIMELINE_LIMIT = 100;

const recordEventArgs = {
  ...managerArgs, membershipId: v.string(), type: v.string(), body: v.optional(v.string()), channel: v.optional(v.string()),
  via: v.optional(v.union(v.literal("web"), v.literal("agent"))),
};

// The action log: what the owner or their agent did about a client, so two
// people (or an agent and its owner) never contact the same person twice.
async function recordEvent(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
  if (!(CLIENT_EVENT_TYPES as readonly string[]).includes(args.type)) throw new CommunityClientError("client_event_type_invalid");
  const body = typeof args.body === "string" ? args.body.trim() : "";
  if (body.length > CLIENT_EVENT_BODY_MAX || (args.type !== "flagged" && !body)) throw new CommunityClientError("client_event_body_invalid");
  if (args.channel !== undefined && (args.type !== "contacted" || !(CLIENT_CONTACT_CHANNELS as readonly string[]).includes(args.channel))) {
    throw new CommunityClientError("client_event_channel_invalid");
  }
  const createdAt = Date.now();
  await ctx.db.insert("communityClientEvents", {
    communityId: args.communityId, membershipId: membership._id, type: args.type, actorUserId: args.userId,
    via: args.via ?? "web", ...(body ? { body } : {}), ...(args.channel ? { channel: args.channel } : {}), createdAt,
  });
  return { membership_id: String(membership._id), type: args.type, at: toIso(createdAt) };
}

// The latest event of one type, however many others came after it.
async function readLatestOwnerEventAt(ctx: any, membershipId: any, type: "flagged" | "contacted"): Promise<number | undefined> {
  const row = await ctx.db.query("communityClientEvents")
    .withIndex("by_membership_type_createdAt", (q: any) => q.eq("membershipId", membershipId).eq("type", type))
    .order("desc").first();
  return row?.createdAt;
}

async function readOwnerEvents(ctx: any, membershipId: any, limit: number) {
  return await ctx.db.query("communityClientEvents")
    .withIndex("by_membership_createdAt", (q: any) => q.eq("membershipId", membershipId))
    .order("desc").take(limit);
}

type TimelineEntry = { at: number; type: string; summary: string; ref?: string; actor?: string };

const readTimelineArgs = { ...managerArgs, membershipId: v.string() };

// One client's history, newest first, read from the records that own each
// part: membership, Workflow transitions and runs, lesson progress and
// answers (buttons, checklists, quizzes), forms, subscriptions, and the
// owner's own action log. Nothing here is a second copy.
async function readTimeline(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await requireMembershipInCommunity(ctx, args.communityId, args.membershipId);
  const entries: TimelineEntry[] = [];
  const joinedAt = membership.activatedAt ?? membership.createdAt;
  const testMember = await findTestMemberByUserId(ctx, membership.userId);
  entries.push({ at: joinedAt, type: "joined", summary: testMember ? "Joined as a test member"
    : membership.accessSource === "paid_subscription" ? "Joined with a paid plan"
    : membership.accessSource === "manual_grant" ? "Added by the owner" : "Joined" });
  if (!communityMembershipRowIsActive(membership)) {
    entries.push({ at: membership.revokedAt ?? membership.updatedAt, type: "left", summary: "Left the community" });
  }
  const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
  const [transitions, runs, progressRows, forms, subscriptions, ownerEvents, resources] = await Promise.all([
    workflow ? ctx.db.query("communityMemberWorkflowTransitions")
      .withIndex("by_workflow_membership_seq", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
      .order("desc").take(TIMELINE_LIMIT) : Promise.resolve([]),
    workflow ? ctx.db.query("communityMemberWorkflowRuns")
      .withIndex("by_workflow_membership_createdAt", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
      .order("desc").take(TIMELINE_LIMIT) : Promise.resolve([]),
    readProgressRows(ctx, args.communityId, membership.userId),
    ctx.db.query("communityFormRequests")
      .withIndex("by_member_status", (q: any) => q.eq("membershipId", membership._id).eq("status", "submitted"))
      .order("desc").take(TIMELINE_LIMIT),
    ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).take(20),
    readOwnerEvents(ctx, membership._id, TIMELINE_LIMIT),
    listMemberVisibleLessonPages(ctx, args.communityId),
  ]);
  for (const row of transitions as any[]) {
    entries.push({ at: row.occurredAt, type: row.completedWorkflow ? "workflow_completed" : "stage_moved",
      summary: row.completedWorkflow ? `Finished the workflow from ${row.fromMilestoneName}`
        : `Moved from ${row.fromMilestoneName} to ${row.toMilestoneName ?? "the next stage"}${row.forcedByUserId ? " (moved by the owner)" : ""}` });
  }
  const formNames = new Map<string, string>();
  for (const row of runs as any[]) {
    if (row.status === "running") continue;
    const action = row.actionSnapshot ?? {};
    if (action.type === "request_form" && action.formKey && !formNames.has(action.formKey)) {
      const form = await ctx.db.query("communityForms")
        .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", action.formKey)).first();
      formNames.set(action.formKey, form?.name ?? action.formKey);
    }
    // What the Workflow did, in words: sending a form is not the member answering it.
    const code = row.actionResult?.resultCode;
    const did = code === "condition_skipped" ? "Workflow skipped a step (its “only if” didn't match)"
      : code === "path_skipped" ? "Workflow skipped a step (the step before it was skipped)"
      : action.type === "request_form" ? `Workflow sent the ${formNames.get(action.formKey)} form`
      : action.type === "set_client_property" ? `Workflow set ${action.propertyKey}`
      : action.type === "send_email" ? code === "email_opted_out" ? `Workflow skipped an email (they unsubscribed): ${action.subject}`
        : code === "email_previewed" ? `Workflow previewed an email (Autoplay, not sent): ${action.subject}`
        : code === "email_not_sent" ? `Workflow couldn't email them (no verified address): ${action.subject}` : `Workflow sent an email: ${action.subject}`
      : action.type === "set_pod_member" ? action.active ? "Workflow added them to a pod" : "Workflow took them out of a pod"
      : action.type === "create_service_channel" ? "Workflow created their personal pod"
      : action.type === "prompt_agent" ? row.actionResult?.resultCode === "agent_previewed"
        ? "Workflow previewed an agent message (Autoplay, not sent)" : "Workflow asked the agent to act"
      : `Workflow ran ${String(action.type ?? "an action").replace(/_/g, " ")}`;
    entries.push({ at: row.finishedAt ?? row.updatedAt, type: row.status === "failed" ? "workflow_action_failed" : "workflow_action",
      summary: row.status === "failed" ? `${did}: failed (${String(row.errorCode ?? "unknown").replace(/_/g, " ")})` : `${did} (${row.milestoneName})` });
  }
  const titleById = new Map(resources.pages.map((page: any) => [normalizeIdValue(page._id), page.title ?? "Lesson"]));
  for (const row of progressRows as any[]) {
    const title = titleById.get(normalizeIdValue(row.resourceId)) ?? "A lesson";
    const ref = `resource:${normalizeIdValue(row.resourceId)}`;
    entries.push({ at: row.startedAt, type: "lesson_started", summary: `Started ${title}`, ref });
    if (row.status === "done" && row.completedAt) entries.push({ at: row.completedAt, type: "lesson_done", summary: `Finished ${title}`, ref });
    for (const response of row.responses ?? []) {
      entries.push({ at: response.at, type: "lesson_answered", ref,
        summary: `${title}: answered ${response.element}${response.correct === true ? " (right)" : response.correct === false ? " (wrong)" : ""}` });
    }
  }
  for (const row of forms as any[]) {
    if (!row.submittedAt) continue;
    const version = await ctx.db.get(row.versionId);
    entries.push({ at: row.submittedAt, type: "form_submitted", summary: `Submitted ${version?.name ?? "a form"}` });
  }
  for (const row of subscriptions as any[]) {
    entries.push({ at: row.createdAt, type: "subscription_started", summary: "Started paying" });
    if (row.updatedAt > row.createdAt && row.status !== "active") {
      entries.push({ at: row.endedAt ?? row.updatedAt, type: "subscription_changed",
        summary: `Subscription ${row.status.replace(/_/g, " ")}${row.cancelAtPeriodEnd ? " (cancels at period end)" : ""}` });
    }
  }
  for (const row of ownerEvents as any[]) {
    const who = row.via === "agent" ? "Agent" : row.via === "workflow" ? "Workflow" : row.via === "form" ? "Form" : "Owner";
    const summary = row.type === "property_set" ? `${who} set ${row.propertyKey} to ${row.value === null ? "empty" : JSON.stringify(row.value)}`
      : row.type === "property_skipped" ? `Form answer to “${row.body}” didn’t fit ${row.propertyKey}, so it wasn’t saved`
      : row.type === "flagged" ? `${who} flagged${row.body ? `: ${row.body}` : ""}`
      : row.type === "contacted" ? `${who} contacted by ${row.channel ?? "other"}: ${row.body}`
      : `${who} ${row.type === "drafted" ? "drafted a message" : "added a note"}: ${row.body}`;
    entries.push({ at: row.createdAt, type: row.type, summary, actor: row.via });
  }
  entries.push(...await readCommunityAccessTimelineEntries(ctx, { communityId: args.communityId, membership, limit: TIMELINE_LIMIT }));
  entries.sort((a, b) => b.at - a.at);
  return {
    kind: "community_client_timeline",
    membership_id: String(membership._id),
    read_at: new Date().toISOString(),
    entries: entries.slice(0, TIMELINE_LIMIT).map(({ at, ...entry }) => ({ at: toIso(at), ...entry })),
    truncated: entries.length > TIMELINE_LIMIT,
  };
}

function clampStuckDays(days: number) {
  if (!Number.isFinite(days)) throw new CommunityClientError("client_stuck_days_invalid");
  return Math.min(365, Math.max(1, Math.round(days)));
}

async function readSettings(ctx: any, communityId: any) {
  return await ctx.db.query("communityClientSettings")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).unique();
}

const setSettingsArgs = { ...managerArgs, stuckDays: v.number() };

async function setSettings(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const stuckDays = clampStuckDays(args.stuckDays);
  const existing = await readSettings(ctx, args.communityId);
  const row = { stuckDays, updatedByUserId: args.userId, updatedAt: Date.now() };
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert("communityClientSettings", { communityId: args.communityId, ...row });
  return { stuck_days: stuckDays };
}

// stuckDays here previews another rule without saving it.
const listClientsArgs = { ...managerArgs, cursor: v.optional(v.string()), stuckDays: v.optional(v.number()) };

async function listClients(ctx: any, args: any) {
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const nowMs = Date.now();
  const settings = await readSettings(ctx, args.communityId);
  const stuckDays = args.stuckDays !== undefined ? clampStuckDays(args.stuckDays)
    : settings?.stuckDays ?? COMMUNITY_CLIENT_STUCK_DEFAULT_DAYS;
  const [properties, lessons, workflow, integrations] = await Promise.all([
    listActiveProperties(ctx, args.communityId),
    listMemberVisibleLessonPages(ctx, args.communityId),
    getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId }),
    listActiveCommunityAccessIntegrations(ctx, args.communityId),
  ]);
  const definitions = properties.map(projectProperty);
  const page = await ctx.db.query("communityMemberships")
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .paginate({ numItems: CLIENT_PAGE_SIZE, cursor: args.cursor ?? null });

  const clients = await Promise.all(page.page.map(async (membership: any) => {
    const active = communityMembershipRowIsActive(membership);
    const [profile, subscription, progressRows, forms, facts, values, milestoneState, lastFlaggedAt, lastContactedAt, referral, testMember, access, user, presence] = await Promise.all([
      resolveUserProfileDisplayProjection(ctx, membership.userId),
      readLatestSubscription(ctx, membership._id),
      readProgressRows(ctx, args.communityId, membership.userId),
      active ? readLastSubmittedFormAt(ctx, membership) : Promise.resolve({ count: 0, last_submitted_at_ms: null }),
      readMemberFactsForLens(ctx, { subjectUserId: membership.userId,
        lens: { kind: "founder_admin", communityId: String(args.communityId) }, scope: { communityId: args.communityId } }),
      ctx.db.query("communityClientValues").withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id))
        .take(COMMUNITY_CLIENT_PROPERTY_LIMIT * 4),
      workflow && active ? getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id }) : Promise.resolve(null),
      readLatestOwnerEventAt(ctx, membership._id, "flagged"),
      readLatestOwnerEventAt(ctx, membership._id, "contacted"),
      ctx.db.query("communityReferrals")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", membership.userId)).first(),
      findTestMemberByUserId(ctx, membership.userId),
      readClientAccessForList(ctx, { community, membership, integrations, nowMs }),
      ctx.db.get(membership.userId),
      ctx.db.query("communityPresence")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", membership.userId)).first(),
    ]);
    const stage = workflow && active && workflow.milestones.length
      ? (() => { try { return resolveCurrentMilestone({ workflow, membership, state: milestoneState }); } catch { return null; } })()
      : null;
    const joinedAtMs = membership.activatedAt ?? membership.createdAt;
    const lessonDoneAtMs = Math.max(0, ...progressRows.map((row: any) => row.completedAt ?? 0)) || null;
    const lessonTouchedAtMs = Math.max(0, ...progressRows.map((row: any) => row.updatedAt ?? 0)) || null;
    const lastProgressAtMs = Math.max(joinedAtMs, lessonDoneAtMs ?? 0, forms.last_submitted_at_ms ?? 0, stage?.milestoneEnteredAt ?? 0);
    const lastActiveAtMs = Math.max(lastProgressAtMs, lessonTouchedAtMs ?? 0);
    const valueByKey = new Map(values.map((row: any) => [row.propertyKey, row.value]));
    return {
      membership_id: String(membership._id),
      user_id: String(membership.userId),
      name: profile.display_name,
      avatar_url: profile.avatar_url ?? null,
      // An owner's test run, not a real member: leave it out of real-member work.
      is_test: Boolean(testMember),
      // Verified emails only, the same address connected services get. Test members have none.
      email: testMember ? null : verifiedEmailOf(user),
      status: deriveCommunityClientStatus({
        active,
        subscription: subscription ? { status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null,
      }),
      role: membership.role,
      access_source: membership.accessSource ?? null,
      joined_at: toIso(joinedAtMs),
      left_at: active ? null : toIso(membership.revokedAt ?? membership.updatedAt),
      subscription: subscription ? {
        status: subscription.status,
        cancel_at_period_end: subscription.cancelAtPeriodEnd,
        current_period_end_at: toIso(subscription.currentPeriodEndAt),
      } : null,
      stage: stage ? { key: stage.milestone.key, name: stage.milestone.name, color: stage.milestone.color ?? null, entered_at: toIso(stage.milestoneEnteredAt),
        completed_at: toIso(stage.completedAt) } : null,
      courses: courseSummaries(lessons, progressRows),
      lessons_done: progressRows.filter((row: any) => row.status === "done").length,
      last_lesson_done_at: toIso(lessonDoneAtMs),
      forms_submitted: forms.count,
      last_form_submitted_at: toIso(forms.last_submitted_at_ms),
      last_active_at: toIso(lastActiveAtMs),
      // When they last had the community open (presence heartbeat), signed in or not doing anything.
      last_seen_at: toIso(presence?.lastSeenAt),
      last_progress_at: toIso(lastProgressAtMs),
      stuck: deriveCommunityClientStuck({ active, lastProgressAtMs, nowMs, days: stuckDays }),
      last_flagged_at: toIso(lastFlaggedAt),
      last_contacted_at: toIso(lastContactedAt),
      // The ref on the join link this member arrived by, first touch.
      referred_by: referral ? referral.ref : null,
      // Plan, what they can use (community, courses, each connected service)
      // and until when: the same answer a paid MCP server gets.
      access,
      facts: facts.slice(0, FACTS_PER_CLIENT).map((fact: any) => ({ kind: fact.kind, body: fact.body, provenance: fact.provenance })),
      properties: Object.fromEntries(definitions.map((property: any) => [property.key, currentValue(property, valueByKey.get(property.key) ?? null)])),
    };
  }));
  return {
    kind: "community_client_list",
    read_at: new Date(nowMs).toISOString(),
    stuck_days: stuckDays,
    properties: definitions,
    fields: communityClientFields({ properties: definitions, courses: courseSummaries(lessons, []) }),
    clients,
    next_cursor: page.isDone ? null : page.continueCursor,
    lessons_truncated: lessons.truncated,
  };
}

// ---------------------------------------------------------------------------
// Saved views. A community starts with the default views; the first change
// copies them in, so the owner can then edit or delete any of them.

async function readViewRows(ctx: any, communityId: any) {
  const rows = await ctx.db.query("communityClientViews")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId)).take(COMMUNITY_CLIENT_VIEW_LIMIT + 1);
  return rows.sort((a: any, b: any) => a.position - b.position || a.createdAt - b.createdAt);
}

function projectView(row: any) {
  return { key: row.key as string, name: row.name as string, columns: row.columns as string[], filters: row.filters,
    match: row.match as "all" | "any", sort: row.sort ?? null, group: (row.group as string | undefined) ?? null };
}

async function readViews(ctx: any, communityId: any) {
  const settings = await readSettings(ctx, communityId);
  if (!settings?.viewsSeededAt) return COMMUNITY_CLIENT_DEFAULT_VIEWS.map((view) => ({ ...view, filters: [...view.filters] }));
  return (await readViewRows(ctx, communityId)).map(projectView);
}

async function seedViews(ctx: any, args: { communityId: any; userId: any; via: "web" | "agent" }) {
  const settings = await readSettings(ctx, args.communityId);
  if (settings?.viewsSeededAt) return;
  const nowMs = Date.now();
  for (const [position, view] of COMMUNITY_CLIENT_DEFAULT_VIEWS.entries()) {
    await ctx.db.insert("communityClientViews", { communityId: args.communityId, key: view.key, name: view.name,
      columns: view.columns, filters: view.filters, match: view.match, ...(view.sort ? { sort: view.sort } : {}),
      position, updatedByUserId: args.userId, updatedVia: args.via, createdAt: nowMs, updatedAt: nowMs });
  }
  if (settings) await ctx.db.patch(settings._id, { viewsSeededAt: nowMs });
  else await ctx.db.insert("communityClientSettings", { communityId: args.communityId, stuckDays: COMMUNITY_CLIENT_STUCK_DEFAULT_DAYS,
    viewsSeededAt: nowMs, updatedByUserId: args.userId, updatedAt: nowMs });
}

async function readFieldsFor(ctx: any, communityId: any) {
  const [properties, lessons] = await Promise.all([listActiveProperties(ctx, communityId), listMemberVisibleLessonPages(ctx, communityId)]);
  return communityClientFields({ properties: properties.map(projectProperty), courses: courseSummaries(lessons, []) });
}

async function listViews(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  return { views: await readViews(ctx, args.communityId), fields: await readFieldsFor(ctx, args.communityId) };
}

const viewError = (error: unknown) => error instanceof CommunityClientViewError ? new CommunityClientError(error.code, error.message) : error;

// key: an existing view to change; leave it out to add a new one.
const saveViewArgs = { ...managerArgs, key: v.optional(v.string()), view: v.any(), position: v.optional(v.number()),
  via: v.optional(v.union(v.literal("web"), v.literal("agent"))) };

async function saveView(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  let view;
  try { view = normalizeCommunityClientView(args.view, await readFieldsFor(ctx, args.communityId)); } catch (error) { throw viewError(error); }
  const via = args.via ?? "web";
  await seedViews(ctx, { communityId: args.communityId, userId: args.userId, via });
  const rows = await readViewRows(ctx, args.communityId);
  const nowMs = Date.now();
  const fields = { name: view.name, columns: view.columns, filters: view.filters, match: view.match, sort: view.sort ?? undefined, group: view.group ?? undefined,
    updatedByUserId: args.userId, updatedVia: via, updatedAt: nowMs };
  if (args.position !== undefined && !Number.isFinite(args.position)) throw new CommunityClientError("client_view_invalid", "position");
  if (typeof args.key === "string") {
    const row = rows.find((other: any) => other.key === args.key);
    if (!row) throw new CommunityClientError("client_view_not_found", args.key);
    await ctx.db.patch(row._id, { ...fields, ...(args.position !== undefined ? { position: args.position } : {}) });
    return { view: { key: row.key, ...view } };
  }
  if (rows.length >= COMMUNITY_CLIENT_VIEW_LIMIT) throw new CommunityClientError("client_view_limit_reached");
  const base = communityClientViewKey(view.name);
  const taken = new Set(rows.map((row: any) => row.key));
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  await ctx.db.insert("communityClientViews", { communityId: args.communityId, key, ...fields,
    position: args.position ?? Math.max(-1, ...rows.map((row: any) => row.position)) + 1, createdAt: nowMs });
  return { view: { key, ...view } };
}

const deleteViewArgs = { ...managerArgs, key: v.string() };

async function deleteView(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  await seedViews(ctx, { communityId: args.communityId, userId: args.userId, via: "web" });
  const row = (await readViewRows(ctx, args.communityId)).find((other: any) => other.key === args.key);
  if (!row) throw new CommunityClientError("client_view_not_found", args.key);
  await ctx.db.delete(row._id);
  return { deleted: row.key };
}

// ---------------------------------------------------------------------------
// Bulk actions: one change for many selected clients. Each member's change is
// the same write a single edit makes (the property's value and the timeline
// entry, or a direct message plus a "contacted" entry), so the activity log
// reads the same whichever way it was done.

const BULK_BATCH = 20;
// Direct messages one community's managers may send in bulk per day, so a
// mistake or a runaway agent can't spam the whole community.
const BULK_MESSAGES_PER_DAY = 500;

const runBulkArgs = {
  ...managerArgs,
  action: v.object({
    type: v.string(),
    propertyKey: v.optional(v.string()),
    value: v.optional(v.any()),
    body: v.optional(v.string()),
  }),
  membershipIds: v.array(v.string()),
};

async function runBulkAction(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const ids = [...new Set(args.membershipIds as string[])];
  if (!ids.length || ids.length > COMMUNITY_CLIENT_BULK_LIMIT) throw new CommunityClientError("client_bulk_selection_invalid");
  const memberships = [];
  for (const id of ids) memberships.push(await requireMembershipInCommunity(ctx, args.communityId, id));
  const { type } = args.action;
  const row: Record<string, unknown> = { type };
  if (type === "set_property") {
    if (typeof args.action.propertyKey !== "string") throw new CommunityClientError("client_property_not_found");
    const property = await findProperty(ctx, args.communityId, args.action.propertyKey);
    row.propertyKey = property.key;
    row.value = normalizeCommunityClientPropertyValue(property, args.action.value ?? null);
  } else if (type === "message" || type === "note" || type === "flag") {
    const body = typeof args.action.body === "string" ? args.action.body.trim() : "";
    const max = type === "message" ? COMMUNITY_CLIENT_MESSAGE_MAX : CLIENT_EVENT_BODY_MAX;
    if (body.length > max || (type !== "flag" && !body)) throw new CommunityClientError("client_event_body_invalid");
    if (body) row.body = body;
    if (type === "message") {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const recent = await ctx.db.query("communityClientBulkActions")
        .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId).gte("createdAt", since)).take(200);
      const sent = recent.filter((other: any) => other.type === "message").reduce((sum: number, other: any) => sum + other.membershipIds.length, 0);
      if (sent + memberships.length > BULK_MESSAGES_PER_DAY) throw new CommunityClientError("client_bulk_message_limit_reached");
    }
  } else {
    throw new CommunityClientError("client_bulk_action_invalid");
  }
  const createdAt = Date.now();
  const id = await ctx.db.insert("communityClientBulkActions", {
    communityId: args.communityId, actorUserId: args.userId, ...row,
    membershipIds: memberships.map((membership: any) => membership._id), cursor: 0, status: "running", results: [], createdAt,
  } as any);
  await ctx.scheduler.runAfter(0, (internal as any).communityClients.processClientBulkActionInternal, { bulkActionId: id, via: args.via ?? "web" });
  return { bulk_action_id: String(id), type, count: memberships.length, status: "running" };
}

export const processClientBulkActionInternal = internalMutation({
  args: { bulkActionId: v.id("communityClientBulkActions"), via: v.union(v.literal("web"), v.literal("agent")) },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.bulkActionId);
    if (!bulk || bulk.status !== "running") return;
    const batch = bulk.membershipIds.slice(bulk.cursor, bulk.cursor + BULK_BATCH);
    const results = [...bulk.results];
    // The actor must still manage the community when each batch runs.
    let allowed = true;
    try { await requireCommunityManager({ ctx, communityId: bulk.communityId, userId: bulk.actorUserId }); } catch { allowed = false; }
    const property = bulk.type === "set_property" && allowed
      ? await ctx.db.query("communityClientProperties")
        .withIndex("by_community_key", (q: any) => q.eq("communityId", bulk.communityId).eq("key", bulk.propertyKey)).unique()
      : null;
    for (const membershipId of batch) {
      const membership = await ctx.db.get(membershipId);
      if (!allowed) { results.push({ membershipId, ok: false, code: "not_allowed" }); continue; }
      if (!membership || membership.communityId !== bulk.communityId) { results.push({ membershipId, ok: false, code: "not_found" }); continue; }
      try {
        if (bulk.type === "set_property") {
          if (!property || property.archivedAt) throw new CommunityClientError("client_property_not_found");
          await writeValue(ctx, { communityId: bulk.communityId, membership, property, actorUserId: bulk.actorUserId, via: args.via,
            value: bulk.value ?? null });
        } else if (bulk.type === "message") {
          const profile = await resolveUserProfileDisplayProjection(ctx, membership.userId);
          const text = personalizeCommunityClientMessage(bulk.body ?? "", profile.display_name ?? "");
          await sendCommunityManagerDirectMessage(ctx, { senderUserId: bulk.actorUserId, targetUserId: membership.userId,
            communityId: bulk.communityId, text });
          await ctx.db.insert("communityClientEvents", { communityId: bulk.communityId, membershipId, type: "contacted",
            actorUserId: bulk.actorUserId, via: args.via, channel: "message", body: text.slice(0, CLIENT_EVENT_BODY_MAX), createdAt: Date.now() });
        } else {
          await ctx.db.insert("communityClientEvents", { communityId: bulk.communityId, membershipId,
            type: bulk.type === "flag" ? "flagged" : "note", actorUserId: bulk.actorUserId, via: args.via,
            ...(bulk.body ? { body: bulk.body } : {}), createdAt: Date.now() });
        }
        results.push({ membershipId, ok: true });
      } catch (error) {
        const code = /([a-z]+_[a-z_]+)/.exec(String((error as Error)?.message ?? ""))?.[1] ?? "failed";
        results.push({ membershipId, ok: false, code });
      }
    }
    const cursor = bulk.cursor + batch.length;
    const done = cursor >= bulk.membershipIds.length;
    await ctx.db.patch(bulk._id, { cursor, results, ...(done ? { status: "done" as const, finishedAt: Date.now() } : {}) });
    if (!done) await ctx.scheduler.runAfter(0, (internal as any).communityClients.processClientBulkActionInternal, args);
  },
});

const readBulkArgs = { ...managerArgs, bulkActionId: v.string() };

async function readBulkAction(ctx: any, args: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const id = ctx.db.normalizeId("communityClientBulkActions", args.bulkActionId);
  const bulk = id ? await ctx.db.get(id) : null;
  if (!bulk || normalizeIdValue(bulk.communityId) !== normalizeIdValue(args.communityId)) throw new CommunityClientError("client_bulk_action_not_found");
  const failed = bulk.results.filter((row: any) => !row.ok);
  return {
    kind: "community_client_bulk_action", bulk_action_id: String(bulk._id), type: bulk.type, status: bulk.status,
    total: bulk.membershipIds.length, done: bulk.results.length, succeeded: bulk.results.length - failed.length,
    failed: failed.map((row: any) => ({ membership_id: String(row.membershipId), code: row.code ?? "failed" })),
    created_at: toIso(bulk.createdAt), finished_at: toIso(bulk.finishedAt),
  };
}

// An agent's change can carry its reserved MCP receipt, completed in the same
// transaction: the change and its retry answer commit together or not at all,
// so a retry can never write twice.
const receiptArgs = { receipt: v.optional(v.object({ attempt: canonicalReceiptAttemptValidator, value: v.any() })) };
function withReceipt<A extends Record<string, unknown>>(handler: (ctx: any, args: A) => Promise<any>) {
  return async (ctx: any, { receipt, ...args }: A & { receipt?: { attempt: any; value: Record<string, unknown> } }) => {
    const result = await handler(ctx, args as unknown as A);
    return receipt ? completeCanonicalOperationReceipt(ctx, { ...receipt.attempt, result: { ...result, ...receipt.value } }) : result;
  };
}
export const createClientPropertyInternal = internalMutation({ args: { ...createPropertyArgs, ...receiptArgs }, handler: withReceipt(createProperty) });
export const updateClientPropertyInternal = internalMutation({ args: { ...updatePropertyArgs, ...receiptArgs }, handler: withReceipt(updateProperty) });
export const setClientPropertyValueInternal = internalMutation({ args: { ...setValueArgs, ...receiptArgs }, handler: withReceipt(setValue) });
export const recordClientEventInternal = internalMutation({ args: { ...recordEventArgs, ...receiptArgs }, handler: withReceipt(recordEvent) });
export const readClientTimelineInternal = internalQuery({ args: readTimelineArgs, handler: readTimeline });
export const setClientSettingsInternal = internalMutation({ args: { ...setSettingsArgs, ...receiptArgs }, handler: withReceipt(setSettings) });
export const listClientsInternal = internalQuery({ args: listClientsArgs, handler: listClients });
export const listClientViewsInternal = internalQuery({ args: managerArgs, handler: listViews });
export const saveClientViewInternal = internalMutation({ args: { ...saveViewArgs, ...receiptArgs }, handler: withReceipt(saveView) });

// The same reads and writes for the signed-in owner or admin in the web app.
function signedIn<A extends { userId: unknown }>(validators: A) {
  const { userId: _userId, ...rest } = validators;
  return { authSubject: v.optional(v.string()), ...rest };
}

async function signedInArgs(ctx: any, args: { authSubject?: string } & Record<string, unknown>) {
  const { authSubject, ...rest } = args;
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  return { ...rest, userId };
}

export const listClientProperties = query({
  args: signedIn(managerArgs), handler: async (ctx, args) => listProperties(ctx, await signedInArgs(ctx, args)),
});
export const createClientProperty = mutation({
  args: signedIn(createPropertyArgs), handler: async (ctx, args) => createProperty(ctx, await signedInArgs(ctx, args)),
});
export const updateClientProperty = mutation({
  args: signedIn(updatePropertyArgs), handler: async (ctx, args) => updateProperty(ctx, await signedInArgs(ctx, args)),
});
export const archiveClientProperty = mutation({
  args: signedIn(archivePropertyArgs), handler: async (ctx, args) => archiveProperty(ctx, await signedInArgs(ctx, args)),
});
export const setClientPropertyValue = mutation({
  args: signedIn(setValueArgs), handler: async (ctx, args) => setValue(ctx, { ...(await signedInArgs(ctx, args)), via: "web" }),
});
export const recordClientEvent = mutation({
  args: signedIn(recordEventArgs), handler: async (ctx, args) => recordEvent(ctx, { ...(await signedInArgs(ctx, args)), via: "web" }),
});
export const getClientTimeline = query({
  args: signedIn(readTimelineArgs), handler: async (ctx, args) => readTimeline(ctx, await signedInArgs(ctx, args)),
});
export const setClientSettings = mutation({
  args: signedIn(setSettingsArgs), handler: async (ctx, args) => setSettings(ctx, await signedInArgs(ctx, args)),
});
export const listClientsForOwner = query({
  args: signedIn(listClientsArgs), handler: async (ctx, args) => listClients(ctx, await signedInArgs(ctx, args)),
});
export const listClientViews = query({
  args: signedIn(managerArgs), handler: async (ctx, args) => listViews(ctx, await signedInArgs(ctx, args)),
});
export const saveClientView = mutation({
  args: signedIn(saveViewArgs), handler: async (ctx, args) => saveView(ctx, { ...(await signedInArgs(ctx, args)), via: "web" }),
});
export const deleteClientView = mutation({
  args: signedIn(deleteViewArgs), handler: async (ctx, args) => deleteView(ctx, await signedInArgs(ctx, args)),
});
// The page and an agent's applied proposal both run this, as whoever taps it.
export const runClientBulkAction = mutation({
  args: signedIn(runBulkArgs), handler: async (ctx, args) => runBulkAction(ctx, await signedInArgs(ctx, args)),
});
export const getClientBulkAction = query({
  args: signedIn(readBulkArgs), handler: async (ctx, args) => readBulkAction(ctx, await signedInArgs(ctx, args)),
});
