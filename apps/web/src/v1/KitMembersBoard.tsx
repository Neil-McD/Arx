import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Award, CheckCircle2, Plus, Search, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import {
  BUILTIN_JOURNEY_CHECKPOINTS,
  DEFAULT_JOURNEY_STAGES,
  JOURNEY_CARD_STATUSES,
  JOURNEY_CARD_STATUS_LABELS,
  JOURNEY_CARD_STATUS_SORT_RANK,
  MAX_CHECKPOINT_LABEL_CHARS,
  MAX_JOURNEY_STAGES,
  MAX_STAGE_CHECKPOINTS,
  MAX_STAGE_GOAL_CHARS,
  MAX_STAGE_NAME_CHARS,
  MIN_JOURNEY_STAGES,
  slugifyJourneyStageKey,
  type JourneyCardStatus,
  type JourneyStageCheckpoint,
} from "../../../../shared/communityMemberJourney";
import type {
  CloudMemberJourneyBoard,
} from "../../../../shared/cloudCommunityMemberJourneyGateway";
import { Btn, cx } from "./kit";
import { Face } from "./KitMembersTable";
import "./KitMembersBoard.css";

type StageDraft = {
  key?: string;
  name: string;
  goal: string;
  checkpoints: JourneyStageCheckpoint[];
};

