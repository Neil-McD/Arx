// Design system v1: the right column beside a channel, drawn from the kit
// (the mock's .rail.r1, docs/design/hifi-mock): Pinned, and who is in the
// channel. It no longer lists notes: they are the guide's memory, kept by the
// builders in Knowledge, not something a channel shows (Neil, Nov 14).
import { Pin } from "lucide-react";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { getAvatarColor, getInitials } from "../../../../shared/chatUi";
import { KitApp, Rail, Sec, Sep, TextLink, cx } from "./kit";

export function KitChannelRail(props: {
  communityId: string | null;
  session: unknown;
  pinned?: { label: string; onOpen: () => void } | null;
  presenceSummary?: CommunityPresenceSummary | null;
  onOpenMembers?: () => void;
  onOpenKnowledge?: () => void;
}) {
  const summary = props.presenceSummary;
  const faces = (summary?.online_faces ?? []).slice(0, 4);
  const hereNow = summary?.online_count;
  const members = summary?.member_count;

  return (
    <KitApp view="wins" part="rail">
      <Rail index={1} label="About this channel">
        {props.pinned ? (
          <>
            <Sec label="Pinned">
              <button type="button" className={cx("src")} onClick={props.pinned.onOpen}>
                <Pin className={cx("ic")} size={15} aria-hidden="true" />{props.pinned.label}
              </button>
            </Sec>
            <Sep />
          </>
        ) : null}
        <Sec label={typeof members === "number" && members > 0 ? `In this channel · ${members}` : "In this channel"}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {faces.length ? (
              <span className={cx("stack")}>
                {faces.map((face) => {
                  const name = String(face.display_name ?? "Member");
                  return (
                    <span key={face.user_id} className={cx("av s")}>
                      <UserAvatar
                        className="community-dm-kit-avatar"
                        readyClassName="has-image"
                        name={name}
                        imageUrl={face.avatar_url}
                        alt=""
                        fallback={<span>{getInitials(name)}</span>}
                        fallbackStyle={{ backgroundColor: getAvatarColor(face.user_id) }}
                      />
                    </span>
                  );
                })}
              </span>
            ) : null}
            {typeof hereNow === "number" ? (
              <span className={cx("sub")}>{hereNow}{summary?.online_count_capped ? "+" : ""} here now</span>
            ) : null}
          </div>
          {props.onOpenMembers ? <TextLink style={{ marginTop: 2 }} onClick={props.onOpenMembers}>Everyone</TextLink> : null}
        </Sec>
      </Rail>
    </KitApp>
  );
}
