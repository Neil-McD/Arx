import { UserAvatar } from "../../../../shared/UserAvatar";
import { AVATAR_INITIALS_INK } from "../../../../shared/chatUi";

export type MemberAvatarStackFace = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  avatar_color?: string | null;
  initials?: string | null;
};

export function MemberAvatarStack(props: {
  faces?: MemberAvatarStackFace[] | null;
  totalCount?: number | null;
  countCapped?: boolean;
  isLoading?: boolean;
  limit?: number;
  decorative?: boolean;
  className?: string;
  imageLoading?: "eager" | "lazy";
  moreTitle?: string;
}) {
  const visibleFaces = (props.faces ?? []).slice(0, props.limit ?? 7);
  if (visibleFaces.length === 0 && !props.isLoading) return null;

  const totalCount = typeof props.totalCount === "number"
    ? Math.max(0, Math.floor(props.totalCount))
    : visibleFaces.length;
  const extraFaces = Math.max(0, totalCount - visibleFaces.length);
  const className = ["member-avatar-stack", props.className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} aria-hidden={props.decorative || undefined}>
      {visibleFaces.length === 0 && props.isLoading
        ? Array.from({ length: 2 }).map((_, index) => (
            <span
              className="member-avatar-stack-face web-skeleton-block"
              style={{ zIndex: 2 - index }}
              key={index}
            />
          ))
        : null}
      {visibleFaces.map((face, index) => (
        <UserAvatar
          key={face.user_id}
          className="member-avatar-stack-face"
          readyClassName="has-image"
          name={(face.display_name ?? "").trim() || "Member"}
          imageUrl={face.avatar_url ?? null}
          focusX={face.avatar_focus_x}
          focusY={face.avatar_focus_y}
          zoom={face.avatar_zoom}
          fallback={face.initials ?? "?"}
          fallbackStyle={face.avatar_color ? { backgroundColor: face.avatar_color, color: AVATAR_INITIALS_INK } : undefined}
          style={{ zIndex: visibleFaces.length - index }}
          title={props.decorative ? undefined : face.display_name ?? undefined}
          alt=""
          loading={props.imageLoading ?? "eager"}
          fetchPriority={index === 0 && props.imageLoading !== "lazy" ? "high" : "auto"}
          aria-hidden={props.decorative || undefined}
        />
      ))}
      {extraFaces > 0 ? (
        <span
          className="member-avatar-stack-face member-avatar-stack-more"
          style={{ zIndex: 0 }}
          title={props.moreTitle}
        >
          {props.countCapped ? `${totalCount}+` : `+${extraFaces}`}
        </span>
      ) : null}
    </div>
  );
}
