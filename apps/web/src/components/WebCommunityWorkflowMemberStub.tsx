import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CloudCommunityMemberWorkflowMember } from "../../../../shared/cloudCommunityMemberWorkflowsGateway";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatWorkflowMilestoneAge(
  enteredAt: string,
  nowMs = Date.now(),
): string {
  const enteredAtMs = new Date(enteredAt).getTime();
  if (!Number.isFinite(enteredAtMs)) return "Stage timing unavailable";
  const elapsedMs = Math.max(0, nowMs - enteredAtMs);
  if (elapsedMs < MINUTE_MS) return "Entered just now";
  if (elapsedMs < HOUR_MS) {
    return `In this stage ${Math.floor(elapsedMs / MINUTE_MS)}m`;
  }
  if (elapsedMs < DAY_MS) {
    return `In this stage ${Math.floor(elapsedMs / HOUR_MS)}h`;
  }
  const days = Math.floor(elapsedMs / DAY_MS);
  if (days < 14) return `In this stage ${days}d`;
  if (days < 60) return `In this stage ${Math.floor(days / 7)}w`;
  if (days < 365) return `In this stage ${Math.floor(days / 30)}mo`;
  return `In this stage ${Math.floor(days / 365)}y`;
}

export function WebCommunityWorkflowMemberStub(props: {
  member: CloudCommunityMemberWorkflowMember;
  onOpen: () => void;
}) {
  const milestoneAge = formatWorkflowMilestoneAge(
    props.member.current_milestone_entered_at,
  );
  const enteredAt = new Date(props.member.current_milestone_entered_at);
  const enteredAtTitle = Number.isFinite(enteredAt.getTime())
    ? `Entered this stage ${enteredAt.toLocaleString()}`
    : undefined;
  const status = props.member.workflow_completed_at ? "Workflow complete" : milestoneAge;

  return (
    <button
      type="button"
      className="workflow-member-stub"
      aria-label={`${props.member.display_name}. ${status}.`}
      onClick={props.onOpen}
    >
      <UserAvatar
        name={props.member.display_name}
        imageUrl={props.member.avatar_url}
        focusX={props.member.avatar_focus_x}
        focusY={props.member.avatar_focus_y}
        zoom={props.member.avatar_zoom}
        className="community-interaction-avatar"
        readyClassName="has-image"
        fallbackClassName="community-interaction-avatar-fallback"
      />
      <div className="workflow-member-stub-copy">
        <strong>{props.member.display_name}</strong>
        <span title={enteredAtTitle}>{status}</span>
      </div>
    </button>
  );
}
