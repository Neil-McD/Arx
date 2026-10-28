import { CANONICAL_COMMUNITY_AGENT_KEY } from "../../../../shared/communityAgentToolProtocol";
import type { MentionCandidate } from "../components/communityMentionAutocomplete";

export type WebCommunityReplyTarget = {
  id: string;
  sender_id: string;
  body: string;
  reply_author_label?: string | null;
  mention_candidate?: MentionCandidate | null;
  interaction_root_id: string;
  interaction_reply_id?: string | null;
};

type CommunityInteractionRootLike = {
  id: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_agent_key: string | null;
  content_summary: string;
};

export function buildCommunityRootReplyTarget(args: {
  root: CommunityInteractionRootLike | null | undefined;
  communityName: string | null | undefined;
}): WebCommunityReplyTarget | null {
  const root = args.root;
  const rootId = String(root?.id ?? "").trim();
  if (!root || !rootId) return null;

  const humanUserId = String(root.actor_user_id ?? "").trim();
  const isHumanTarget = root.actor_type === "human" && Boolean(humanUserId);
  const isCanonicalCommunityAgentTarget =
    root.actor_type === "community_agent" &&
    root.actor_agent_key === CANONICAL_COMMUNITY_AGENT_KEY;
  if (
    !isHumanTarget &&
    !isCanonicalCommunityAgentTarget
  ) {
    return null;
  }

  const communityName = String(args.communityName ?? "").trim();
  return {
    id: rootId,
    sender_id:
      isHumanTarget
        ? humanUserId
        : CANONICAL_COMMUNITY_AGENT_KEY,
    body: root.content_summary ?? "",
    ...(isCanonicalCommunityAgentTarget
      ? { reply_author_label: communityName || "Community agent" }
      : {}),
    interaction_root_id: rootId,
    interaction_reply_id: null,
  };
}
