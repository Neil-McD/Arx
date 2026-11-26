import { useState } from "react";
import { Award, MoreHorizontal, PenLine, Search, Sparkles } from "lucide-react";
import type { CloudMemberJourneyBoard, CloudMemberJourneyCard } from "../../../../../shared/cloudCommunityMemberJourneyGateway";
import { DEFAULT_JOURNEY_STAGES, type JourneyCardStatus } from "../../../../../shared/communityMemberJourney";
import "./BoardScene.css";

// The members board, redrawn calm (Neil, Nov 25: "the members board is ugly;
// make it look better first, then mock it"). The same data the app's board
// reads (CloudMemberJourneyBoard). One surface, no boxed columns; a column is
// its stage name and count; a card is three lines at most: face, name and a
// status dot; one line (their goal or latest win); a thin checkpoint bar with
// the host's note and the guide's last action as small marks. Grey for
// everything, amber only for who needs you, violet only for the AI (a member
// ready to move on). Quiet members fade. A card opens beside the board.

const DAY = 86_400_000;
const TONES = ["#39414F", "#4A4038", "#2F4446", "#463A4D", "#3E4636", "#4B3B3E"];

export function sampleJourneyBoard(now: number): CloudMemberJourneyBoard {
  type Row = [name: string, stage: string, status: JourneyCardStatus, done: number, extra?: Partial<CloudMemberJourneyCard>];
  const rows: Row[] = [
    ["Kai Tanaka", "new", "on_track", 0, { activity_summary: "Joined 3 days ago" }],
    ["Rosa Lind", "new", "stuck", 0, { activity_summary: "No posts yet", agent_outcome: "Guide drafted a newcomer welcome (waiting on Home)" }],
    ["Felix Braun", "new", "on_track", 0, { activity_summary: "Joined 2 days ago", working_on: "Launch a paid newsletter" }],
    ["Dev Patel", "getting_started", "on_track", 2, { activity_summary: "4 posts · 2 lessons", working_on: "First 10 paying members", latest_outcome: { text: "Set his price at $49", at: new Date(now - 2 * DAY).toISOString() } }],
    ["Priya Shah", "getting_started", "on_track", 1, { activity_summary: "6 posts · 1 lesson", working_on: "A founding-member offer" }],
    ["Josh Reed", "getting_started", "quiet", 1, { activity_summary: "Last seen 25 days ago", working_on: "Pricing his first course", founder_instruction: "He was keen on pricing. Point him at Friday's call.", agent_outcome: "Guide drafted a check-in (waiting on Home)" }],
    ["Hana Sato", "getting_started", "needs_you", 1, { money_kind: "on_hold", activity_summary: "Payment on hold", working_on: "A launch-week checklist" }],
    ["Jon Park", "active", "on_track", 1, { activity_summary: "23 posts · 4 lessons", working_on: "Grow to 200 members", latest_outcome: { text: "Passed 100 members", at: new Date(now - DAY).toISOString() } }],
    ["Maya Chen", "graduated", "done", 0, { activity_summary: "41 posts · 7 lessons", latest_outcome: { text: "Ran her second cohort", at: new Date(now - 6 * DAY).toISOString() } }],
    ["Amir Khan", "active", "stuck", 0, { activity_summary: "Quiet for 12 days", working_on: "Weekly calls people attend", agent_outcome: "Guide sent a check-in · no reply yet" }],
    ["Lena Novak", "active", "on_track", 0, { activity_summary: "17 posts · 3 lessons", working_on: "Her first workshop" }],
    ["Sara Lind", "graduated", "done", 0, { activity_summary: "Helping newer members", latest_outcome: { text: "Hit $5k a month", at: new Date(now - 9 * DAY).toISOString() } }],
    ["Tom Alvarez", "graduated", "done", 0, { activity_summary: "Mentors in #wins" }],
  ];
  const cards: CloudMemberJourneyCard[] = rows.map(([name, stage, status, done, extra], i) => {
    const def = DEFAULT_JOURNEY_STAGES.find((entry) => entry.key === stage)!;
    const checkpoints = def.checkpoints.map((cp, j) => ({ key: cp.key, label: cp.label, kind: cp.kind, done: j < done, auto: cp.kind !== "custom", completed_at: j < done ? new Date(now - (j + 1) * DAY).toISOString() : null }));
    return {
      membership_id: `m${i + 1}`, user_id: `u${i + 1}`, name, handle: name.toLowerCase().replace(/\s+/g, "-"), avatar_url: null, avatar_focus_x: 50, avatar_focus_y: 50, avatar_zoom: 1,
      role: "member", plan_label: i % 4 === 3 ? "Free" : "$49 a month", money_kind: null, stage_key: stage, status, status_is_manual: false,
      founder_instruction: null, founder_instruction_updated_at: null, agent_outcome: null, agent_outcome_at: null, working_on: null, activity_summary: null,
      checkpoints, checkpoints_done: checkpoints.filter((cp) => cp.done).length, checkpoints_total: checkpoints.length, outcomes: [], latest_outcome: null,
      joined_at: new Date(now - (i + 2) * 6 * DAY).toISOString(), last_active_at: new Date(now - (status === "quiet" ? 25 : status === "stuck" ? 12 : i % 3) * DAY).toISOString(),
      ...extra,
      ...(extra?.agent_outcome ? { agent_outcome_at: new Date(now - 3 * 3_600_000).toISOString() } : {}),
      ...(extra?.founder_instruction ? { founder_instruction_updated_at: new Date(now - DAY).toISOString() } : {}),
    };
  });
  return { stages: DEFAULT_JOURNEY_STAGES.map((stage) => ({ ...stage, checkpoints: [...stage.checkpoints] })), auto_advance_enabled: false, cards, total_active_members: cards.length, capped: false, hosted_ai_tier: "chief_of_staff", hosted_agent_on: true };
}

