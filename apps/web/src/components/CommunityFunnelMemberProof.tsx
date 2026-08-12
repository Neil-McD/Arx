import { buildCommunityFunnelMemberProofView } from "../../../../shared/communityFunnelUi";
import type { CommunityFunnelUiFaceLike } from "../../../../shared/communityFunnelUi";
import { MemberAvatarStack } from "./MemberAvatarStack";
import "./CommunityFunnelMemberProof.css";

export function CommunityFunnelMemberProof(props: {
  communityName: string;
  faces?: CommunityFunnelUiFaceLike[] | null;
  memberCount?: number | null;
}) {
  const memberProof = buildCommunityFunnelMemberProofView({
    memberCount: props.memberCount,
    faces: props.faces,
  });
  if (!memberProof) return null;

  return (
    <section
      className="community-funnel-member-proof"
      aria-label={`${memberProof.ariaLabel} in ${props.communityName}`}
    >
      <MemberAvatarStack
        className="community-funnel-member-proof-avatars"
        faces={memberProof.faces}
        totalCount={memberProof.memberCount}
        limit={5}
        decorative={true}
      />
      <span>{memberProof.label}</span>
    </section>
  );
}
