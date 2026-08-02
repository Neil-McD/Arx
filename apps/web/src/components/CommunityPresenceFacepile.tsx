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
  compact?: boolean;
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
      className={`community-context-facepile${props.compact ? " is-compact" : ""}`}
      aria-hidden={props.decorative || undefined}
    >
      {visibleFaces.map((face) => (
        <span
          key={face.user_id}
          className="community-context-face"
          style={!face.avatar_url && face.avatar_color ? { color: face.avatar_color } : undefined}
          title={props.decorative ? undefined : face.display_name ?? undefined}
        >
          {face.avatar_url ? <img src={face.avatar_url} alt="" /> : <span>{face.initials ?? "?"}</span>}
        </span>
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
