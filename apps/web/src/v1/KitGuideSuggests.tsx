// Design system v1, Home: "Needs you" / "Your guide suggests".
// Unifies host actions (unread tags, join requests, legacy noticed items on
// non-proactive plans, batched Member Board stage moves, drafted channel
// replies, and member check-ins) into one calm list showing up to 3 rows
// before stacking the rest. Multiple ready stage moves or check-in drafts
// automatically collapse into a single batch row instead of an N-item wall.
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, MessageSquare, Sparkles } from "lucide-react";
import { REPLY_DRAFT_EDIT_MAX_CHARS, replyDraftWaited, type ReplyDraftView } from "../../../../shared/communityReplyDrafts";
import { MEMBER_COACH_EDIT_MAX_CHARS, type MemberCoachDraftView } from "../../../../shared/communityMemberCoachTypes";
import type { CloudJourneyStageAdvanceProposal } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import { NeedsYouJoinRow, NeedsYouPlainRow, type HomeThing, type NeedsYouJoinReview } from "./KitNeedsYou";
import { Btn, cx } from "./kit";

// Show up to 3 crisp rows before stacking the rest.
export const GUIDE_SUGGESTS_SHOWN = 3;
const STAGE_BATCH_PREVIEW = 6;

export function replyDraftTitle(draft: Pick<ReplyDraftView, "author">): string {
  return `A reply to ${draft.author}'s question is ready`;
}

export function replyDraftDetail(draft: Pick<ReplyDraftView, "question" | "channel" | "is_pod" | "hours_waiting">): string {
  const place = draft.is_pod ? draft.channel : `#${draft.channel}`;
  return `“${draft.question}” in ${place} · no answer for ${replyDraftWaited(draft.hours_waiting)}.`;
}

