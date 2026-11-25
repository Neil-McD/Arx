import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  BUILTIN_JOURNEY_CHECKPOINTS,
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
  type JourneyStageDefinition,
} from "../../../../shared/communityMemberJourney";
import type { CloudMemberJourneyBoard } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import { cx } from "./kit";
import { Face } from "./KitMembersTable";
import "./KitMembersBoard.css";

type StageSaveInput = {
  key?: string;
  name: string;
  goal: string;
  checkpoints: JourneyStageCheckpoint[];
};

function toSaveList(stages: readonly JourneyStageDefinition[]): StageSaveInput[] {
  return stages.map((stage) => ({
    key: stage.key,
    name: stage.name,
    goal: stage.goal,
    checkpoints: (stage.checkpoints ?? []).map((cp) => ({ ...cp })),
  }));
}

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
  onSaveStages: (stages: StageSaveInput[]) => Promise<void>;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const [statusFilter, setStatusFilter] = useState<JourneyCardStatus | "all">("all");
  const [editingField, setEditingField] = useState<{ stageKey: string; field: "name" | "goal" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [openMenuStageKey, setOpenMenuStageKey] = useState<string | null>(null);
  const [openCpStageKey, setOpenCpStageKey] = useState<string | null>(null);
  const [customCpDraft, setCustomCpDraft] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStageKey, setDropStageKey] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const stages = props.board?.stages ?? [];
  const allCards = props.board?.cards ?? [];

  useEffect(() => {
    if (!openMenuStageKey && !openCpStageKey) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setOpenMenuStageKey(null);
        setOpenCpStageKey(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuStageKey(null);
        setOpenCpStageKey(null);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuStageKey, openCpStageKey]);

  const persistStages = async (nextStages: StageSaveInput[]) => {
    if (savingStage) return false;
    setSavingStage(true);
    setStageError(null);
    try {
      await props.onSaveStages(nextStages);
      return true;
    } catch {
      setStageError("Couldn't save that change. Try again.");
      return false;
    } finally {
      setSavingStage(false);
    }
  };

  const startInlineEdit = (stage: JourneyStageDefinition, field: "name" | "goal") => {
    if (savingStage) return;
    setOpenMenuStageKey(null);
    setOpenCpStageKey(null);
    setStageError(null);
    setEditingField({ stageKey: stage.key, field });
    setEditValue(field === "name" ? stage.name : stage.goal);
  };

  const commitInlineEdit = async () => {
    if (!editingField || savingStage) return;
    const { stageKey, field } = editingField;
    const stage = stages.find((entry) => entry.key === stageKey);
    const trimmed = editValue.replace(/\s+/g, " ").trim();
    if (!stage) {
      setEditingField(null);
      return;
    }
    if (field === "name" && !trimmed) {
      setEditingField(null);
      return;
    }
    const unchanged = field === "name" ? trimmed === stage.name : trimmed === stage.goal;
    if (unchanged) {
      setEditingField(null);
      return;
    }
    const nextList = toSaveList(stages).map((entry) =>
      entry.key === stageKey
        ? {
            ...entry,
            name: field === "name" ? trimmed.slice(0, MAX_STAGE_NAME_CHARS) : entry.name,
            goal: field === "goal" ? trimmed.slice(0, MAX_STAGE_GOAL_CHARS) : entry.goal,
          }
        : entry,
    );
    setEditingField(null);
    await persistStages(nextList);
  };

  const toggleStageBuiltinCheckpoint = async (
    stageKey: string,
    builtin: (typeof BUILTIN_JOURNEY_CHECKPOINTS)[number],
  ) => {
    const nextList = toSaveList(stages).map((entry) => {
      if (entry.key !== stageKey) return entry;
      const exists = entry.checkpoints.some((cp) => cp.key === builtin.key);
      if (exists) {
        return { ...entry, checkpoints: entry.checkpoints.filter((cp) => cp.key !== builtin.key) };
      }
      if (entry.checkpoints.length >= MAX_STAGE_CHECKPOINTS) return entry;
      return {
        ...entry,
        checkpoints: [
          ...entry.checkpoints,
          { key: builtin.key, label: builtin.label, kind: builtin.kind },
        ],
      };
    });
    await persistStages(nextList);
  };

  const addStageCustomCheckpoint = async (stageIndex: number, stageKey: string) => {
    const label = customCpDraft.replace(/\s+/g, " ").trim().slice(0, MAX_CHECKPOINT_LABEL_CHARS);
    if (!label) return;
    const cpKey = slugifyJourneyStageKey(label, stageIndex);
    const currentStage = stages.find((entry) => entry.key === stageKey);
    if (!currentStage) return;
    if (
      currentStage.checkpoints.length >= MAX_STAGE_CHECKPOINTS ||
      currentStage.checkpoints.some((cp) => cp.key === cpKey)
    ) {
      setCustomCpDraft("");
      return;
    }
    const nextList = toSaveList(stages).map((entry) =>
      entry.key === stageKey
        ? { ...entry, checkpoints: [...entry.checkpoints, { key: cpKey, label, kind: "custom" as const }] }
        : entry,
    );
    setCustomCpDraft("");
    await persistStages(nextList);
  };

  const removeStageCheckpoint = async (stageKey: string, cpKey: string) => {
    const nextList = toSaveList(stages).map((entry) =>
      entry.key === stageKey
        ? { ...entry, checkpoints: entry.checkpoints.filter((cp) => cp.key !== cpKey) }
        : entry,
    );
    await persistStages(nextList);
  };

  const moveStage = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const nextList = toSaveList(stages);
    [nextList[index], nextList[target]] = [nextList[target]!, nextList[index]!];
    setOpenMenuStageKey(null);
    await persistStages(nextList);
  };

  const deleteStage = async (stageKey: string) => {
    if (stages.length <= MIN_JOURNEY_STAGES) return;
    const nextList = toSaveList(stages).filter((entry) => entry.key !== stageKey);
    setOpenMenuStageKey(null);
    await persistStages(nextList);
  };

  const addStageInline = async () => {
    if (stages.length >= MAX_JOURNEY_STAGES || savingStage) return;
    const existingKeys = new Set(stages.map((entry) => entry.key));
    let suffix = stages.length + 1;
    let newKey = `stage_${suffix}`;
    while (existingKeys.has(newKey)) {
      suffix += 1;
      newKey = `stage_${suffix}`;
    }
    const newName = `Stage ${stages.length + 1}`;
    const nextList = [
      ...toSaveList(stages),
      { key: newKey, name: newName, goal: "", checkpoints: [] },
    ];
    const ok = await persistStages(nextList);
    if (ok) {
      setEditingField({ stageKey: newKey, field: "name" });
      setEditValue(newName);
    }
  };

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
        </div>
      </div>

      {stageError ? (
        <p className={cx("bad")} role="alert" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          {stageError}
        </p>
      ) : null}

      <div className="members-board-columns" role="region" aria-label="Member journey board">
        {stages.map((stage, stageIndex) => {
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
          const isEditingName = editingField?.stageKey === stage.key && editingField.field === "name";
          const isEditingGoal = editingField?.stageKey === stage.key && editingField.field === "goal";
          const menuOpen = openMenuStageKey === stage.key;
          const cpOpen = openCpStageKey === stage.key;

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
                  {isEditingName ? (
                    <input
                      className="members-board-inline-input is-title"
                      value={editValue}
                      maxLength={MAX_STAGE_NAME_CHARS}
                      autoFocus
                      disabled={savingStage}
                      aria-label={`Stage ${stageIndex + 1} name`}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setEditValue(event.target.value)}
                      onBlur={() => void commitInlineEdit()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void commitInlineEdit();
                        } else if (event.key === "Escape") {
                          event.stopPropagation();
                          setEditingField(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="members-board-inline-name"
                      title="Click to rename stage"
                      onClick={() => startInlineEdit(stage, "name")}
                    >
                      {stage.name}
                    </button>
                  )}

                  <div className="members-board-col-head-right">
                    <span className="members-board-col-count">{stageCards.length}</span>
                    <div className="members-board-col-menu-wrap" ref={menuOpen ? popoverRef : undefined}>
                      <button
                        type="button"
                        className="members-board-col-menu-btn"
                        aria-label={`Stage options for ${stage.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => {
                          setOpenCpStageKey(null);
                          setOpenMenuStageKey(menuOpen ? null : stage.key);
                        }}
                      >
                        <MoreHorizontal size={14} aria-hidden="true" />
                      </button>
                      {menuOpen ? (
                        <div className="members-board-popover" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={stageIndex === 0 || savingStage}
                            onClick={() => void moveStage(stageIndex, -1)}
                          >
                            <ArrowLeft size={12} aria-hidden="true" />Move left
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={stageIndex === stages.length - 1 || savingStage}
                            onClick={() => void moveStage(stageIndex, 1)}
                          >
                            <ArrowRight size={12} aria-hidden="true" />Move right
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            disabled={stages.length <= MIN_JOURNEY_STAGES || savingStage}
                            onClick={() => void deleteStage(stage.key)}
                          >
                            <Trash2 size={12} aria-hidden="true" />Delete stage
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {isEditingGoal ? (
                  <input
                    className="members-board-inline-input is-goal"
                    value={editValue}
                    maxLength={MAX_STAGE_GOAL_CHARS}
                    placeholder="Add a goal for this stage…"
                    autoFocus
                    disabled={savingStage}
                    aria-label={`${stage.name} goal`}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setEditValue(event.target.value)}
                    onBlur={() => void commitInlineEdit()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitInlineEdit();
                      } else if (event.key === "Escape") {
                        event.stopPropagation();
                        setEditingField(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={`members-board-inline-goal${stage.goal ? "" : " is-empty"}`}
                    title="Click to edit stage goal"
                    onClick={() => startInlineEdit(stage, "goal")}
                  >
                    {stage.goal || "Add a goal…"}
                  </button>
                )}

                <div className="members-board-col-cps">
                  {(stage.checkpoints ?? []).map((cp) => (
                    <span key={cp.key} className="members-board-col-cp-pill">
                      <span>{cp.label}</span>
                      <button
                        type="button"
                        aria-label={`Remove checkpoint ${cp.label}`}
                        disabled={savingStage}
                        onClick={() => void removeStageCheckpoint(stage.key, cp.key)}
                      >
                        <X size={10} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {(stage.checkpoints ?? []).length < MAX_STAGE_CHECKPOINTS ? (
                    <div className="members-board-col-menu-wrap" ref={cpOpen ? popoverRef : undefined}>
                      <button
                        type="button"
                        className="members-board-col-cp-add"
                        aria-haspopup="menu"
                        aria-expanded={cpOpen}
                        onClick={() => {
                          setOpenMenuStageKey(null);
                          setCustomCpDraft("");
                          setOpenCpStageKey(cpOpen ? null : stage.key);
                        }}
                      >
                        <Plus size={10} aria-hidden="true" />Checkpoint
                      </button>
                      {cpOpen ? (
                        <div className="members-board-popover is-cp" role="menu">
                          <span className="members-board-popover-label">Automatic proof</span>
                          {BUILTIN_JOURNEY_CHECKPOINTS.map((builtin) => {
                            const active = (stage.checkpoints ?? []).some((cp) => cp.key === builtin.key);
                            return (
                              <button
                                key={builtin.key}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={active}
                                disabled={savingStage}
                                onClick={() => void toggleStageBuiltinCheckpoint(stage.key, builtin)}
                              >
                                <span>{active ? "✓ " : ""}{builtin.label}</span>
                              </button>
                            );
                          })}
                          <form
                            className="members-board-popover-custom"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void addStageCustomCheckpoint(stageIndex, stage.key);
                            }}
                          >
                            <input
                              value={customCpDraft}
                              maxLength={MAX_CHECKPOINT_LABEL_CHARS}
                              placeholder="Custom milestone…"
                              aria-label={`Custom milestone for ${stage.name}`}
                              onChange={(event) => setCustomCpDraft(event.target.value)}
                            />
                            <button type="submit" disabled={savingStage || !customCpDraft.trim()}>
                              Add
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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

        {stages.length < MAX_JOURNEY_STAGES ? (
          <button
            type="button"
            className="members-board-add-stage-col"
            disabled={savingStage}
            onClick={() => void addStageInline()}
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add stage</span>
          </button>
        ) : null}
      </div>

      {props.board?.capped ? (
        <p className={cx("none")} style={{ margin: "6px 0 8px", fontSize: 12 }}>
          Showing the 200 most recent active members on the board. Use Table view to browse everyone.
        </p>
      ) : null}
    </div>
  );
}
