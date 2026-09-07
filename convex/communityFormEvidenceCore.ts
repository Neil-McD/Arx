import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { communityMembershipRowIsActive } from "./communityCore";
import { formAnswersIssue } from "../shared/communityFormAnswers";
import type { CommunitySubmittedFormEvidence } from "../shared/communityMembershipContext";

// Private assembly only: callers must establish builder or execution authority.
// Scan is bounded even when old activations or invalid records occupy the window.
export async function readSubmittedFormRecords(ctx: QueryCtx, membership: Doc<"communityMemberships">) {
  if (!communityMembershipRowIsActive(membership)) throw new Error("form_context_forbidden");
  const candidates = await ctx.db.query("communityFormRequests")
    .withIndex("by_member_status", q => q.eq("membershipId", membership._id).eq("status", "submitted"))
    .order("desc").take(51);
  const records: { request: Doc<"communityFormRequests">; version: Doc<"communityFormVersions"> }[] = [];
  let unavailable = 0;
  for (const request of candidates.slice(0, 50)) {
    if (request.activationSequence !== (membership.activationSequence ?? 0)) continue;
    const version = await ctx.db.get(request.versionId);
    const form = version ? await ctx.db.get(version.formId) : null;
    const workflow = await ctx.db.get(request.workflowId);
    if (request.communityId !== membership.communityId || !request.submittedAt ||
      !version || version.communityId !== membership.communityId ||
      !form || form.communityId !== membership.communityId || form.key !== request.formKey ||
      !workflow || workflow.communityId !== membership.communityId ||
      formAnswersIssue(version.questions, request.answers, true)) {
      unavailable++;
      continue;
    }
    records.push({ request, version });
  }
  return { records, scan_truncated: candidates.length > 50, unavailable };
}

// Answers remain evidence, never instructions, facts promoted to a profile, or
// proof of milestone completion. Choice indices are decoded using the pinned version.
export function projectSubmittedFormEvidence(page: Awaited<ReturnType<typeof readSubmittedFormRecords>>): CommunitySubmittedFormEvidence {
  let remaining = 12000;
  let truncated = page.scan_truncated || page.records.length > 5;
  const clip = (text: string, limit: number) => {
    const result = text.slice(0, Math.min(limit, remaining));
    remaining -= result.length;
    if (result.length < text.length) truncated = true;
    return result;
  };
  const submissions = page.records.slice(0, 5).map(({ request, version }) => {
    const name = clip(version.name, 120);
    let omitted = 0;
    const questions = version.questions.flatMap(q => {
      if (remaining <= 0) { omitted++; truncated = true; return []; }
      const raw = request.answers[q.key];
      const answer = raw === undefined ? null : q.type === "multiple_choice"
        ? (raw as string[]).map(index => q.options[Number(index)])
        : q.type === "single_choice" ? (raw === "" ? "" : q.options[Number(raw)]) : raw;
      const title = clip(q.title, 500);
      const bounded = Array.isArray(answer) ? answer.map(value => clip(value, 1000))
        : answer === null ? null : clip(answer, 1000);
      return [{ key: q.key, title, type: q.type, answer: bounded,
        truncated: title !== q.title || JSON.stringify(bounded) !== JSON.stringify(answer) }];
    });
    return { request_id: String(request._id), version_id: String(version._id),
      form_name: name, form_revision: version.revision, answer_revision: request.revision,
      workflow_id: String(request.workflowId), milestone_key: request.milestoneKey,
      milestone_entered_at: new Date(request.milestoneEnteredAt).toISOString(),
      activation_sequence: request.activationSequence, submitted_at: new Date(request.submittedAt!).toISOString(),
      questions, omitted_questions: omitted };
  });
  const result = { submissions, truncated, unavailable_records: page.unavailable };
  // Bound serialized evidence as well as prose: labels, keys and escaping count
  // toward the runtime receipt envelope, which contains the context twice.
  while (JSON.stringify(result).length > 8000) {
    result.truncated = true;
    const lastWithQuestions = [...submissions].reverse().find(item => item.questions.length);
    if (lastWithQuestions) {
      lastWithQuestions.questions.pop();
      lastWithQuestions.omitted_questions++;
    } else if (submissions.length) submissions.pop();
    else break;
  }
  return result;
}