export function coachDraftTitle(draft: Pick<MemberCoachDraftView, "member_name"> & { reason?: MemberCoachDraftView["reason"] }): string {
  return draft.reason === "member_onboarding"
    ? `Welcome ${draft.member_name}`
    : `Check in with ${draft.member_name}`;
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

function summarizeNames(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (shown.length === 0) return "";
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

export function stageBatchTitle(proposals: ReadonlyArray<Pick<CloudJourneyStageAdvanceProposal, "member_name">>): string {
  return `${proposals.length} members ready to advance`;
}

export function stageBatchDetail(
  proposals: ReadonlyArray<Pick<CloudJourneyStageAdvanceProposal, "member_name" | "to_stage_name">>,
): string {
  if (proposals.length === 0) return "";
  const uniqueTargets = [...new Set(proposals.map((p) => p.to_stage_name))];
  if (uniqueTargets.length === 1) {
    return `${summarizeNames(proposals.map((p) => p.member_name))} → ${uniqueTargets[0]}.`;
  }
  const preview = proposals.slice(0, 2).map((p) => `${p.member_name} → ${p.to_stage_name}`);
  const rest = proposals.length - preview.length;
  return rest > 0 ? `${preview.join(", ")} and ${rest} more.` : `${preview.join(", ")}.`;
}

export function coachBatchTitle(drafts: ReadonlyArray<Pick<MemberCoachDraftView, "reason">>): string {
  const allOnboarding = drafts.every((d) => d.reason === "member_onboarding");
  return allOnboarding
    ? `${drafts.length} welcomes ready`
    : `${drafts.length} member check-ins ready`;
}

export function coachBatchDetail(drafts: ReadonlyArray<Pick<MemberCoachDraftView, "member_name">>): string {
  if (drafts.length === 0) return "";
  return `${summarizeNames(drafts.map((d) => d.member_name))}.`;
}

type GuideSuggestionItem =
  | { key: string; kind: "thing"; thing: HomeThing }
  | { key: string; kind: "join"; waiting: number }
  | { key: string; kind: "reply"; draft: ReplyDraftView }
  | { key: string; kind: "coach"; draft: MemberCoachDraftView }
  | { key: string; kind: "coach_batch"; drafts: MemberCoachDraftView[] }
  | { key: string; kind: "stage"; proposal: CloudJourneyStageAdvanceProposal }
  | { key: string; kind: "stage_batch"; proposals: CloudJourneyStageAdvanceProposal[] };

export function GuideSuggests(props: {
  // Heading label. Defaults to "Your guide suggests" (e.g. landing previews);
  // host Home passes "Needs you" for one unified guide-styled list.
  label?: string;
  // Optional direct host items unified ahead of guide drafts (tags, join requests, noticed items).
  tags?: HomeThing[];
  join?: NeedsYouJoinReview | null;
  joinCount?: number;
  onShowAllJoinRequests?: () => void;
  things?: HomeThing[];
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
  onApproveAllStageProposals?: (proposals: CloudJourneyStageAdvanceProposal[]) => Promise<string | null>;
  onDismissStageProposal?: (proposal: CloudJourneyStageAdvanceProposal) => void;
  // Opens one row from outside ("reply:<id>" or "coach:<id>"); the home
  // page's product preview uses it to show a draft once. The app leaves it unset.
  openRow?: string | null;
}) {
  const label = props.label ?? "Your guide suggests";
  const tags = props.tags ?? [];
  const things = props.things ?? [];
  const waitingJoin = props.join ? props.join.requests.length : (props.joinCount ?? 0);
  const coachDrafts = props.coachDrafts ?? [];
  const stageProposals = props.stageProposals ?? [];

  const stageItems: GuideSuggestionItem[] =
    stageProposals.length >= 2
      ? [{ key: "stage:batch", kind: "stage_batch", proposals: stageProposals }]
      : stageProposals.map((proposal) => ({
          key: `stage:${proposal.membership_id}:${proposal.from_stage_key}`,
          kind: "stage" as const,
          proposal,
        }));

  const coachItems: GuideSuggestionItem[] =
    coachDrafts.length >= 2
      ? [{ key: "coach:batch", kind: "coach_batch", drafts: coachDrafts }]
      : coachDrafts.map((draft) => ({ key: `coach:${draft.id}`, kind: "coach" as const, draft }));

  const items: GuideSuggestionItem[] = [
    ...tags.map((thing) => ({ key: `tag:${thing.key}`, kind: "thing" as const, thing })),
    ...(waitingJoin > 0 ? [{ key: "join", kind: "join" as const, waiting: waitingJoin }] : []),
    ...things.map((thing) => ({ key: `thing:${thing.key}`, kind: "thing" as const, thing })),
    ...stageItems,
    ...props.drafts.map((draft) => ({ key: `reply:${draft.id}`, kind: "reply" as const, draft })),
    ...coachItems,
  ];

  const resolveInitialOpen = (row: string | null | undefined): { key: string | null; coachId: string | null } => {
    if (!row) return { key: null, coachId: null };
    if (coachDrafts.length >= 2 && row.startsWith("coach:")) {
      const id = row.slice("coach:".length);
      if (coachDrafts.some((d) => d.id === id)) {
        return { key: "coach:batch", coachId: id };
      }
    }
    return { key: row, coachId: null };
  };

  const initialOpen = resolveInitialOpen(props.openRow);
  const [openKey, setOpenKey] = useState<string | null>(initialOpen.key);
  const [activeBatchCoachId, setActiveBatchCoachId] = useState<string | null>(initialOpen.coachId);
  const [showAllStageBatch, setShowAllStageBatch] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openRowIndex = initialOpen.key ? items.findIndex((item) => item.key === initialOpen.key) : -1;
  const [drawerOpen, setDrawerOpen] = useState<boolean>(openRowIndex >= GUIDE_SUGGESTS_SHOWN);

  useEffect(() => {
    if (!props.openRow) return;
    const resolved = resolveInitialOpen(props.openRow);
    setOpenKey(resolved.key);
    setActiveBatchCoachId(resolved.coachId);
    const idx = resolved.key ? items.findIndex((item) => item.key === resolved.key) : -1;
    if (idx >= GUIDE_SUGGESTS_SHOWN) setDrawerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.openRow]);

  const totalCount = items.length;
  if (totalCount === 0) return null;

  const hasStack = totalCount > GUIDE_SUGGESTS_SHOWN;
  const stacked = hasStack && !drawerOpen;
  const visibleItems = stacked ? items.slice(0, GUIDE_SUGGESTS_SHOWN) : items;
  const hiddenCount = totalCount - visibleItems.length;

  const approveStageMove = async (proposal: CloudJourneyStageAdvanceProposal) => {
    if (busy || !props.onApproveStageProposal) return;
    setBusy(true);
    setError(null);
    const problem = await props.onApproveStageProposal(proposal);
    setBusy(false);
    if (problem) setError(problem);
    else if (stageProposals.length <= 1) { setOpenKey(null); setEditing(null); }
  };

  const approveAllStageMoves = async (proposals: CloudJourneyStageAdvanceProposal[]) => {
    if (busy || proposals.length === 0) return;
    if (!props.onApproveAllStageProposals && !props.onApproveStageProposal) return;
    setBusy(true);
    setError(null);
    let problem: string | null = null;
    if (props.onApproveAllStageProposals) {
      problem = await props.onApproveAllStageProposals(proposals);
    } else if (props.onApproveStageProposal) {
      for (const proposal of proposals) {
        const res = await props.onApproveStageProposal(proposal);
        if (res && !problem) problem = res;
      }
    }
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

  const sendCoach = async (draft: MemberCoachDraftView, editedText?: string) => {
    if (busy || !props.onSendCoach) return;
    setBusy(true);
    setError(null);
    const problem = await props.onSendCoach(draft.id, editedText);
    setBusy(false);
    if (problem) setError(problem);
    else {
      setEditing(null);
      if (coachDrafts.length <= 1) setOpenKey(null);
      else if (activeBatchCoachId === draft.id) setActiveBatchCoachId(null);
    }
  };

  const renderItem = (item: GuideSuggestionItem) => {
    const open = openKey === item.key;
    if (item.kind === "thing") {
      return <NeedsYouPlainRow key={item.key} thing={item.thing} />;
    }
    if (item.kind === "join") {
      return (
        <NeedsYouJoinRow
          key={item.key}
          join={props.join ?? null}
          waiting={item.waiting}
          open={open}
          onToggle={() => { setOpenKey(open ? null : item.key); setEditing(null); setError(null); }}
          onShowAllJoinRequests={props.onShowAllJoinRequests ?? (() => undefined)}
        />
      );
    }
    if (item.kind === "stage_batch") {
      const { proposals } = item;
      const shownProposals = showAllStageBatch ? proposals : proposals.slice(0, STAGE_BATCH_PREVIEW);
      const moreStageCount = proposals.length - shownProposals.length;
      return (
        <div key={item.key} className={cx("nrow")}>
          <button type="button" className={cx("nhead")} aria-expanded={open}
            onClick={() => { setOpenKey(open ? null : item.key); setEditing(null); setError(null); }}>
            <span className={cx("nicon", "guide")} aria-hidden="true"><ArrowRight size={16} strokeWidth={1.7} /></span>
            <span className={cx("ntext")}><b>{stageBatchTitle(proposals)}</b><span>{stageBatchDetail(proposals)}</span></span>
            <ChevronDown className={cx("nchev", open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {open ? (
            <div className={cx("nopen")}>
              {error ? <p className={cx("gerr")}>{error}</p> : null}
              <div className={cx("gbatch-head")}>
                <Btn
                  small
                  go
                  disabled={busy || (!props.onApproveAllStageProposals && !props.onApproveStageProposal)}
                  onClick={() => void approveAllStageMoves(proposals)}
                >
                  {busy ? "Moving…" : `Move all ${proposals.length}`}
                </Btn>
                <small>Updates the Member Board</small>
              </div>
              <div className={cx("gbatch-list")}>
                {shownProposals.map((proposal) => {
                  const checks = proposal.completed_labels.slice(0, 2).join(" · ");
                  return (
                    <div key={`${proposal.membership_id}:${proposal.from_stage_key}`} className={cx("gbatch-row")}>
                      <span className={cx("gbatch-row-text")}>
                        <b>{proposal.member_name}</b>
                        <span>
                          {proposal.from_stage_name} → {proposal.to_stage_name}
                          {checks ? ` · ${checks}` : ""}
                        </span>
                      </span>
                      <span className={cx("gbatch-row-acts")}>
                        {props.onDismissStageProposal ? (
                          <Btn small txt disabled={busy} onClick={() => props.onDismissStageProposal!(proposal)}>
                            Keep
                          </Btn>
                        ) : null}
                        <Btn small disabled={busy || !props.onApproveStageProposal} onClick={() => void approveStageMove(proposal)}>
                          Move
                        </Btn>
                      </span>
                    </div>
                  );
                })}
              </div>
              {moreStageCount > 0 || showAllStageBatch ? (
                <button
                  type="button"
                  className={cx("nmore")}
                  onClick={() => setShowAllStageBatch((prev) => !prev)}
                >
                  {showAllStageBatch ? "Show fewer" : `Show all ${proposals.length}`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }
    if (item.kind === "coach_batch") {
      const { drafts } = item;
      const focusedId = activeBatchCoachId ?? drafts[0]?.id ?? null;
      return (
        <div key={item.key} className={cx("nrow")}>
          <button type="button" className={cx("nhead")} aria-expanded={open}
            onClick={() => { setOpenKey(open ? null : item.key); setEditing(null); setError(null); }}>
            <span className={cx("nicon", "guide")} aria-hidden="true"><MessageSquare size={16} strokeWidth={1.7} /></span>
            <span className={cx("ntext")}><b>{coachBatchTitle(drafts)}</b><span>{coachBatchDetail(drafts)}</span></span>
            <ChevronDown className={cx("nchev", open && "up")} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {open ? (
            <div className={cx("nopen")}>
              {error ? <p className={cx("gerr")}>{error}</p> : null}
              <div className={cx("gbatch-list")}>
                {drafts.map((draft) => {
                  const isFocused = focusedId === draft.id;
                  return (
                    <div key={draft.id} className={cx("gbatch-coach")}>
                      <button
                        type="button"
                        className={cx("gbatch-row", "gbatch-row-btn")}
                        aria-expanded={isFocused}
                        onClick={() => {
                          setActiveBatchCoachId(isFocused ? null : draft.id);
                          setEditing(null);
                          setError(null);
                        }}
                      >
                        <span className={cx("gbatch-row-text")}>
                          <b>{coachDraftTitle(draft)}</b>
                          <span>{draft.signal_summary}</span>
                        </span>
                        <ChevronDown className={cx("nchev", isFocused && "up")} size={14} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                      {isFocused ? (
                        <div className={cx("gbatch-coach-body")}>
                          {editing === null ? <p className={cx("gdraft")}>{draft.text}</p> : (
                            <textarea
                              className={cx("gdraft", "edit")}
                              aria-label={draft.reason === "member_onboarding" ? "The welcome message" : "The check-in message"}
                              value={editing}
                              maxLength={MEMBER_COACH_EDIT_MAX_CHARS}
                              rows={4}
                              autoFocus
                              onChange={(event) => setEditing(event.target.value)}
                            />
                          )}
                          <span className={cx("gsrc")}><Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />{draft.reason_label}</span>
                          <div className={cx("gacts")}>
                            <Btn
                              small
                              go
                              disabled={busy || !props.onSendCoach || (editing !== null && !editing.trim())}
                              onClick={() =>
                                void sendCoach(
                                  draft,
                                  editing !== null && editing.trim() !== draft.text.trim() ? editing : undefined,
                                )
                              }
                            >
                              {busy ? "…" : draft.reason === "member_onboarding" ? "Send welcome" : "Send check-in"}
                            </Btn>
                            {editing === null
                              ? <Btn small disabled={busy} onClick={() => setEditing(draft.text)}>Edit</Btn>
                              : <Btn small disabled={busy} onClick={() => { setEditing(null); setError(null); }}>Cancel</Btn>}
                            {editing === null && props.onSkipCoach ? (
                              <Btn small txt disabled={busy} onClick={() => props.onSkipCoach!(draft.id)}>Skip</Btn>
                            ) : null}
                            <small>Sends privately to {draft.member_name}’s guide chat</small>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      );
    }
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
                <textarea className={cx("gdraft", "edit")} aria-label={draft.reason === "member_onboarding" ? "The welcome message" : "The check-in message"} value={editing} maxLength={MEMBER_COACH_EDIT_MAX_CHARS} rows={4}
                  autoFocus onChange={(event) => setEditing(event.target.value)} />
              )}
              <span className={cx("gsrc")}><Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />{draft.reason_label}</span>
              {error ? <p className={cx("gerr")}>{error}</p> : null}
              <div className={cx("gacts")}>
                <Btn
                  small
                  go
                  disabled={busy || !props.onSendCoach || (editing !== null && !editing.trim())}
                  onClick={() =>
                    void sendCoach(
                      draft,
                      editing !== null && editing.trim() !== draft.text.trim() ? editing : undefined,
                    )
                  }
                >
                  {busy ? "…" : draft.reason === "member_onboarding" ? "Send welcome" : "Send check-in"}
                </Btn>
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
    <section className={cx("gprops")} aria-label={label}>
      <h3><Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />{label} <i>{totalCount}</i></h3>
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
            if (drawerOpen && openKey && !items.slice(0, GUIDE_SUGGESTS_SHOWN).some((item) => item.key === openKey)) {
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
