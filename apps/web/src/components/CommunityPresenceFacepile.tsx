import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CommunityPresenceFace } from "../../../../shared/communityTypes";

export type { CommunityPresenceFace } from "../../../../shared/communityTypes";

export function CommunityPresenceFacepile(props: {
  faces?: CommunityPresenceFace[] | null;
  onlineCount?: number | null;
  onlineCountCapped?: boolean;
  limit?: number;
  decorative?: boolean;
}) {
  const visibleFaces = (props.faces ?? []).slice(0, props.limit ?? 7);
  if (visibleFaces.length === 0) return null;

  const onlineTotal = typeof props.onlineCount === "number"
    ? Math.max(0, Math.floor(props.onlineCount))
    : visibleFaces.length;
  const extraFaces = Math.max(0, onlineTotal - visibleFaces.length);

  return (
    <div
      className="community-context-facepile"
      aria-hidden={props.decorative || undefined}
    >
      {visibleFaces.map((face, index) => (
        <UserAvatar
          key={face.user_id}
          className="community-context-face"
          readyClassName="has-image"
          name={(face.display_name ?? "").trim() || "Member"}
          imageUrl={face.avatar_url}
          focusX={face.avatar_focus_x}
          focusY={face.avatar_focus_y}
          zoom={face.avatar_zoom}
          fallback={face.initials ?? "?"}
          fallbackStyle={face.avatar_color ? { color: face.avatar_color } : undefined}
          style={{ zIndex: visibleFaces.length - index }}
          title={props.decorative ? undefined : face.display_name ?? undefined}
          alt=""
          aria-hidden={props.decorative || undefined}
        />
      ))}
      {extraFaces > 0 ? (
        <span
          className="community-context-face community-context-face-more"
          style={{ zIndex: 0 }}
          title={props.onlineCountCapped ? `${onlineTotal} or more people online` : undefined}
        >
          {props.onlineCountCapped ? `${onlineTotal}+` : `+${extraFaces}`}
        </span>
      ) : null}
    </div>
  );
}
