// Design system v1: Home's right column (mock: "Every right panel"), in
// this order: the guide's brief (what's happening, from recent posts); the
// next event, when one is planned; the community brain (how much the guide
// knows and the latest things it learned; a member is sent only the names
// they may read); and who is here: how many members, who is online now, who
// joined this week. People waiting to join are in Home's "Needs you" list,
// where the host answers them, not repeated here.
import type { CloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { cx } from "./kit";
import { PanelBrain, useBrainMap } from "./KitBrain";
import { askToOpenBrain } from "./KitBrainPage";
import { BriefPart, usePlaceBriefRead } from "./KitBrief";
import { KitNextEvent, useNextEventRead } from "./KitNextEvent";
import { PanelLine, PanelPart, usePanelSettled } from "./KitPanel";

function hereLine(presence: CommunityPresenceSummary | null | undefined): string {
  const faces = presence?.online_faces ?? [];
  const count = presence?.online_count ?? faces.length;
  if (count <= 0) return "No one else is here right now.";
  const names = faces.map((face) => String(face.display_name ?? "").trim().split(/\s+/)[0]).filter(Boolean).slice(0, 2);
  const more = count - names.length;
  const capped = presence?.online_count_capped ? "+" : "";
  if (!names.length) return `${count}${capped} here now`;
  if (more <= 0) return `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} here`;
  return `${names.join(", ")} and ${more}${capped} more here`;
}

export function KitHomeRail(props: {
  session: unknown;
  communityId: string;
  audience: "host" | "member";
  snapshot: CloudCommunityHomeSnapshot;
  // Off: no brief; the guide writes one only for paid communities.
  agentOn?: boolean;
  presence?: CommunityPresenceSummary | null;
  now: number;
  onOpenEvents: () => void;
  onOpenChannelByName: (name: string) => void;
  onOpenMembers: () => void;
  onOpenKnowledge?: () => void;
}) {
  const { map: brain, settled: brainSettled } = useBrainMap(props.session, props.communityId);
  const { brief, settled: briefSettled } = usePlaceBriefRead(props.session, props.communityId, null, props.agentOn !== false);
  const { settled: nextSettled } = useNextEventRead(props.session, props.communityId, props.now);
  // The column draws as one piece once its parts have answered, so "Here"
  // is never drawn at the top and then pushed down by the brief and the map.
  const settled = usePanelSettled(briefSettled && nextSettled && brainSettled);
  const faces = props.presence?.online_faces ?? [];
  const { snapshot } = props;
  const members = snapshot.memberCount;

  if (!settled) return null;
  return (
    <>
      {brief ? <BriefPart brief={brief} now={props.now} onOpenChannel={(channel) => props.onOpenChannelByName(channel.name)} /> : null}
      <KitNextEvent session={props.session} communityId={props.communityId} now={props.now} onOpenEvents={props.onOpenEvents} />
      {/* What the community knows: everyone sees how much and what is new;
          the server sends a member only the names they may read. */}
      <PanelBrain map={brain} now={props.now} max={2} onOpen={props.onOpenKnowledge ? () => { askToOpenBrain(); props.onOpenKnowledge!(); } : undefined} />
      <PanelPart label="Here" fact={members ? `${members} ${members === 1 ? "member" : "members"}` : null}>
        <div className={cx("ln")}>
          {faces.length ? (
            <span className={cx("stack")}>
              {faces.slice(0, 5).map((face) => (
                <span key={face.user_id} className={cx("av xs")} title={face.display_name ?? undefined}>
                  <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={face.display_name ?? "Member"} imageUrl={face.avatar_url} alt=""
                    fallback={<span>{(face.initials ?? face.display_name ?? "?").charAt(0).toUpperCase()}</span>}
                    fallbackStyle={face.avatar_color ? { backgroundColor: face.avatar_color } : undefined} />
                </span>
              ))}
            </span>
          ) : null}
          <span className={cx("t")}>{hereLine(props.presence)}</span>
        </div>
        {snapshot.week.joined ? <PanelLine>{snapshot.week.joined} joined this week</PanelLine> : null}
      </PanelPart>
    </>
  );
}
