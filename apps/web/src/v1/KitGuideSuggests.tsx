// Design system v1, Home: "Your guide suggests". What the guide prepared on
// its own and offers to do, kept apart from "Needs you" (which is the host's
// own decisions). Shows both channel reply drafts (shared/communityReplyDrafts.ts)
// and proactive member check-in drafts (shared/communityMemberCoach.ts).
// A row opens to the exact words; the host sends/posts them, changes them
// first, or skips. Nothing is sent without that click. Empty, it isn't drawn.
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, MessageSquare, Sparkles } from "lucide-react";
import { REPLY_DRAFT_EDIT_MAX_CHARS, replyDraftWaited, type ReplyDraftView } from "../../../../shared/communityReplyDrafts";
import { MEMBER_COACH_EDIT_MAX_CHARS, type MemberCoachDraftView } from "../../../../shared/communityMemberCoachTypes";
import type { CloudJourneyStageAdvanceProposal } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import { Btn, cx } from "./kit";

export function replyDraftTitle(draft: Pick<ReplyDraftView, "author">): string {
  return `A reply to ${draft.author}'s question is ready`;
}

export function replyDraftDetail(draft: Pick<ReplyDraftView, "question" | "channel" | "is_pod" | "hours_waiting">): string {
  const place = draft.is_pod ? draft.channel : `#${draft.channel}`;
  return `“${draft.question}” in ${place} · no answer for ${replyDraftWaited(draft.hours_waiting)}.`;
}

export function coachDraftTitle(draft: Pick<MemberCoachDraftView, "member_name">): string {
  return `Check in with ${draft.member_name}`;
}

export function stageProposalTitle(proposal: Pick<CloudJourneyStageAdvanceProposal, "member_name" | "to_stage_name">): string {
  return `Move ${proposal.member_name} to ${proposal.to_stage_name}`;
}

export function stageProposalDetail(proposal: Pick<CloudJourneyStageAdvanceProposal, "from_stage_name" | "completed_labels">): string {
  const checks = proposal.completed_labels.slice(0, 3).join(", ");
  return checks
    ? `Finished ${proposal.from_stage_name}: ${checks}.`
    : `Finished all ${proposal.from_stage_name} checkpoints.`;
}

type GuideSuggestionItem =
  | { key: string; kind: "reply"; draft: ReplyDraftView }
  | { key: string; kind: "coach"; draft: MemberCoachDraftView }
  | { key: string; kind: "stage"; proposal: CloudJourneyStageAdvanceProposal };

