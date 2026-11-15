// Design system v1: Home's right column (mock: "Every right panel"), in
// this order: the guide's brief (what's happening, from recent posts); the
// next event, when one is planned; the community brain (how much the guide
// knows and the latest things it learned: builders only, its notes are
// theirs, not the members'); and who is here: how many members, who is
// online now, who joined this week and, for a host, who is waiting to join.
import { useEffect, useState } from "react";
import type { CloudCommunityHomeSnapshot } from "../../../../shared/cloudCommunityAdminGateway";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { fetchCommunityNotes } from "../../../../shared/cloudCommunityNotesGateway";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { cx } from "./kit";
import { BriefPart, usePlaceBrief } from "./KitBrief";
import { KitNextEvent } from "./KitNextEvent";
import { PanelAction, PanelLearned, PanelLine, PanelPart } from "./KitPanel";
import { noteIsNew } from "./KitKnowledgeNotes";

const LEARNED_SHOWN = 2;

// When something was learned, in a word: "today", "Tue", "Nov 3".
function learnedWhen(iso: string, now: number): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.floor((now - at.getTime()) / 86_400_000);
  if (days <= 0 && at.getDate() === new Date(now).getDate()) return "today";
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: "short" });
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  const [memory, setMemory] = useState<{ total: number; more: boolean; fresh: number; canManage: boolean; latest: Array<{ title: string; at: string }> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCommunityNotes({ session: props.session, communityId: props.communityId, limit: 50 })
      .then((view) => {
        if (cancelled) return;
        const dated = view.notes.map((note) => ({ title: note.title, at: note.created_at ?? note.updated_at }))
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        setMemory({ total: view.notes.length, more: view.has_more, fresh: view.notes.filter((note) => noteIsNew(note, props.now)).length,
          canManage: view.can_manage, latest: dated.slice(0, LEARNED_SHOWN) });
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
        <PanelPart label="The community brain"
          fact={memory.total ? [`${memory.total}${memory.more ? "+" : ""} learned`, memory.fresh ? `${memory.fresh} this week` : null].filter(Boolean).join(" · ") : null}
          action={props.onOpenKnowledge ? <PanelAction onClick={props.onOpenKnowledge}>Open</PanelAction> : null}>
          {memory.latest.length
            ? memory.latest.map((note, index) => <PanelLearned key={index} title={note.title} when={learnedWhen(note.at, props.now)} />)
            : <PanelLine dim>Nothing yet</PanelLine>}
        </PanelPart>
      ) : null}
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
        {waiting ? (
          <div className={cx("ln")}>
            <i className={cx("dot amber")} /><span className={cx("t")}>{waiting} waiting to join</span>
            <PanelAction onClick={props.onOpenMembers}>Review</PanelAction>
          </div>
        ) : null}
      </PanelPart>
    </>
  );
}
