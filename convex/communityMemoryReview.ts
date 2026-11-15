// The guide's nightly memory review (docs/specs/agent-system-slice-1.md,
// step 4). A post or reply by a person in an open channel makes the
// community's review due at its next quiet hour (a pod's room, that pod's).
// The review is one kind of the guide's work with nobody present
// (convex/agentWork.ts runs it): the server hands the guide memory.md, the
// notes and what was said; it answers with one memory.apply (notes with
// cited posts, a new memory.md, a summary), which the server checks note by
// note. A write with nothing refused ends the run. A quiet community costs
// nothing; with AI off nothing runs.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { communityScopeKey, insertWork, podScopeKey, workFor } from "./communityNotesStore";
import { scheduleAgentWork } from "./communityMemory";
import { runAgentWork } from "./agentWork";
import { MEMORY_APPLY_OPERATION, MEMORY_REFUSAL_WORDS, MEMORY_REVIEW_INSTRUCTIONS, parseMemoryApplyCall, podReviewInstructions } from "../shared/communityMemory";

const internalRefs = internal as any;
// One write, one fix-up of anything refused, and a spare.
const REVIEW_MAX_TOOL_STEPS = 3;
const REVIEW_MAX_OUTPUT_TOKENS = 4_000;

// Applies one memory.apply: each note through the same checks as ever
// (cited posts, builder notes untouched, the run's limit), then memory.md.
// Each item says what happened, so a refused one can be fixed.
// A rewrite replaces a note whole, so only notes the guide was shown whole
// can be rewritten.
async function applyMemory(ctx: any, communityId: any, runId: any, rewritable: Set<string>, apply: { notes: Array<{ title: string; body: string; evidenceRefs: string[]; supersedes?: string; about?: string }>; filings: Array<{ slug: string; about: string }>; index: string | null }) {
  const results: Array<Record<string, unknown>> = [];
  for (const note of apply.notes) {
    if (note.supersedes && !rewritable.has(note.supersedes)) {
      results.push({ note: note.title, refused: "note_not_shown", why: MEMORY_REFUSAL_WORDS.note_not_shown });
      continue;
    }
    const answer = await ctx.runMutation(internalRefs.communityMemory.observeCommunityMemoryInternal, {
      communityId, runId, title: note.title, body: note.body, evidenceRefs: note.evidenceRefs,
      ...(note.supersedes ? { supersedes: note.supersedes } : {}), ...(note.about ? { about: note.about } : {}), nowMs: Date.now(),
    });
    results.push(answer?.ok
      ? { note: note.title, written: `memory/${String(answer.slug ?? "")}.md` }
      : { note: note.title, refused: String(answer?.code ?? "refused"), why: MEMORY_REFUSAL_WORDS[String(answer?.code)] ?? "Refused." });
  }
  // Notes that exist, filed where they belong.
  for (const filing of apply.filings) {
    const answer = await ctx.runMutation(internalRefs.communityMemory.fileCommunityNoteInternal, { communityId, runId, slug: filing.slug, about: filing.about });
    results.push(answer?.ok
      ? { filed: `memory/${filing.slug}.md` }
      : { filed: `memory/${filing.slug}.md`, refused: String(answer?.code ?? "refused"), why: MEMORY_REFUSAL_WORDS[String(answer?.code)] ?? "Refused." });
  }
  if (apply.index !== null) {
    const answer = await ctx.runMutation(internalRefs.communityMemory.writeCommunityMemoryIndexInternal, {
      communityId, runId, bodyMd: apply.index, nowMs: Date.now(),
    });
    results.push(answer?.ok ? { index: "written" } : { index: "refused", refused: String(answer?.code), why: MEMORY_REFUSAL_WORDS[String(answer?.code)] ?? "Refused." });
  }
  return results;
}

export const runMemoryReviewInternal = internalAction({
  args: { workId: v.id("agentWork") },
  handler: async (ctx, args) => await runAgentWork(ctx, {
    workId: args.workId,
    kind: "memory_review",
    names: { receipt: "community_memory_review", source: "community-memory-review", events: "memory-review", cache: "memory-review" },
    maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
    maxToolSteps: REVIEW_MAX_TOOL_STEPS,
    done: "reviewed",
    prepare: async (claim, runId) => {
      const input = await ctx.runQuery(internalRefs.communityMemory.readMemoryReviewInputInternal, {
        communityId: claim.communityId, sinceMs: claim.windowStart, untilMs: claim.windowEnd,
        ...(claim.pod ? { podRoomId: claim.pod.roomId } : {}) });
      return {
        empty: input.posts === 0,
        readThrough: input.readUntil,
        backlog: input.readUntil < claim.windowEnd,
        messages: [
          { role: "system", content: `${MEMORY_REVIEW_INSTRUCTIONS}\n\nThis community: ${claim.communityName}.${claim.pod ? `\n\n${podReviewInstructions(claim.pod.name)}` : ""}` },
          { role: "user", content: input.text },
        ],
        write: async (rawArguments) => {
          const apply = parseMemoryApplyCall(rawArguments);
          if ("error" in apply) {
            return { ok: false, code: apply.error, message: `Write with polynet_call { operation: "${MEMORY_APPLY_OPERATION}", input: { notes, file, index, summary } }.` };
          }
          const results = await applyMemory(ctx, claim.communityId, runId, new Set<string>(input.rewritable), apply);
          // Anything refused gets one more turn to fix it; otherwise the write is the whole answer.
          const ended = results.some((result) => "refused" in result) ? null
            : apply.summary ?? (results.length ? "Updated the memory from what was said." : "Nothing new worth keeping.");
          return { ok: true, output: { results }, ended };
        },
      };
    },
  }),
});

// Operator tool: run a community's review now, reading from a chosen time
// (acceptance runs on staging; a review after turning learning on).
export const requestMemoryReviewNowInternal = internalMutation({
  args: { communityId: v.id("communities"), sinceMs: v.optional(v.number()), podRoomId: v.optional(v.id("communityChannels")) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const scope = args.podRoomId ? podScopeKey(args.podRoomId) : communityScopeKey(args.communityId);
    const work = await workFor(ctx, scope, "memory_review");
    const reviewedThrough = args.sinceMs ?? work?.reviewedThrough ?? nowMs - 24 * 60 * 60_000;
    let workId = work?._id;
    if (work) {
      await ctx.db.patch(work._id, { pending: Math.max(1, work.pending), reviewedThrough, dueAt: nowMs, leaseUntil: undefined, failures: 0, updatedAt: nowMs });
    } else {
      workId = await insertWork(ctx, scope, {
        communityId: args.communityId, kind: "memory_review", pending: 1, firstPendingAt: nowMs,
        reviewedThrough, dueAt: nowMs, failures: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    await scheduleAgentWork(ctx, workId, nowMs);
    return { workId };
  },
});
