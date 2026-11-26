import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { CloudMemberJourneyBoard } from "../../../../../shared/cloudCommunityMemberJourneyGateway";
import type { JourneyStageDefinition } from "../../../../../shared/communityMemberJourney";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { GuideSuggests } from "../../v1/KitGuideSuggests";
import { KitMembersBoard } from "../../v1/KitMembersBoard";
import { Eyebrow, KitApp, Talk, Theirs } from "../../v1/kit";
import { CHECK_IN, PREVIEW_COMMUNITY, REPLY_DRAFT, colour, initials, timeFor } from "./RealAppPreview";
import { sampleJourneyBoard } from "./boardSample";

// The Chief of Staff section's scene (Neil, Nov 25: the Chief of Staff and
// members board sections merged), made from the app's own parts. In front,
// the host's morning: the 8am brief as it really arrives (a message from the
// guide in the host's chat), and under it "Your guide suggests"
// (KitGuideSuggests): a check-in for Josh, who has gone quiet, and a reply
// drafted for Priya's question nobody answered. Send, Edit and Skip work.
// Behind, the app's own members board (KitMembersBoard) with Josh's card
// picked out: sending his check-in puts "sent" on his card, the guide's star.
// Dev's green arrow glows once; it, the filters and dragging all work.

type Draft = "waiting" | "sent" | "skipped";

function track(action: string) {
  captureProductAnalyticsEvent("chief_scene_used", { action });
}

export function morningBrief(waiting: number): string {
  const lead = "Good morning. Three people joined yesterday, and Dev's pricing question was answered overnight.";
  return `${lead} ${waiting === 2 ? "Two things need you." : waiting === 1 ? "One thing needs you." : "That's everything for today."}`;
}

const JOSH_CARD = "Josh Reed";

function freshCheckpoints(stage: JourneyStageDefinition | undefined) {
  return (stage?.checkpoints ?? []).map((cp) => ({ key: cp.key, label: cp.label, kind: cp.kind, done: false, auto: cp.kind !== "custom", completed_at: null }));
}

export function ChiefScene() {
  const [now] = useState(() => Date.now());
  // Josh's card starts without the guide's star: it appears when you send his check-in.
  const [board, setBoard] = useState<CloudMemberJourneyBoard>(() => {
    const start = sampleJourneyBoard(now);
    return { ...start, cards: start.cards.map((card) => card.name === JOSH_CARD ? { ...card, agent_outcome: null, agent_outcome_at: null } : card) };
  });
  const [search, setSearch] = useState("");
  const [checkIn, setCheckIn] = useState<Draft>("waiting");
  const [reply, setReply] = useState<Draft>("waiting");
  const [said, setSaid] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const josh = board.cards.find((card) => card.name === JOSH_CARD);
  const [picked, setPicked] = useState<string | null>(() => josh?.membership_id ?? null);

  // As it comes into view, Josh's check-in opens by itself, so the exact words show.
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watch.disconnect();
      setOpen("coach:c1");
      setSeen(true);
    }, { threshold: 0.45 });
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  // What the guide did, on Josh's card: drafted, sent, or nothing once skipped.
  const markJosh = (outcome: string | null) => setBoard((last) => ({
    ...last,
    cards: last.cards.map((card) => card.name === JOSH_CARD
      ? { ...card, agent_outcome: outcome, agent_outcome_at: outcome ? new Date().toISOString() : null } : card),
  }));

  const waiting = (checkIn === "waiting" ? 1 : 0) + (reply === "waiting" ? 1 : 0);

  return (
    <div className={seen ? "gsc csc is-seen" : "gsc csc"} ref={root}>
      <div className="gsc-back">
        <div className="rpw gsc-win">
          <div className="rpw-panel">
            <div className="rpw-head"><span className="rpw-ch"><Users size={15} aria-hidden="true" />Members</span><span className="csc-mode">Board</span></div>
            <div className="rpw-body">
              <div className="rpw-page gsc-page csc-board">
                <KitApp view="members" part="flow" host>
                  <KitMembersBoard board={board} loading={false} error={null} search={search} onSearch={setSearch} openKey={picked} now={now}
                    timeFor={timeFor} onOpenCard={(id) => { track("board_open"); setPicked(picked === id ? null : id); }}
                    onMoveCard={async (id, stageKey) => {
                      track("board_move");
                      setBoard((last) => {
                        const fresh = freshCheckpoints(last.stages.find((entry) => entry.key === stageKey));
                        return { ...last, cards: last.cards.map((card) => card.membership_id === id ? { ...card, stage_key: stageKey, checkpoints: fresh, checkpoints_done: 0, checkpoints_total: fresh.length } : card) };
                      });
                    }}
                    onSaveStages={async (stages) => {
                      const next = stages.map((stage, position) => ({ key: stage.key ?? `stage_${position}`, name: stage.name, goal: stage.goal, position, checkpoints: stage.checkpoints })) as JourneyStageDefinition[];
                      // As in the app: members of a deleted stage move to the first stage left.
                      setBoard((last) => {
                        const keys = new Set(next.map((stage) => stage.key));
                        const first = next[0];
                        const fresh = freshCheckpoints(first);
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
      <div className="gsc-front">
        <KitApp view="home" host part="main">
          <div className="gsc-chat csc-chat">
            <Eyebrow community={PREVIEW_COMMUNITY} time="8:00 am" />
            <div className="csc-brief">
              <Talk><Theirs><p>{morningBrief(waiting)}</p></Theirs></Talk>
            </div>
            <GuideSuggests
              drafts={reply === "waiting" ? [REPLY_DRAFT] : []}
              onPost={async () => { track("reply_posted"); setReply("sent"); setSaid("Posted in #general, as your reply to Priya."); return null; }}
              onSkip={() => { track("reply_skipped"); setReply("skipped"); setSaid("Skipped. Nothing was posted."); }}
              coachDrafts={checkIn === "waiting" ? [CHECK_IN] : []}
              onSendCoach={async () => {
                track("check_in_sent"); setCheckIn("sent"); markJosh("Guide sent check-in");
                if (josh) setPicked(josh.membership_id);
                setSaid("Sent to Josh's own guide chat, and marked on his card. If he hasn't seen it in a day, it goes by email.");
                return null;
              }}
              onSkipCoach={() => { track("check_in_skipped"); setCheckIn("skipped"); markJosh(null); setSaid("Skipped. Nothing was sent to Josh."); }}
              openRow={open} />
            {said ? <p className="csc-said" role="status">{said}</p> : null}
            <div className="csc-allowance" aria-label="AI this month: $6.40 of $20">
              <span>AI this month</span><i><b style={{ width: "32%" }} /></i><span>$6.40 of $20</span>
            </div>
          </div>
        </KitApp>
      </div>
    </div>
  );
}