export function KitMembersBoard(props: {
  board: CloudMemberJourneyBoard | null;
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  openKey: string | null;
  now: number;
  timeFor: (iso: string | null, now: number) => string;
  onOpenCard: (membershipId: string) => void;
  onMoveCard: (membershipId: string, stageKey: string) => Promise<void>;
  onSaveStages: (stages: StageDraft[]) => Promise<void>;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const [statusFilter, setStatusFilter] = useState<JourneyCardStatus | "all">("all");
  const [editingStages, setEditingStages] = useState(false);
  const [stageDrafts, setStageDrafts] = useState<StageDraft[]>([]);
  const [customMilestoneInputs, setCustomMilestoneInputs] = useState<Record<number, string>>({});
  const [savingStages, setSavingStages] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStageKey, setDropStageKey] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const stages = props.board?.stages ?? [];
  const allCards = props.board?.cards ?? [];

  const searchLower = props.search.trim().toLowerCase();
  const searchedCards = useMemo(() => {
    if (!searchLower) return allCards;
    return allCards.filter((card) =>
      [
        card.name,
        card.handle,
        card.working_on,
        card.activity_summary,
        card.latest_outcome?.text,
        card.founder_instruction,
        card.plan_label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchLower),
    );
  }, [allCards, searchLower]);

  const statusCounts = useMemo(() => {
    const counts: Record<JourneyCardStatus, number> = {
      needs_you: 0,
      stuck: 0,
      on_track: 0,
      quiet: 0,
      done: 0,
    };
    for (const card of searchedCards) counts[card.status] += 1;
    return counts;
  }, [searchedCards]);

  const visibleCards = useMemo(
    () =>
      statusFilter === "all"
        ? searchedCards
        : searchedCards.filter((card) => card.status === statusFilter),
    [searchedCards, statusFilter],
  );

  const activatedPercent = useMemo(() => {
    if (allCards.length === 0 || stages.length < 2) return 0;
    const activatedStageKeys = new Set(
      stages.slice(stages.length >= 3 ? 2 : 1).map((stage) => stage.key),
    );
    const count = allCards.filter((card) => activatedStageKeys.has(card.stage_key)).length;
    return Math.round((count / allCards.length) * 100);
  }, [allCards, stages]);

  const totalLoggedWins = useMemo(
    () => allCards.reduce((sum, card) => sum + (card.outcomes?.length ?? 0), 0),
    [allCards],
  );

  const openStageEditor = () => {
    setStageDrafts(
      (stages.length ? stages : DEFAULT_JOURNEY_STAGES).map((stage) => ({
        key: stage.key,
        name: stage.name,
        goal: stage.goal,
        checkpoints: (stage.checkpoints ?? []).map((cp) => ({ ...cp })),
      })),
    );
    setCustomMilestoneInputs({});
    setStageError(null);
    setEditingStages(true);
  };

  const toggleBuiltinCheckpoint = (
    stageIndex: number,
    builtin: (typeof BUILTIN_JOURNEY_CHECKPOINTS)[number],
  ) => {
    setStageDrafts((prev) =>
      prev.map((item, idx) => {
        if (idx !== stageIndex) return item;
        const exists = item.checkpoints.some((cp) => cp.key === builtin.key);
        if (exists) {
          return {
            ...item,
            checkpoints: item.checkpoints.filter((cp) => cp.key !== builtin.key),
          };
        }
        if (item.checkpoints.length >= MAX_STAGE_CHECKPOINTS) return item;
        return {
          ...item,
          checkpoints: [
            ...item.checkpoints,
            { key: builtin.key, label: builtin.label, kind: builtin.kind },
          ],
        };
      }),
    );
  };

  const addCustomCheckpoint = (stageIndex: number) => {
    const raw = (customMilestoneInputs[stageIndex] ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHECKPOINT_LABEL_CHARS);
    if (!raw) return;
    const key = slugifyJourneyStageKey(raw, stageIndex);
    setStageDrafts((prev) =>
      prev.map((item, idx) => {
        if (idx !== stageIndex) return item;
        if (item.checkpoints.length >= MAX_STAGE_CHECKPOINTS) return item;
        if (item.checkpoints.some((cp) => cp.key === key)) return item;
        return {
          ...item,
          checkpoints: [...item.checkpoints, { key, label: raw, kind: "custom" }],
        };
      }),
    );
    setCustomMilestoneInputs((prev) => ({ ...prev, [stageIndex]: "" }));
  };

  const removeCheckpoint = (stageIndex: number, checkpointKey: string) => {
    setStageDrafts((prev) =>
      prev.map((item, idx) =>
        idx === stageIndex
          ? { ...item, checkpoints: item.checkpoints.filter((cp) => cp.key !== checkpointKey) }
          : item,
      ),
    );
  };

  const handleSaveStages = async () => {
    if (savingStages) return;
    if (stageDrafts.some((entry) => !entry.name.trim())) {
      setStageError("Every stage needs a name.");
      return;
    }
    setSavingStages(true);
    setStageError(null);
    try {
      await props.onSaveStages(
        stageDrafts.map((entry) => ({
          ...(entry.key ? { key: entry.key } : {}),
          name: entry.name.trim(),
          goal: entry.goal.trim(),
          checkpoints: entry.checkpoints,
        })),
      );
      setEditingStages(false);
    } catch {
      setStageError("Stages couldn't be saved. Try again.");
    } finally {
      setSavingStages(false);
    }
  };

  const moveDraft = (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= stageDrafts.length) return;
    setStageDrafts((prev) => {
      const next = prev.slice();
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const handleDropOnStage = async (stageKey: string) => {
    const membershipId = draggingId;
    setDraggingId(null);
    setDropStageKey(null);
    if (!membershipId) return;
    const card = allCards.find((entry) => entry.membership_id === membershipId);
    if (!card || card.stage_key === stageKey) return;
    setMovingId(membershipId);
    try {
      await props.onMoveCard(membershipId, stageKey);
    } finally {
      setMovingId(null);
    }
  };

  if (props.error) {
    return <p className={cx("bad")} role="alert" style={{ marginTop: 14 }}>{props.error}</p>;
  }

  if (props.loading && !props.board) {
    return <p className={cx("sub")} style={{ marginTop: 18 }}>Loading member board…</p>;
  }

  return (
    <div className="members-board-shell">
      <div className="members-board-toolbar">
        <div className="members-board-toolbar-left">
          <div className="members-board-search">
            <Search size={13} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="search"
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              placeholder="Search members…"
              aria-label="Search members on board"
            />
          </div>
          <div className="members-board-filters" role="group" aria-label="Filter cards by status">
            <button
              type="button"
              className={cx("chip", statusFilter === "all" && "sel")}
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            >
              All · {searchedCards.length}
            </button>
            {JOURNEY_CARD_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={cx("chip", statusFilter === status && "sel")}
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {JOURNEY_CARD_STATUS_LABELS[status]}
                {statusCounts[status] ? ` · ${statusCounts[status]}` : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="members-board-toolbar-right">
          <span className="members-board-pulse" aria-label="Board summary">
            <strong>{activatedPercent}%</strong> activated
            {totalLoggedWins > 0 ? <> · <strong>{totalLoggedWins}</strong> {totalLoggedWins === 1 ? "win" : "wins"}</> : null}
          </span>
          <button
            type="button"
            className={cx("btn sm")}
            onClick={() => (editingStages ? setEditingStages(false) : openStageEditor())}
          >
            <SlidersHorizontal size={13} strokeWidth={1.8} aria-hidden="true" />
            {editingStages ? "Close stages" : "Edit stages"}
          </button>
        </div>
      </div>

      {editingStages ? (
        <div className="members-board-stage-editor" aria-label="Edit journey stages">
          <div className="members-board-stage-editor-head">
            <div>
              <strong style={{ fontSize: 13.5 }}>Journey stages & activation checkpoints</strong>
              <p className={cx("sub")} style={{ margin: "2px 0 0", fontSize: 12 }}>
                Set each stage's goal and optional checkpoints. Built-in signals check off automatically; custom milestones can be checked off on any member card.
              </p>
            </div>
            <button
              type="button"
              className={cx("btn sm")}
              onClick={() =>
                setStageDrafts(
                  DEFAULT_JOURNEY_STAGES.map((stage) => ({
                    key: stage.key,
                    name: stage.name,
                    goal: stage.goal,
                    checkpoints: stage.checkpoints.map((cp) => ({ ...cp })),
                  })),
                )
              }
            >
              Reset defaults
            </button>
          </div>

          {stageDrafts.map((stage, index) => {
            const customCheckpoints = stage.checkpoints.filter((cp) => cp.kind === "custom");
            return (
              <div key={stage.key ?? `new-${index}`} className="members-board-stage-editor-block">
                <div className="members-board-stage-editor-row">
                  <input
                    value={stage.name}
                    maxLength={MAX_STAGE_NAME_CHARS}
                    placeholder="Stage name"
                    aria-label={`Stage ${index + 1} name`}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStageDrafts((prev) =>
                        prev.map((item, idx) => (idx === index ? { ...item, name: value } : item)),
                      );
                    }}
                  />
                  <input
                    value={stage.goal}
                    maxLength={MAX_STAGE_GOAL_CHARS}
                    placeholder="Goal for this stage (optional)"
                    aria-label={`Stage ${index + 1} goal`}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStageDrafts((prev) =>
                        prev.map((item, idx) => (idx === index ? { ...item, goal: value } : item)),
                      );
                    }}
                  />
                  <div className="members-board-stage-editor-actions">
                    <button
                      type="button"
                      className={cx("btn sm")}
                      disabled={index === 0}
                      aria-label={`Move ${stage.name || `stage ${index + 1}`} earlier`}
                      onClick={() => moveDraft(index, -1)}
                    >
                      <ArrowUp size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={cx("btn sm")}
                      disabled={index === stageDrafts.length - 1}
                      aria-label={`Move ${stage.name || `stage ${index + 1}`} later`}
                      onClick={() => moveDraft(index, 1)}
                    >
                      <ArrowDown size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={cx("btn sm")}
                      disabled={stageDrafts.length <= MIN_JOURNEY_STAGES}
                      aria-label={`Remove ${stage.name || `stage ${index + 1}`}`}
                      onClick={() =>
                        setStageDrafts((prev) => prev.filter((_, idx) => idx !== index))
                      }
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="members-board-stage-checkpoints">
                  <span className="members-board-stage-cp-label">Checkpoints:</span>
                  {BUILTIN_JOURNEY_CHECKPOINTS.map((builtin) => {
                    const active = stage.checkpoints.some((cp) => cp.key === builtin.key);
                    return (
                      <button
                        key={builtin.key}
                        type="button"
                        className={`members-board-cp-pill${active ? " is-on" : ""}`}
                        aria-pressed={active}
                        onClick={() => toggleBuiltinCheckpoint(index, builtin)}
                      >
                        {active ? "✓ " : "+ "}
                        {builtin.label}
                      </button>
                    );
                  })}
                  {customCheckpoints.map((cp) => (
                    <span key={cp.key} className="members-board-cp-pill is-on is-custom">
                      {cp.label}
                      <button
                        type="button"
                        aria-label={`Remove ${cp.label}`}
                        onClick={() => removeCheckpoint(index, cp.key)}
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {stage.checkpoints.length < MAX_STAGE_CHECKPOINTS ? (
                    <span className="members-board-cp-add">
                      <input
                        value={customMilestoneInputs[index] ?? ""}
                        maxLength={MAX_CHECKPOINT_LABEL_CHARS}
                        placeholder="Add custom milestone…"
                        aria-label={`Add custom milestone for ${stage.name || `stage ${index + 1}`}`}
                        onChange={(event) =>
                          setCustomMilestoneInputs((prev) => ({ ...prev, [index]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCustomCheckpoint(index);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="members-board-cp-pill"
                        onClick={() => addCustomCheckpoint(index)}
                      >
                        Add
                      </button>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {stageError ? (
            <p className={cx("bad")} role="alert" style={{ margin: 0, fontSize: 12.5 }}>
              {stageError}
            </p>
          ) : null}

          <div className="members-board-stage-editor-foot">
            <button
              type="button"
              className={cx("btn sm")}
              disabled={stageDrafts.length >= MAX_JOURNEY_STAGES}
              onClick={() =>
                setStageDrafts((prev) => [...prev, { name: "", goal: "", checkpoints: [] }])
              }
            >
              <Plus size={13} aria-hidden="true" />Add stage
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small onClick={() => setEditingStages(false)}>Cancel</Btn>
              <Btn small go onClick={() => void handleSaveStages()}>
                {savingStages ? "Saving…" : "Save stages"}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

      <div className="members-board-columns" role="region" aria-label="Member journey board">
        {stages.map((stage) => {
          const stageCards = visibleCards
            .filter((card) => card.stage_key === stage.key)
            .sort((a, b) => {
              const rankDiff = JOURNEY_CARD_STATUS_SORT_RANK[a.status] - JOURNEY_CARD_STATUS_SORT_RANK[b.status];
              if (rankDiff !== 0) return rankDiff;
              return String(b.last_active_at ?? b.joined_at ?? "").localeCompare(
                String(a.last_active_at ?? a.joined_at ?? ""),
              );
            });
          const isDropTarget = dropStageKey === stage.key;
          return (
            <div
              key={stage.key}
              className={`members-board-col${isDropTarget ? " is-drop-target" : ""}`}
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                if (dropStageKey !== stage.key) setDropStageKey(stage.key);
              }}
              onDragLeave={() => {
                if (dropStageKey === stage.key) setDropStageKey(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                void handleDropOnStage(stage.key);
              }}
            >
              <div className="members-board-col-head">
                <div className="members-board-col-title">
                  <span>{stage.name}</span>
                  <span className="members-board-col-count">{stageCards.length}</span>
                </div>
                {stage.goal ? <p className="members-board-col-goal">{stage.goal}</p> : null}
              </div>

              <div className="members-board-col-list">
                {stageCards.length === 0 ? (
                  <div className="members-board-col-empty">
                    {draggingId ? "Drop here to move" : "No members in this stage"}
                  </div>
                ) : (
                  stageCards.map((card) => {
                    const selected = props.openKey === card.membership_id;
                    const dragging = draggingId === card.membership_id || movingId === card.membership_id;
                    const allCheckpointsDone =
                      card.checkpoints_total > 0 && card.checkpoints_done >= card.checkpoints_total;
                    return (
                      <button
                        key={card.membership_id}
                        type="button"
                        draggable
                        className={`members-board-card${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
                        onDragStart={(event) => {
                          setDraggingId(card.membership_id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", card.membership_id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropStageKey(null);
                        }}
                        onClick={() => props.onOpenCard(card.membership_id)}
                      >
                        <div className="members-board-card-top">
                          <Face
                            size="s"
                            name={card.name}
                            url={card.avatar_url}
                            focusX={card.avatar_focus_x}
                            focusY={card.avatar_focus_y}
                            zoom={card.avatar_zoom}
                            seed={card.user_id}
                            getAvatarColor={props.getAvatarColor}
                            getInitials={props.getInitials}
                          />
                          <div className="members-board-card-who">
                            <span className="members-board-card-name">{card.name}</span>
                            <span className="members-board-card-meta">
                              {card.plan_label}
                              {card.activity_summary ? ` · ${card.activity_summary}` : ""}
                              {!card.activity_summary && card.last_active_at
                                ? ` · ${props.timeFor(card.last_active_at, props.now)}`
                                : ""}
                            </span>
                          </div>
                          <span className={`members-board-status is-${card.status}`}>
                            {JOURNEY_CARD_STATUS_LABELS[card.status]}
                          </span>
                        </div>

                        {card.checkpoints_total > 0 ? (
                          <div className={`members-board-card-progress${allCheckpointsDone ? " is-ready" : ""}`}>
                            <CheckCircle2 size={11} aria-hidden="true" />
                            <span>
                              {card.checkpoints_done}/{card.checkpoints_total}{" "}
                              {allCheckpointsDone ? "ready to advance" : card.checkpoints_total === 1 ? "checkpoint" : "checkpoints"}
                            </span>
                          </div>
                        ) : null}

                        {card.latest_outcome ? (
                          <div className="members-board-card-win">
                            <Award size={11} aria-hidden="true" />
                            <span>{card.latest_outcome.text}</span>
                          </div>
                        ) : null}

                        {card.working_on ? (
                          <p className="members-board-card-note">{card.working_on}</p>
                        ) : null}

                        {card.founder_instruction ? (
                          <p className="members-board-card-instruction" title="Instruction for your Guide">
                            <Sparkles size={11} aria-hidden="true" style={{ marginRight: 4, verticalAlign: -1 }} />
                            {card.founder_instruction}
                          </p>
                        ) : null}

                        {card.agent_outcome ? (
                          <div className="members-board-card-outcome">
                            <span>{card.agent_outcome}</span>
                            {card.agent_outcome_at ? (
                              <em>{props.timeFor(card.agent_outcome_at, props.now)}</em>
                            ) : null}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {props.board?.capped ? (
        <p className={cx("none")} style={{ margin: "6px 0 8px", fontSize: 12 }}>
          Showing the 200 most recent active members on the board. Use Table view to browse everyone.
        </p>
      ) : null}
    </div>
  );
}
