import type { CommunityPresenceFace } from "../../../../shared/communityTypes";
import { MemberAvatarStack } from "./MemberAvatarStack";

export type { CommunityPresenceFace } from "../../../../shared/communityTypes";

export function CommunityPresenceFacepile(props: {
  faces?: CommunityPresenceFace[] | null;
  onlineCount?: number | null;
  onlineCountCapped?: boolean;
  isLoading?: boolean;
  limit?: number;
  decorative?: boolean;
}) {
  return (
    <MemberAvatarStack
      className="community-context-facepile"
      faces={props.faces}
      totalCount={props.onlineCount}
      countCapped={props.onlineCountCapped}
      isLoading={props.isLoading}
      limit={props.limit}
      decorative={props.decorative}
      moreTitle={
        props.onlineCountCapped && typeof props.onlineCount === "number"
          ? `${Math.max(0, Math.floor(props.onlineCount))} or more people online`
          : undefined
      }
    />
  );
}