const STATUS_WORD: Record<JourneyCardStatus, string> = { needs_you: "Needs you", stuck: "Stuck", on_track: "On track", quiet: "Quiet", done: "Done" };
const ORDER: Record<JourneyCardStatus, number> = { needs_you: 0, stuck: 1, on_track: 2, done: 3, quiet: 4 };

function Face(props: { name: string; id: string; size?: number }) {
  const tone = TONES[Number(props.id.replace(/\D/g, "") || 0) % TONES.length];
  return <span className="mb-face" style={{ background: tone, width: props.size ?? 22, height: props.size ?? 22 }}>{props.name.charAt(0)}</span>;
}

function readyToMove(card: CloudMemberJourneyCard, lastStage: string): boolean {
  return card.checkpoints_total > 0 && card.checkpoints_done === card.checkpoints_total && card.stage_key !== lastStage;
}

export function BoardScene(props: { start?: { open?: string; phone?: boolean; stage?: string } } = {}) {
  const [now] = useState(() => Date.now());
  const [board, setBoard] = useState(() => sampleJourneyBoard(now));
  const [open, setOpen] = useState<string | null>(props.start?.open ?? null);
  const [tab, setTab] = useState(props.start?.stage ?? "getting_started");
  const stages = board.stages;
  const last = stages[stages.length - 1]?.key ?? "";
  const nextOf = (key: string) => stages[stages.findIndex((stage) => stage.key === key) + 1];
  const move = (id: string, stageKey: string) => setBoard((b) => ({ ...b, cards: b.cards.map((card) => card.membership_id === id ? { ...card, stage_key: stageKey, checkpoints_done: 0, checkpoints: (b.stages.find((s) => s.key === stageKey)?.checkpoints ?? []).map((cp) => ({ key: cp.key, label: cp.label, kind: cp.kind, done: false, auto: true, completed_at: null })), checkpoints_total: (b.stages.find((s) => s.key === stageKey)?.checkpoints ?? []).length } : card) }));
  const opened = open ? board.cards.find((card) => card.membership_id === open) ?? null : null;
  const counts = new Map<JourneyCardStatus, number>();
  for (const card of board.cards) counts.set(card.status, (counts.get(card.status) ?? 0) + 1);

  const cardView = (card: CloudMemberJourneyCard) => {
    const ready = readyToMove(card, last);
    const next = nextOf(card.stage_key);
    const line = card.latest_outcome ? <><Award size={12} aria-hidden="true" />{card.latest_outcome.text}</> : card.working_on ?? card.activity_summary;
    return (
      <div key={card.membership_id} className={["mb-card", `s-${card.status}`, ready ? "ready" : "", open === card.membership_id ? "on" : ""].filter(Boolean).join(" ")}>
        <button type="button" className="mb-card-hit" aria-label={`Open ${card.name}`} onClick={() => setOpen(open === card.membership_id ? null : card.membership_id)} />
        <div className="mb-card-top">
          <Face name={card.name} id={card.membership_id} />
          <b>{card.name}</b>
          <i className="mb-dot" title={STATUS_WORD[card.status]} aria-label={STATUS_WORD[card.status]} />
        </div>
        {line ? <p className="mb-line">{line}</p> : null}
        <div className="mb-card-foot">
          {card.checkpoints_total ? (
            <span className="mb-bar" aria-label={`${card.checkpoints_done} of ${card.checkpoints_total} checkpoints`}>
              {card.checkpoints.map((cp) => <i key={cp.key} className={cp.done ? "done" : ""} />)}
            </span>
          ) : <span className="mb-bar empty" />}
          <span className="mb-marks">
            {card.founder_instruction ? <span title={`Your note: ${card.founder_instruction}`}><PenLine size={12} aria-label="Your note to the guide" /></span> : null}
            {card.agent_outcome ? <span className="ai" title={card.agent_outcome}><Sparkles size={12} aria-label="What the guide did" /></span> : null}
          </span>
        </div>
        {ready && next ? (
          <button type="button" className="mb-move" onClick={() => move(card.membership_id, next.key)}>Move to {next.name} →</button>
        ) : null}
      </div>
    );
  };

  const column = (stage: (typeof stages)[number]) => {
    const list = board.cards.filter((card) => card.stage_key === stage.key).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return (
      <section key={stage.key} className="mb-col">
        <header className="mb-col-head" title={stage.goal}>
          <b>{stage.name}</b><em>{list.length}</em>
          <MoreHorizontal size={15} aria-hidden="true" className="mb-col-more" />
        </header>
        <div className="mb-col-list">{list.map(cardView)}</div>
      </section>
    );
  };

  const record = opened ? (() => {
    const stage = stages.find((s) => s.key === opened.stage_key);
    return (
      <aside className="mb-record" aria-label={`${opened.name}'s record`}>
        <div className="mb-record-top">
          <Face name={opened.name} id={opened.membership_id} size={36} />
          <div><b>{opened.name}</b><span>{opened.plan_label} · {opened.activity_summary}</span></div>
          <button type="button" className="mb-x" onClick={() => setOpen(null)} aria-label="Close">×</button>
        </div>
        <div className="mb-rows">
          <span>Stage</span><b>{stage?.name}</b>
          <span>Status</span><b className={`mb-status s-${opened.status}`}><i className="mb-dot" />{STATUS_WORD[opened.status]}</b>
          {opened.working_on ? <><span>Working on</span><b>{opened.working_on}</b></> : null}
        </div>
        {opened.checkpoints.length ? (
          <div className="mb-block">
            <span className="mb-label">{stage?.name}: {opened.checkpoints_done} of {opened.checkpoints_total}</span>
            {opened.checkpoints.map((cp) => <p key={cp.key} className={cp.done ? "mb-cp done" : "mb-cp"}><i />{cp.label}<em>{cp.auto ? "Ticks itself" : ""}</em></p>)}
          </div>
        ) : null}
        <div className="mb-block">
          <span className="mb-label">Your note to the guide</span>
          <p className="mb-note">{opened.founder_instruction ?? "Add a note. The guide uses it when it talks to them."}</p>
        </div>
        {opened.agent_outcome ? (
          <div className="mb-block">
            <span className="mb-label ai">What the guide did</span>
            <p className="mb-note ai"><Sparkles size={12} aria-hidden="true" />{opened.agent_outcome}</p>
          </div>
        ) : null}
      </aside>
    );
  })() : null;

  return (
    <div className={props.start?.phone ? "mb phone" : "mb"}>
      <div className="mb-bar-top">
        <b className="mb-title">Members</b>
        <span className="mb-seg"><span>Table</span><span className="on">Board</span></span>
        <span className="mb-search"><Search size={13} aria-hidden="true" />Search</span>
        <span className="mb-filters">
          {(["needs_you", "stuck", "quiet"] as JourneyCardStatus[]).map((status) => (
            <span key={status} className={`mb-filter s-${status}`}><i className="mb-dot" />{STATUS_WORD[status]} {counts.get(status) ?? 0}</span>
          ))}
        </span>
      </div>
      {props.start?.phone ? (
        <>
          <div className="mb-tabs" role="tablist">
            {stages.map((stage) => (
              <button key={stage.key} type="button" role="tab" aria-selected={tab === stage.key} className={tab === stage.key ? "on" : ""} onClick={() => setTab(stage.key)}>
                {stage.name} <em>{board.cards.filter((card) => card.stage_key === stage.key).length}</em>
              </button>
            ))}
          </div>
          {column(stages.find((stage) => stage.key === tab) ?? stages[0])}
        </>
      ) : (
        <div className={record ? "mb-body with-record" : "mb-body"}>
          <div className="mb-cols">{stages.map(column)}</div>
          {record}
        </div>
      )}
    </div>
  );
}