export function GuideSuggests(props: {
  drafts: ReplyDraftView[];
  // Posts the reply draft (with the host's words, when given). Resolves to what
  // went wrong, in plain words, or null.
  onPost: (id: string, text?: string) => Promise<string | null>;
  onSkip: (id: string) => void;
  coachDrafts?: MemberCoachDraftView[];
  onSendCoach?: (id: string, text?: string) => Promise<string | null>;
  onSkipCoach?: (id: string) => void;
  stageProposals?: CloudJourneyStageAdvanceProposal[];
  onApproveStageProposal?: (proposal: CloudJourneyStageAdvanceProposal) => Promise<string | null>;
  onDismissStageProposal?: (proposal: CloudJourneyStageAdvanceProposal) => void;
  // Opens one row from outside ("reply:<id>" or "coach:<id>"); the home
  // page's product preview uses it to show a draft once. The app leaves it unset.
  openRow?: string | null;
}) {
  const [openKey, setOpenKey] = useState<string | null>(props.openRow ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coachDrafts = props.coachDrafts ?? [];
  const stageProposals = props.stageProposals ?? [];
  const items: GuideSuggestionItem[] = [
    ...props.drafts.map((draft) => ({ key: `reply:${draft.id}`, kind: "reply" as const, draft })),
    ...coachDrafts.map((draft) => ({ key: `coach:${draft.id}`, kind: "coach" as const, draft })),
    ...stageProposals.map((proposal) => ({
      key: `stage:${proposal.membership_id}:${proposal.from_stage_key}`,
      kind: "stage" as const,
      proposal,
    })),
  ];
  const openRowIndex = props.openRow ? items.findIndex((item) => item.key === props.openRow) : -1;
  const [drawerOpen, setDrawerOpen] = useState<boolean>(openRowIndex > 0);

  useEffect(() => {
    if (!props.openRow) return;
    setOpenKey(props.openRow);
    const idx = items.findIndex((item) => item.key === props.openRow);
    if (idx > 0) setDrawerOpen(true);
  }, [props.openRow]);

  const totalCount = items.length;
  if (totalCount === 0) return null;

  const hasStack = totalCount > 1;
  const stacked = hasStack && !drawerOpen;
  const visibleItems = stacked ? items.slice(0, 1) : items;
  const hiddenCount = totalCount - visibleItems.length;

  const approveStageMove = async (proposal: CloudJourneyStageAdvanceProposal) => {
    if (busy || !props.onApproveStageProposal) return;
    setBusy(true);
    setError(null);
    const problem = await props.onApproveStageProposal(proposal);
    setBusy(false);
    if (problem) setError(problem);
    else { setOpenKey(null); setEditing(null); }
  };

  const postReply = async (draft: ReplyDraftView) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const problem = await props.onPost(draft.id, editing !== null && editing.trim() !== draft.text.trim() ? editing : undefined);
    setBusy(false);
    if (problem) setError(problem);
    else { setOpenKey(null); setEditing(null); }
  };

  const sendCoach = async (draft: MemberCoachDraftView) => {
    if (busy || !props.onSendCoach) return;
    setBusy(true);
    setError(null);
    const problem = await props.onSendCoach(draft.id, editing !== null && editing.trim() !== draft.text.trim() ? editing : undefined);
    setBusy(false);
    if (problem) setError(problem);
    else { setOpenKey(null); setEditing(null); }
  };

  const renderItem = (item: GuideSuggestionItem) => {
    const open = openKey === item.key;
    if (item.kind === "reply") {
      const { draft } = item;
      return (
        <div key={item.key} className={cx("nrow")}>
          <button type="button" className={cx("nhead")} aria-expanded={open}
            onClick={() => { setOpenKey(open ? null : item.key); setEditing(null); setError(null); }}>
            <span className={cx("nicon", "guide")} aria-hidden="true"><Sparkles size={16} strokeWidth={1.7} /></span>
            <span className={cx("ntext")}><b>{replyDraftTitle(draft)}</b><span>{replyDraftDetail(draft)}</span></span>
            <ChevronDown className={cx("nchev", open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {open ? (
            <div className={cx("nopen")}>
              {editing === null ? <p className={cx("gdraft")}>{draft.text}</p> : (
                <textarea className={cx("gdraft", "edit")} aria-label="The reply" value={editing} maxLength={REPLY_DRAFT_EDIT_MAX_CHARS} rows={5}
                  autoFocus onChange={(event) => setEditing(event.target.value)} />
              )}
              {draft.source ? <span className={cx("gsrc")}><BookOpen size={13} strokeWidth={1.8} aria-hidden="true" />From {draft.source}</span> : null}
              {error ? <p className={cx("gerr")}>{error}</p> : null}
              <div className={cx("gacts")}>
                <Btn small go disabled={busy || (editing !== null && !editing.trim())} onClick={() => void postReply(draft)}>{busy ? "…" : "Post reply"}</Btn>
                {editing === null
                  ? <Btn small disabled={busy} onClick={() => setEditing(draft.text)}>Edit</Btn>
                  : <Btn small disabled={busy} onClick={() => { setEditing(null); setError(null); }}>Cancel</Btn>}
                {editing === null ? <Btn small txt disabled={busy} onClick={() => props.onSkip(draft.id)}>Skip</Btn> : null}
                <small>Posts in {draft.is_pod ? draft.channel : `#${draft.channel}`} as your guide</small>
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    if (item.kind === "coach") {
      const { draft } = item;
      return (
        <div key={item.key} className={cx("nrow")}>
          <button type="button" className={cx("nhead")} aria-expanded={open}
            onClick={() => { setOpenKey(open ? null : item.key); setEditing(null); setError(null); }}>
            <span className={cx("nicon", "guide")} aria-hidden="true"><MessageSquare size={16} strokeWidth={1.7} /></span>
            <span className={cx("ntext")}><b>{coachDraftTitle(draft)}</b><span>{draft.signal_summary}</span></span>
            <ChevronDown className={cx("nchev", open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {open ? (
            <div className={cx("nopen")}>
              {editing === null ? <p className={cx("gdraft")}>{draft.text}</p> : (
                <textarea className={cx("gdraft", "edit")} aria-label="The check-in message" value={editing} maxLength={MEMBER_COACH_EDIT_MAX_CHARS} rows={4}
                  autoFocus onChange={(event) => setEditing(event.target.value)} />
              )}
              <span className={cx("gsrc")}><Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />{draft.reason_label}</span>
              {error ? <p className={cx("gerr")}>{error}</p> : null}
              <div className={cx("gacts")}>
                <Btn small go disabled={busy || !props.onSendCoach || (editing !== null && !editing.trim())} onClick={() => void sendCoach(draft)}>{busy ? "…" : "Send check-in"}</Btn>
                {editing === null
                  ? <Btn small disabled={busy} onClick={() => setEditing(draft.text)}>Edit</Btn>
                  : <Btn small disabled={busy} onClick={() => { setEditing(null); setError(null); }}>Cancel</Btn>}
                {editing === null && props.onSkipCoach ? <Btn small txt disabled={busy} onClick={() => props.onSkipCoach!(draft.id)}>Skip</Btn> : null}
                <small>Sends privately to {draft.member_name}’s guide chat</small>
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    const { proposal } = item;
    return (
      <div key={item.key} className={cx("nrow")}>
        <button type="button" className={cx("nhead")} aria-expanded={open}
          onClick={() => { setOpenKey(open ? null : item.key); setEditing(null); setError(null); }}>
          <span className={cx("nicon", "guide")} aria-hidden="true"><ArrowRight size={16} strokeWidth={1.7} /></span>
          <span className={cx("ntext")}><b>{stageProposalTitle(proposal)}</b><span>{stageProposalDetail(proposal)}</span></span>
          <ChevronDown className={cx("nchev", open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {open ? (
          <div className={cx("nopen")}>
            {proposal.to_stage_goal ? (
              <p className={cx("gdraft")}>Next stage focus: {proposal.to_stage_goal}</p>
            ) : null}
            {proposal.completed_labels.length ? (
              <span className={cx("gsrc")}>
                <Check size={13} strokeWidth={2} aria-hidden="true" />
                Completed: {proposal.completed_labels.join(" · ")}
              </span>
            ) : null}
            {error ? <p className={cx("gerr")}>{error}</p> : null}
            <div className={cx("gacts")}>
              <Btn small go disabled={busy || !props.onApproveStageProposal} onClick={() => void approveStageMove(proposal)}>
                {busy ? "…" : `Move to ${proposal.to_stage_name}`}
              </Btn>
              {props.onDismissStageProposal ? (
                <Btn small txt disabled={busy} onClick={() => { setOpenKey(null); props.onDismissStageProposal!(proposal); }}>
                  Keep in {proposal.from_stage_name}
                </Btn>
              ) : null}
              <small>Updates {proposal.member_name} on the Member Board</small>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className={cx("gprops")} aria-label="Your guide suggests">
      <h3><Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />Your guide suggests <i>{totalCount}</i></h3>
      <div className={cx("gstack", stacked && "is-stacked")}>
        <div className={cx("nlist")}>
          {visibleItems.map(renderItem)}
        </div>
        {stacked ? (
          <div className={cx("gdeck")} aria-hidden="true">
            <span className={cx("gdeck-card", "one")} />
            {hiddenCount >= 2 ? <span className={cx("gdeck-card", "two")} /> : null}
          </div>
        ) : null}
      </div>
      {hasStack ? (
        <button
          type="button"
          className={cx("gmore")}
          aria-expanded={drawerOpen}
          onClick={() => {
            if (drawerOpen && openKey && openKey !== items[0]?.key) {
              setOpenKey(null);
              setEditing(null);
              setError(null);
            }
            setDrawerOpen((prev) => !prev);
          }}
        >
          <span>{drawerOpen ? "Show less" : `View more (${hiddenCount})`}</span>
          <ChevronDown className={cx("gmore-chev", drawerOpen && "up")} size={14} strokeWidth={1.9} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
