import { UserAvatar } from "../../../../shared/UserAvatar";

export type CommunityPresenceFace = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  initials?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

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
      {visibleFaces.map((face) => (
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
          title={props.decorative ? undefined : face.display_name ?? undefined}
          alt=""
          aria-hidden={props.decorative || undefined}
        />
      ))}
      {extraFaces > 0 ? (
        <span
          className="community-context-face community-context-face-more"
          title={props.onlineCountCapped ? `${onlineTotal} or more people online` : undefined}
        >
          {props.onlineCountCapped ? `${onlineTotal}+` : `+${extraFaces}`}
        </span>
      ) : null}
    </div>
  );
}
