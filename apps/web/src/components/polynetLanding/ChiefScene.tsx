import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { memberKey } from "../../../../../shared/communityMembersTable";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { GuideSuggests } from "../../v1/KitGuideSuggests";
import { MembersTable, MembersToolbar } from "../../v1/KitMembersTable";
import { Eyebrow, KitApp, Talk, Theirs } from "../../v1/kit";
import { CHECK_IN, JOSH, PREVIEW_COMMUNITY, REPLY_DRAFT, colour, dayFor, initials, memberRows, timeFor } from "./RealAppPreview";

// The Chief of Staff section's scene (the plan "Chief of Staff", Nov 25),
// made from the app's own parts. In front, the host's morning: the 8am brief
// as it really arrives (a message from the guide in the host's chat), and
// under it "Your guide suggests" (KitGuideSuggests): a check-in for Josh, who
// has gone quiet, and a reply drafted for Priya's question nobody answered.
// Send, Edit and Skip work. Behind, the Members table with Josh lit. The
// same community and people as the preview at the top.

type Draft = "waiting" | "sent" | "skipped";

function track(action: string) {
  captureProductAnalyticsEvent("chief_scene_used", { action });
}

export function morningBrief(waiting: number): string {
  const lead = "Good morning. Three people joined yesterday, and Dev's pricing question was answered overnight.";
  return `${lead} ${waiting === 2 ? "Two things need you." : waiting === 1 ? "One thing needs you." : "That's everything for today."}`;
}

export function ChiefScene() {
  const [now] = useState(() => Date.now());
  // Josh near the top, so his row shows lit behind the card.
  const [rows] = useState(() => {
    const all = memberRows(now);
    const josh = all.find((row) => row.user_id === JOSH);
    return josh ? [all[0], all[1], josh, ...all.slice(2).filter((row) => row !== josh)] : all;
  });
  const [checkIn, setCheckIn] = useState<Draft>("waiting");
  const [reply, setReply] = useState<Draft>("waiting");
  const [said, setSaid] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  // As it comes into view, Josh's check-in opens by itself, so the exact words show.
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      setOpen("coach:c1");
    }, { threshold: 0.45 });
    seen.observe(node);
    return () => seen.disconnect();
  }, []);

  const waiting = (checkIn === "waiting" ? 1 : 0) + (reply === "waiting" ? 1 : 0);
  const josh = rows.find((row) => row.user_id === JOSH);

  return (
    <div className="gsc csc" ref={root}>
      <div className="gsc-back" aria-hidden="true">
        <div className="rpw gsc-win">
          <div className="rpw-panel">
            <div className="rpw-head"><span className="rpw-ch"><Users size={15} aria-hidden="true" />Members</span></div>
            <div className="rpw-body">
              <div className="rpw-page gsc-page">
                <KitApp view="members" part="flow" host>
                  <MembersToolbar search="" onSearch={() => undefined} filter="everyone" onFilter={() => undefined} onExport={() => undefined} exporting={false} canExport
                    filters={[{ id: "everyone", label: "Everyone", count: 214 }, { id: "paid", label: "$49 a month", count: 151 }]} />
                  <MembersTable rows={rows} avatarOf={() => null} now={now} timeFor={timeFor} dayFor={dayFor} sort={null} onSort={() => undefined}
                    selected={new Set()} onToggle={() => undefined} onToggleAll={() => undefined}
                    openKey={josh ? memberKey(josh) : null} onOpen={() => undefined} empty="No one here."
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
              onSendCoach={async () => { track("check_in_sent"); setCheckIn("sent"); setSaid("Sent to Josh's own guide chat. If he hasn't seen it in a day, it goes by email."); return null; }}
              onSkipCoach={() => { track("check_in_skipped"); setCheckIn("skipped"); setSaid("Skipped. Nothing was sent to Josh."); }}
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
