import { useEffect, useRef, useState } from "react";
import { Sparkles, Users } from "lucide-react";
import type { CloudMemberJourneyBoard } from "../../../../../shared/cloudCommunityMemberJourneyGateway";
import type { JourneyStageDefinition } from "../../../../../shared/communityMemberJourney";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { KitMembersBoard } from "../../v1/KitMembersBoard";
import { KitApp } from "../../v1/kit";
import { colour, initials, timeFor } from "./RealAppPreview";
import { sampleJourneyBoard } from "./boardSample";

// The members board section (Neil, Nov 25: it follows Chief of Staff:
// progress and results tracked per member, the AI working the board). The
// app's own board (KitMembersBoard), not a copy, with the Build Club's
// members. Above it, the board's line from the morning brief. As it comes
// into view the guide follows up with Amir, who's stuck: its star appears on
// his card, then Dev's green arrow glows once, the hint to move him on.
// The arrows, the filters and dragging all work as in the app.

function track(action: string) {
  captureProductAnalyticsEvent("board_scene_used", { action });
}

export function boardPulse(board: CloudMemberJourneyBoard): string {
  const last = board.stages[board.stages.length - 1]?.key;
  const ready = board.cards.filter((card) => card.checkpoints_total > 0 && card.checkpoints_done >= card.checkpoints_total && card.stage_key !== last).length;
  const stuck = board.cards.filter((card) => card.status === "stuck" || card.status === "needs_you").length;
  const win = board.cards.map((card) => card.latest_outcome ? { name: card.name.split(" ")[0], ...card.latest_outcome } : null)
    .filter((entry): entry is { name: string; text: string; at: string } => entry !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return [
    ready ? `${ready} ready to move on` : null,
    stuck ? `${stuck} need${stuck === 1 ? "s" : ""} you` : null,
    win ? `${win.name}: ${win.text.charAt(0).toLowerCase()}${win.text.slice(1)}` : null,
  ].filter(Boolean).join(" · ");
}

export function BoardScene() {
  const [now] = useState(() => Date.now());
  const [board, setBoard] = useState<CloudMemberJourneyBoard>(() => {
    const start = sampleJourneyBoard(now);
    // Amir's follow-up is the beat that plays as the section comes into view.
    return { ...start, cards: start.cards.map((card) => card.name === "Amir Khan" ? { ...card, agent_outcome: null, agent_outcome_at: null } : card) };
  });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watch.disconnect();
      setSeen(true);
      window.setTimeout(() => setBoard((last) => ({
        ...last,
        cards: last.cards.map((card) => card.name === "Amir Khan" ? { ...card, agent_outcome: "Guide sent check-in", agent_outcome_at: new Date().toISOString() } : card),
      })), 1200);
    }, { threshold: 0.4 });
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  return (
    <div className={seen ? "msc is-seen" : "msc"} ref={root}>
      <p className="msc-pulse"><Sparkles size={13} aria-hidden="true" /><span>From your morning brief</span>{boardPulse(board)}</p>
      <div className="msc-win">
        <div className="rpw gsc-win">
          <div className="rpw-panel">
            <div className="rpw-head"><span className="rpw-ch"><Users size={15} aria-hidden="true" />Members</span><span className="msc-mode">Board</span></div>
            <div className="rpw-body">
              <KitApp view="members" host part="flow">
                <KitMembersBoard board={board} loading={false} error={null} search={search} onSearch={setSearch} openKey={open} now={now}
                  timeFor={timeFor} onOpenCard={(id) => { track("open"); setOpen(open === id ? null : id); }}
                  onMoveCard={async (id, stageKey) => {
                    track("move");
                    setBoard((last) => {
                      const stage = last.stages.find((entry) => entry.key === stageKey);
                      const checkpoints = (stage?.checkpoints ?? []).map((cp) => ({ key: cp.key, label: cp.label, kind: cp.kind, done: false, auto: cp.kind !== "custom", completed_at: null }));
                      return { ...last, cards: last.cards.map((card) => card.membership_id === id ? { ...card, stage_key: stageKey, checkpoints, checkpoints_done: 0, checkpoints_total: checkpoints.length } : card) };
                    });
                  }}
                  onSaveStages={async (stages) => {
                    const next = stages.map((stage, position) => ({ key: stage.key ?? `stage_${position}`, name: stage.name, goal: stage.goal, position, checkpoints: stage.checkpoints })) as JourneyStageDefinition[];
                    // As in the app: members of a deleted stage move to the first stage left.
                    setBoard((last) => {
                      const keys = new Set(next.map((stage) => stage.key));
                      const first = next[0];
                      const fresh = (first?.checkpoints ?? []).map((cp) => ({ key: cp.key, label: cp.label, kind: cp.kind, done: false, auto: cp.kind !== "custom", completed_at: null }));
                      return {
                        ...last,
                        stages: next,
                        cards: first ? last.cards.map((card) => keys.has(card.stage_key) ? card
                          : { ...card, stage_key: first.key, checkpoints: fresh, checkpoints_done: 0, checkpoints_total: fresh.length }) : last.cards,
                      };
                    });
                    return next;
                  }}
                  getAvatarColor={colour} getInitials={initials} />
              </KitApp>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
