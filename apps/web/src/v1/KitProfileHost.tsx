// Design system v1: what a host sees on a person's profile, on top of what
// every member sees (Neil, Nov 26: one Rashid, everywhere; as automatic as
// possible, least friction). Mostly something to read: a summary line under
// the name, and below the profile, fenced off, their progress, what the guide
// did, your note to the guide and your notes. Every control lives in one ⋯
// menu by their name; a menu item that needs words opens one small box in
// place. The server sends all of this only to someone who manages members
// (communityMemberRecords).
import { ArrowRight, Lock, MoreHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { askInApp } from "../../../../shared/inAppConfirm";
import type { CloudMemberRecord } from "../../../../shared/cloudCommunityMemberRecordsGateway";
import type { CloudMemberJourneyCard } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import type { CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import {
  JOURNEY_CARD_STATUS_LABELS,
  MAX_FOUNDER_INSTRUCTION_CHARS,
  MAX_OUTCOME_TEXT_CHARS,
  type JourneyCardStatus,
  type JourneyStageDefinition,
} from "../../../../shared/communityMemberJourney";
import { Btn, cx } from "./kit";
import { cardReason, guideDidShort } from "./KitMembersBoard";
import { paymentText } from "./memberTime";
import "./KitProfileHost.css";

export type JourneyPatch = {
  stageKey?: string;
  statusOverride?: JourneyCardStatus | "auto";
  founderInstruction?: string | null;
  toggleMilestone?: { key: string; label?: string; completed: boolean };
  addOutcomeText?: string;
  removeOutcomeId?: string;
};

export type ProfileHost = {
  record: CloudMemberRecord;
  card?: CloudMemberJourneyCard | null;
  stages?: JourneyStageDefinition[] | null;
  aiTier?: "free" | "guide" | "chief_of_staff" | null;
  agentOn?: boolean | null;
  payments?: CloudCommunityMemberBillingHistory | null;
  // Opened from the board: start at their progress.
  focus?: "progress" | null;
  onUpdateJourney?: (patch: JourneyPatch) => Promise<void>;
  onAddNote?: (body: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
  // Role, remove and block, for those allowed (never on yourself or the host).
  onSetRole?: (role: "admin" | "moderator" | "member") => Promise<void>;
  onRemove?: () => Promise<void>;
  onBlock?: () => Promise<void>;
  // A check-in the guide drafted and is waiting on you: open it on Home.
  onOpenDraft?: () => void;
  timeFor: (iso: string | null, now: number) => string;
};

// "today", "yesterday", "Tuesday" this week, then "Oct 31".
export function lastHereDay(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  const date = new Date(at);
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function nextStageFor(host: ProfileHost): JourneyStageDefinition | null {
  const { card, stages } = host;
  if (!card || !stages?.length) return null;
  const at = stages.findIndex((stage) => stage.key === card.stage_key);
  if (at < 0 || at >= stages.length - 1) return null;
  const ready = card.checkpoints_total > 0 && card.checkpoints_done >= card.checkpoints_total;
  return ready ? stages[at + 1] : null;
}

// One box at a time, opened from the menu.
type Writing = "note" | "win" | "guide" | null;

// The profile's host state: which box is open, and running the actions.
// Shared by the menu (top) and the fenced part (bottom) of one profile.
export function useProfileHost(host: ProfileHost | null | undefined) {
  const [writing, setWriting] = useState<Writing>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWriting(null); setError(null); }, [host?.record.membership_id]);
  const run = (work: Promise<void> | undefined, failed: string, after?: () => void) => {
    if (!work || busy) return;
    setBusy(true);
    setError(null);
    void work.then(() => after?.()).catch(() => setError(failed)).finally(() => setBusy(false));
  };
  return { writing, setWriting, error, busy, run };
}
export type ProfileHostState = ReturnType<typeof useProfileHost>;

// Under the name: where they are, how they're doing, what they pay. The green
// arrow when they're ready for the next stage: one press moves them on.
export function HostSummary(props: { host: ProfileHost; now: number; state: ProfileHostState }) {
  const { host, now, state } = props;
  const { record, card } = host;
  const stage = card && host.stages ? host.stages.find((entry) => entry.key === card.stage_key) ?? null : null;
  const reason = card ? cardReason(card, now) : null;
  const status = card ? reason ?? JOURNEY_CARD_STATUS_LABELS[card.status] : null;
  const needsLook = card ? card.status === "needs_you" || card.status === "stuck" : false;
  const next = nextStageFor(host);
  // "Last here Tuesday", unless the status already says how long they've been away.
  const away = /quiet|hasn't answered/i.test(reason ?? "");
  const lastDay = lastHereDay(record.last_active_at, now);
  const last = lastDay && !away ? `Last here ${lastDay}` : null;
  const plan = record.plan.kind === "owner" ? null : record.plan.label;
  return (
    <div className="pfh-sum" aria-label="For hosts">
      <p>
        {status ? <span className={needsLook ? "pfh-sum-status is-look" : "pfh-sum-status"}><i aria-hidden="true" />{status}</span> : null}
        {[stage?.name, plan, last].filter(Boolean).map((part) => <span key={part}>{part}</span>)}
      </p>
      {next && host.onUpdateJourney ? (
        <button type="button" className="pfh-move" disabled={state.busy}
          onClick={() => state.run(host.onUpdateJourney?.({ stageKey: next.key }), `${record.name.split(/\s+/)[0]} wasn't moved. Try again.`)}>
          Ready for {next.name}<ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

// The ⋯ by their name: every control for this person, in one place.
export function HostMenu(props: { host: ProfileHost; state: ProfileHostState; self: boolean }) {
  const { host, state } = props;
  const { record, card } = host;
  const first = record.name.split(/\s+/)[0] || record.name;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!(event.target instanceof Node) || !wrap.current?.contains(event.target)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const pick = (action: () => void) => () => { setOpen(false); action(); };
  const canAct = !props.self && !record.out && record.role !== "owner";
  const role = record.role === "admin" || record.role === "moderator" ? record.role : "member";
  const roleWords = { member: "a member", moderator: "a moderator", admin: "an admin" } as const;
  const otherStages = card && host.stages ? host.stages.filter((stage) => stage.key !== card.stage_key) : [];
  const ask = (message: string, yes: string, danger: boolean, work: () => Promise<void> | undefined, failed: string) => {
    void askInApp({ message, yes, danger }).then((ok) => { if (ok) state.run(work(), failed); });
  };
  return (
    <div className="pfh-menu" ref={wrap}>
      <button type="button" className="pfh-menu-btn" aria-label={`Options for ${first}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="pfh-menu-pop" role="menu" aria-label={`Options for ${first}`}>
          {card && host.onUpdateJourney ? (
            <>
              {otherStages.map((stage) => (
                <button key={stage.key} type="button" role="menuitem" onClick={pick(() => state.run(host.onUpdateJourney?.({ stageKey: stage.key }), `${first} wasn't moved. Try again.`))}>Move to {stage.name}</button>
              ))}
              {card.status_is_manual ? (
                <button type="button" role="menuitem" onClick={pick(() => state.run(host.onUpdateJourney?.({ statusOverride: "auto" }), "That didn't save. Try again."))}>Let the status update itself</button>
              ) : (
                <button type="button" role="menuitem" onClick={pick(() => state.run(host.onUpdateJourney?.({ statusOverride: "needs_you" }), "That didn't save. Try again."))}>Mark as needs you</button>
              )}
              <i role="separator" />
              <button type="button" role="menuitem" onClick={pick(() => state.setWriting("win"))}>Log a win</button>
              <button type="button" role="menuitem" onClick={pick(() => state.setWriting("guide"))}>{card.founder_instruction ? "Change your note to the guide" : `Tell the guide about ${first}`}</button>
            </>
          ) : null}
          {host.onAddNote ? <button type="button" role="menuitem" onClick={pick(() => state.setWriting("note"))}>Add a private note</button> : null}
          {canAct && host.onSetRole ? (
            <>
              <i role="separator" />
              {(["member", "moderator", "admin"] as const).filter((next) => next !== role).map((next) => (
                <button key={next} type="button" role="menuitem" onClick={pick(() => ask(`Make ${first} ${roleWords[next]}?`, "Change role", false, () => host.onSetRole?.(next), "The role didn't change. Try again."))}>
                  Make {roleWords[next]}
                </button>
              ))}
            </>
          ) : null}
          {canAct && (host.onRemove || host.onBlock) ? (
            <>
              <i role="separator" />
              {host.onRemove ? <button type="button" role="menuitem" className="is-danger" onClick={pick(() => ask(`Remove ${first} from the community? They can ask to join again.`, "Remove", true, () => host.onRemove?.(), `${first} wasn't removed. Try again.`))}>Remove from community</button> : null}
              {host.onBlock ? <button type="button" role="menuitem" className="is-danger" onClick={pick(() => ask(`Block ${first}? They're removed and can't join again.`, "Block", true, () => host.onBlock?.(), `${first} wasn't blocked. Try again.`))}>Block</button> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// One small box, opened from the menu: a win, a note, or your note to the guide.
function WriteBox(props: { label: string; placeholder: string; initial?: string; max: number; busy: boolean; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(props.initial ?? "");
  return (
    <div className="pfh-write">
      <textarea value={text} rows={2} maxLength={props.max} autoFocus aria-label={props.label} placeholder={props.placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) props.onSave(text.trim());
          if (event.key === "Escape") props.onCancel();
        }} />
      <div className={cx("acts")}>
        <Btn small go disabled={props.busy || (!text.trim() && !props.initial)} onClick={() => props.onSave(text.trim())}>{props.busy ? "Saving…" : "Save"}</Btn>
        <Btn small txt onClick={props.onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// Below the profile, fenced off: what only hosts see, to read.
export function HostPart(props: { host: ProfileHost; now: number; state: ProfileHostState }) {
  const { host, now, state } = props;
  const { record, card } = host;
  const first = record.name.split(/\s+/)[0] || record.name;
  const did = guideDidShort(card?.agent_outcome ?? null);
  const waiting = /waiting on Home/i.test(card?.agent_outcome ?? "");
  const done = card ? card.checkpoints.filter((cp) => cp.done) : [];
  const left = card ? card.checkpoints.filter((cp) => !cp.done) : [];
  const close = () => state.setWriting(null);
  // Opened from a board card: their progress, in view.
  const progressRef = useRef<HTMLDivElement | null>(null);
  const wantsProgress = host.focus === "progress" && Boolean(card);
  useEffect(() => {
    if (wantsProgress) progressRef.current?.scrollIntoView({ block: "nearest" });
  }, [wantsProgress, record.membership_id]);
  const latestPayment = [...(host.payments?.events ?? [])].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0] ?? null;
  return (
    <section className="pfh" aria-label="Only hosts see this">
      <div className="pfh-h"><Lock size={12} strokeWidth={1.8} aria-hidden="true" />Only hosts see this</div>

      {/* What the AI did is purple; when it's waiting on you, it takes you there. */}
      {card && did ? (
        waiting && host.onOpenDraft ? (
          <button type="button" className="pfh-did is-action" onClick={host.onOpenDraft}>
            <Sparkles size={13} aria-hidden="true" /><span>{did}, waiting for you</span>
            <b>Review<ArrowRight size={13} aria-hidden="true" /></b>
          </button>
        ) : (
          <p className="pfh-did"><Sparkles size={13} aria-hidden="true" /><span>{did}</span>
            {card.agent_outcome_at ? <em>{host.timeFor(card.agent_outcome_at, now)}</em> : null}</p>
        )
      ) : null}

      {card ? (
        <div className="pfh-sec" ref={progressRef} data-focus={host.focus === "progress" ? "" : undefined}>
          {card.checkpoints.length ? (
            <p className="pfh-line"><span>Done</span>{done.length ? done.map((cp) => cp.label).join(", ") : "Nothing yet"}</p>
          ) : null}
          {left.length ? <p className="pfh-line"><span>Next</span>{left.map((cp) => cp.label).join(", ")}</p> : null}
          {latestPayment ? <p className="pfh-line"><span>Payment</span>{paymentText(latestPayment)}</p> : null}
          {card.outcomes.length ? (
            <p className="pfh-line"><span>Wins</span>{card.outcomes.slice(0, 3).map((item) => item.text).join(" · ")}</p>
          ) : null}
          {state.writing === "win" ? (
            <WriteBox label={`A win for ${first}`} placeholder={`What did ${first} achieve?`} max={MAX_OUTCOME_TEXT_CHARS} busy={state.busy}
              onCancel={close} onSave={(text) => { if (text) state.run(host.onUpdateJourney?.({ addOutcomeText: text }), "That win didn't save. Try again.", close); }} />
          ) : null}
          {card.founder_instruction && state.writing !== "guide" ? (
            <p className="pfh-line"><span>To the guide</span>{card.founder_instruction}</p>
          ) : null}
          {state.writing === "guide" ? (
            <WriteBox label={`Your note to the guide about ${first}`} placeholder={`e.g. "Point ${first} at Friday's call"`}
              initial={card.founder_instruction ?? ""} max={MAX_FOUNDER_INSTRUCTION_CHARS} busy={state.busy}
              onCancel={close} onSave={(text) => state.run(host.onUpdateJourney?.({ founderInstruction: text }), "Your note to the guide didn't save. Try again.", close)} />
          ) : null}
        </div>
      ) : null}

      {record.notes.length || state.writing === "note" ? (
        <div className="pfh-sec">
          {record.notes.slice(0, 3).map((item) => (
            <div key={item.id} className="pfh-note">
              <p>{item.body}</p>
              <em>{item.author === "you" ? "You" : item.author} · {host.timeFor(item.at, now)}
                {item.can_delete && host.onDeleteNote ? <button type="button" onClick={() => state.run(host.onDeleteNote?.(item.id), "That note wasn't deleted. Try again.")}>Delete</button> : null}</em>
            </div>
          ))}
          {state.writing === "note" ? (
            <WriteBox label={`A private note about ${first}`} placeholder="A private note. Only hosts see it." max={2000} busy={state.busy}
              onCancel={close} onSave={(text) => { if (text) state.run(host.onAddNote?.(text), "The note didn't save. Try again.", close); }} />
          ) : null}
        </div>
      ) : null}

      {state.error ? <p className="pfh-error" role="alert">{state.error}</p> : null}
    </section>
  );
}
