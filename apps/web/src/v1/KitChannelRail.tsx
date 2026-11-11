// Design system v1: the right column beside a channel, drawn from the kit
// (the mock's .rail.r1, docs/design/hifi-mock): Pinned, Memory from this
// channel (the constellation and the notes), and who is in the channel.
// Catch up, the guide's summary, joins when the guide can write it.
import { useEffect, useState } from "react";
import { Pin } from "lucide-react";
import { fetchCommunityNotes, type CommunityNoteView } from "../../../../shared/cloudCommunityNotesGateway";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { getAvatarColor, getInitials } from "../../../../shared/chatUi";
import { KitApp, Rail, Sec, Sep, TextLink, cx } from "./kit";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The mock's constellation (lib.py mini_map): a quiet drawing of memory.
const NODES: Array<[number, number, "" | "big" | "new"]> = [
  [40, 96, ""], [92, 48, ""], [150, 84, "big"], [206, 40, "new"], [238, 104, ""], [120, 126, ""], [64, 30, ""], [184, 128, ""],
];
const EDGES: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [1, 6], [4, 7], [5, 0]];

function Constellation() {
  return (
    <svg className={cx("mini")} viewBox="0 0 280 156" aria-hidden="true">
      <defs>
        <radialGradient id="kit-rail-aurora" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: "var(--aurora)" }} stopOpacity=".6" />
          <stop offset="1" style={{ stopColor: "var(--aurora)" }} stopOpacity="0" />
        </radialGradient>
      </defs>
      {EDGES.map(([a, b]) => (
        <path key={`${a}-${b}`} d={`M${NODES[a][0]} ${NODES[a][1]}L${NODES[b][0]} ${NODES[b][1]}`} stroke="currentColor" strokeOpacity=".16" strokeWidth=".8" />
      ))}
      {NODES.map(([x, y, kind]) => (
        <g key={`${x}-${y}`}>
          {kind === "new" ? <circle cx={x} cy={y} r="16" fill="url(#kit-rail-aurora)" /> : null}
          <circle cx={x} cy={y} r={kind === "big" ? 4 : 2.6} fill="currentColor" opacity={kind ? 1 : 0.8} />
        </g>
      ))}
    </svg>
  );
}

export function isNewThisWeek(updatedAt: string, now = Date.now()): boolean {
  const at = Date.parse(updatedAt);
  return Number.isFinite(at) && now - at <= WEEK_MS;
}

export function KitChannelRail(props: {
  communityId: string | null;
  session: unknown;
  pinned?: { label: string; onOpen: () => void } | null;
  presenceSummary?: CommunityPresenceSummary | null;
  onOpenMembers?: () => void;
  onOpenKnowledge?: () => void;
}) {
  const [notes, setNotes] = useState<CommunityNoteView[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    if (!props.communityId || !props.session) return;
    void fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: 4 })
      .then((view) => { if (!cancelled) setNotes(view.notes); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [props.communityId, props.session]);

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
        <Sec label="Memory from this channel">
          <Constellation />
          {notes === null ? null : notes.length === 0 ? (
            <span className={cx("sub")}>Nothing saved yet. The guide keeps what's worth sharing.</span>
          ) : notes.map((note, index) => {
            const fresh = isNewThisWeek(note.updated_at);
            return (
              <button
                key={note.slug}
                type="button"
                className={cx("src")}
                style={index > 0 ? { marginTop: -8 } : undefined}
                onClick={props.onOpenKnowledge}
              >
                <span className={cx("sdot")} style={fresh ? { background: "var(--aurora)", boxShadow: "0 0 8px var(--aurora)" } : undefined} />
                {note.title}
                {fresh ? <em>new</em> : null}
              </button>
            );
          })}
        </Sec>
        <Sep />
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
