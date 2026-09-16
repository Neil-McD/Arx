/** Presentation only. Never infer delivery, retry eligibility, or authority from an error. */
export function workflowActivityExplanation(status: string, code?: string | null) {
  if (status !== "failed" && status !== "unavailable") return {};
  if (status === "unavailable") return { failure_reason: "The linked outcome could not be verified. Check the member’s activity before taking another action." };
  if (code === "workflow_member_context_changed") return {
    status: "not_applicable" as const,
    failure_reason: "The member’s workflow context changed before this action could finish. Review their current milestone; do not replay the old action.",
  };
  const reasons: Record<string, string> = {
    channel_access_missing: "Channel access was unavailable during execution. Check the member’s and agent’s access to the selected channel.",
    requester_access_missing: "Member access was unavailable during execution. Check their community membership and access.",
    agent_disabled: "The community agent was disabled during execution. Review the community agent settings.",
    source_not_live: "The source post or reply was no longer available. Review the member’s current activity.",
    source_not_readable: "The source post or reply could not be read. Check access to the original channel.",
    form_pending_limit_reached: "The member already has 12 pending forms in this milestone. No new form was requested. Review their pending forms before requesting another.",
    workflow_timer_unavailable: "The scheduled action’s workflow or destination could not be verified. Review the current milestone and service channel.",
    workflow_member_context_unavailable: "The member’s workflow context could not be verified. Review their membership, milestone, and service channel.",
  };
  // Intake prefixes trusted codes; never surface raw provider errors or private payloads.
  const reason = reasons[code ?? ""] ?? (code?.startsWith("agent_") ? reasons[code.slice(6)] : undefined);
  return { failure_reason: reason ?? "The action did not finish successfully. The record does not establish whether partial work occurred. Check the member’s activity and destination before taking another action." };
}
