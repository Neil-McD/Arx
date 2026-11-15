// Design system v1: Home's right column (mock: "Every right panel"), in
// this order: the guide's brief (what's happening, from recent posts); the
// next event; the community brain (how much the guide knows: builders only,
// its notes are theirs, not the members'); and who is here: how many
// members, who is online now, who joined this week and, for a host, who is
// waiting to join.
import { useEffect, useState } from "react";
import type { CloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { fetchCommunityNotes } from "../../../../shared/cloudCommunityNotesGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { cx, TextLink } from "./kit";
import { BriefPart, usePlaceBrief } from "./KitBrief";
import { KitNextEvent } from "./KitNextEvent";
import { PanelLine, PanelPart } from "./KitPanel";
import { noteIsNew } from "./KitKnowledgeNotes";

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
  const [memory, setMemory] = useState<{ total: number; more: boolean; fresh: number; canManage: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: 50 })
      .then((view) => {
        if (cancelled) return;
        setMemory({ total: view.notes.length, more: view.has_more, fresh: view.notes.filter((note) => noteIsNew(note, props.now)).length, canManage: view.can_manage });
      })
      .catch(() => { if (!cancelled) setMemory(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.session, props.communityId]);

  const brief = usePlaceBrief(props.session, props.communityId, null, props.agentOn !== false);
  const faces = props.presence?.online_faces ?? [];
  const { snapshot } = props;
  const members = snapshot.memberCount;
  const waiting = props.audience === "host" ? snapshot.joinRequestsPending : 0;

  return (
    <>
      {brief ? <BriefPart brief={brief} now={props.now} onOpenChannel={(channel) => props.onOpenChannelByName(channel.name)} /> : null}
      <KitNextEvent session={props.session} communityId={props.communityId} now={props.now} onOpenEvents={props.onOpenEvents} />
      {/* What the guide knows is the builders' to see; the server sends a
          member nothing here, so the part is simply absent for them. */}
      {memory && memory.canManage ? (
        <PanelPart label="The community brain" fact={memory.total ? `${memory.total}${memory.more ? "+" : ""} learned` : null}>
          <PanelLine>
            <span>{memory.total === 0 ? "Nothing yet. Teach it in Knowledge." : memory.fresh ? `${memory.fresh} new this week` : "Nothing new this week"}</span>
            {props.onOpenKnowledge ? <TextLink style={{ marginLeft: "auto" }} onClick={props.onOpenKnowledge}>Open</TextLink> : null}
          </PanelLine>
        </PanelPart>
      ) : null}
      <PanelPart label="Here" fact={members ? `${members} ${members === 1 ? "member" : "members"}` : null}>
        <div className={cx("ln")}>
          {faces.length ? (
            <span className={cx("stack")}>
              {faces.slice(0, 5).map((face) => (
                <span key={face.user_id} className={cx("av s")} title={face.display_name ?? undefined}>
                  <UserAvatar className="community-dm-kit-avatar" readyClassName="has-image" name={face.display_name ?? "Member"} imageUrl={face.avatar_url} alt=""
                    fallback={<span>{(face.initials ?? face.display_name ?? "?").charAt(0).toUpperCase()}</span>}
                    fallbackStyle={face.avatar_color ? { backgroundColor: face.avatar_color } : undefined} />
                </span>
              ))}
            </span>
          ) : null}
          <span>{hereLine(props.presence)}</span>
        </div>
        {snapshot.week.joined ? <PanelLine>{snapshot.week.joined} joined this week</PanelLine> : null}
        {waiting ? (
          <PanelLine>
            <span>{waiting} waiting to join</span>
            <TextLink style={{ marginLeft: "auto" }} onClick={props.onOpenMembers}>Review</TextLink>
          </PanelLine>
        ) : null}
      </PanelPart>
    </>
  );
}
