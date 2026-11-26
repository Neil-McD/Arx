// Design system v1: what a host sees on a person's profile, on top of what
// every member sees (Neil, Nov 26: one Rashid, everywhere). A summary line
// under the name, then, fenced off below the profile, the person's progress,
// what the guide did, notes, history and the host's actions. The server sends
// all of this only to someone who manages members (communityMemberRecords).
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { askInApp } from "../../../../shared/inAppConfirm";
import type { CloudMemberRecord } from "../../../../shared/cloudCommunityMemberRecordsGateway";
import type { CloudMemberJourneyCard } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import type { CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import {
  JOURNEY_CARD_STATUSES,
  JOURNEY_CARD_STATUS_LABELS,
  MAX_FOUNDER_INSTRUCTION_CHARS,
  MAX_OUTCOME_TEXT_CHARS,
  type JourneyCardStatus,
  type JourneyStageDefinition,
} from "../../../../shared/communityMemberJourney";
import { Btn, cx } from "./kit";
import { cardReason, guideDidShort } from "./KitMembersBoard";
import "./KitMembersBoard.css";
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
  paymentText?: (event: CloudCommunityMemberBillingHistory["events"][number]) => string;
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

// Under the name: where they are, how they're doing, what they pay, when they
// were last here. The green arrow when they're ready for the next stage.
export function HostSummary(props: { host: ProfileHost; now: number }) {
  const { host, now } = props;
  const { record, card } = host;
  const [moving, setMoving] = useState(false);
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
        <button type="button" className="pfh-move" disabled={moving}
          onClick={() => {
            setMoving(true);
            void host.onUpdateJourney?.({ stageKey: next.key }).finally(() => setMoving(false));
          }}>
          Ready for {next.name}<ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

// Below the profile, fenced off: everything only hosts see.
export function HostPart(props: { host: ProfileHost; now: number; self: boolean }) {
  const { host, now } = props;
  const { record, card } = host;
  const first = record.name.split(/\s+/)[0] || record.name;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState("");
  const [instruction, setInstruction] = useState(card?.founder_instruction ?? "");
  const [note, setNote] = useState("");
  useEffect(() => { setInstruction(card?.founder_instruction ?? ""); setWin(""); setError(null); }, [record.membership_id, card?.founder_instruction]);
  const run = (work: Promise<void> | undefined, failed: string, after?: () => void) => {
    if (!work || busy) return;
    setBusy(true);
    setError(null);
    void work.then(() => after?.()).catch(() => setError(failed)).finally(() => setBusy(false));
  };
  const addWin = () => { const text = win.trim(); if (text) run(host.onUpdateJourney?.({ addOutcomeText: text }), "That win didn't save. Try again.", () => setWin("")); };
  const addNote = () => { const body = note.trim(); if (body) run(host.onAddNote?.(body), "The note didn't save. Try again.", () => setNote("")); };
  const did = guideDidShort(card?.agent_outcome ?? null);
  // Joining, plan changes and leaving, with payments, newest first.
  const history = [
    ...record.events.filter((event) => event.kind !== "joined").map((event) => ({ text: event.text, at: event.at })),
    ...(host.payments?.events ?? []).map((event) => ({ text: host.paymentText ? host.paymentText(event) : "Payment", at: event.occurred_at })),
  ].sort((a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? "")).slice(0, 8);
  const canAct = !props.self && !record.out && record.role !== "owner" && Boolean(host.onSetRole || host.onRemove || host.onBlock);
  const roleValue = record.role === "admin" || record.role === "moderator" ? record.role : "member";

  return (
    <section className="pfh" aria-label="Only hosts see this">
      <div className="pfh-h"><Lock size={12} strokeWidth={1.8} aria-hidden="true" />Only hosts see this</div>

      {card && host.stages && host.onUpdateJourney ? (
        <div className="pfh-sec" id="profile-progress" data-focus={host.focus === "progress" ? "" : undefined}>
          <span className="pfh-lab">Progress</span>
          <div className="pfh-row">
            <select aria-label="Stage" value={card.stage_key} disabled={busy}
              onChange={(event) => run(host.onUpdateJourney?.({ stageKey: event.target.value }), "The stage didn't change. Try again.")}>
              {host.stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.name}</option>)}
            </select>
            <select aria-label="Status" value={card.status_is_manual ? card.status : "auto"} disabled={busy}
              onChange={(event) => run(host.onUpdateJourney?.({ statusOverride: event.target.value as JourneyCardStatus | "auto" }), "The status didn't change. Try again.")}>
              <option value="auto">Status: automatic</option>
              {JOURNEY_CARD_STATUSES.map((status) => <option key={status} value={status}>Mark {JOURNEY_CARD_STATUS_LABELS[status].toLowerCase()}</option>)}
            </select>
          </div>
          {card.checkpoints.length ? (
            <ul className="pfh-checks" aria-label="Checkpoints">
              {card.checkpoints.map((cp) => (
                <li key={cp.key}>
                  <button type="button" className={cp.done ? "is-done" : ""} disabled={busy || cp.auto}
                    onClick={() => run(host.onUpdateJourney?.({ toggleMilestone: { key: cp.key, label: cp.label, completed: !cp.done } }), "That checkpoint didn't save. Try again.")}>
                    <i aria-hidden="true" />{cp.label}
                  </button>
                  <em>{cp.auto ? "Ticks itself" : cp.done ? "Done" : "Tick when done"}</em>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="pfh-wins">
            {card.outcomes.map((item) => (
              <div key={item.id} className="pfh-win">
                <span>{item.text}</span><em>{host.timeFor(item.at, now)}</em>
                <button type="button" aria-label={`Remove win ${item.text}`} disabled={busy}
                  onClick={() => run(host.onUpdateJourney?.({ removeOutcomeId: item.id }), "That win wasn't removed. Try again.")}>×</button>
              </div>
            ))}
            <form className="pfh-add" onSubmit={(event) => { event.preventDefault(); addWin(); }}>
              <input value={win} maxLength={MAX_OUTCOME_TEXT_CHARS} onChange={(event) => setWin(event.target.value)} placeholder={`Log a win for ${first}`} aria-label={`Log a win for ${first}`} />
              {win.trim() ? <Btn small go disabled={busy} onClick={addWin}>Log</Btn> : null}
            </form>
          </div>
        </div>
      ) : null}

      {card ? (
        <div className="pfh-sec">
          <span className="pfh-lab">The guide</span>
          <p className={did ? "pfh-did" : "pfh-did is-none"}>
            <Sparkles size={13} aria-hidden="true" />
            {did ? <>{did}{card.agent_outcome_at ? <em>{host.timeFor(card.agent_outcome_at, now)}</em> : null}</> : `Nothing for ${first} yet.`}
          </p>
          <textarea className="pfh-text" value={instruction} rows={instruction ? 2 : 1} maxLength={MAX_FOUNDER_INSTRUCTION_CHARS}
            onChange={(event) => setInstruction(event.target.value)} aria-label={`Your note to the guide about ${first}`}
            placeholder={`Your note to the guide about ${first}, e.g. "Point him at Friday's call"`} />
          {instruction.trim() !== (card.founder_instruction ?? "") ? (
            <div className={cx("acts")}>
              <Btn small go disabled={busy} onClick={() => run(host.onUpdateJourney?.({ founderInstruction: instruction.trim() }), "Your note to the guide didn't save. Try again.")}>Save</Btn>
              <Btn small txt onClick={() => setInstruction(card.founder_instruction ?? "")}>Cancel</Btn>
            </div>
          ) : null}
          {host.aiTier === "free" || host.agentOn === false ? (
            <p className="pfh-hint">The guide acts on this once Guide or Chief of Staff is on.</p>
          ) : null}
        </div>
      ) : null}

      <div className="pfh-sec">
        <span className="pfh-lab">Notes</span>
        {record.notes.map((item) => (
          <div key={item.id} className="pfh-note">
            <p>{item.body}</p>
            <em>{item.author === "you" ? "You" : item.author} · {host.timeFor(item.at, now)}
              {item.can_delete && host.onDeleteNote ? <button type="button" onClick={() => run(host.onDeleteNote?.(item.id), "That note wasn't deleted. Try again.")}>Delete</button> : null}</em>
          </div>
        ))}
        {host.onAddNote ? (
          <form className="pfh-add" onSubmit={(event) => { event.preventDefault(); addNote(); }}>
            <textarea className="pfh-text" value={note} rows={note ? 3 : 1} maxLength={2000} onChange={(event) => setNote(event.target.value)}
              placeholder="A private note. Only hosts see it." aria-label={`A private note about ${first}`} />
            {note.trim() ? <Btn small disabled={busy} onClick={addNote}>Save note</Btn> : null}
          </form>
        ) : null}
      </div>

      {history.length ? (
        <div className="pfh-sec">
          <span className="pfh-lab">History</span>
          {history.map((item, index) => <p key={index} className="pfh-hist">{item.text}<em>{host.timeFor(item.at, now)}</em></p>)}
        </div>
      ) : null}

      {canAct ? (
        <div className="pfh-sec pfh-acts">
          {host.onSetRole ? (
            <label className="pfh-role">Role
              <select value={roleValue} disabled={busy} onChange={(event) => {
                const role = event.target.value as "admin" | "moderator" | "member";
                void askInApp({ message: `Make ${first} ${role === "member" ? "a member" : `a ${role}`}?`, yes: "Change role" })
                  .then((yes) => { if (yes) run(host.onSetRole?.(role), "The role didn't change. Try again."); });
              }}>
                <option value="member">Member</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          ) : null}
          <span className="pfh-acts-end">
            {host.onRemove ? <Btn small txt disabled={busy} onClick={() => {
              void askInApp({ message: `Remove ${first} from the community? They can ask to join again.`, yes: "Remove", danger: true })
                .then((yes) => { if (yes) run(host.onRemove?.(), `${first} wasn't removed. Try again.`); });
            }}>Remove</Btn> : null}
            {host.onBlock ? <Btn small txt disabled={busy} onClick={() => {
              void askInApp({ message: `Block ${first}? They're removed and can't join again.`, yes: "Block", danger: true })
                .then((yes) => { if (yes) run(host.onBlock?.(), `${first} wasn't blocked. Try again.`); });
            }}>Block</Btn> : null}
          </span>
        </div>
      ) : null}

      {error ? <p className="pfh-error" role="alert">{error}</p> : null}
    </section>
  );
}
