import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  ListChecks,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Target,
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
import type { CloudMemberJourneyBoard, CloudMemberJourneyCard } from "../../../../shared/cloudCommunityMemberJourneyGateway";
import { cx, usePhoneLayout } from "./kit";
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

// Only these statuses get a mark on a card: everyone else is fine (Neil,
// Nov 25: the board shows exceptions, not everyone's state).
const NEEDS_LOOK: ReadonlySet<JourneyCardStatus> = new Set(["needs_you", "stuck", "quiet"]);

// The guide's note on a card (formatCoachOutcomeSummary, or a move's note),
// shorter: "Guide drafted a check-in (waiting on Home)" → "Drafted a check-in
// · on Home"; "Guide sent newcomer welcome · replied" → "Sent newcomer
// welcome · replied".
export function guideDidShort(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  const short = outcome.replace(/^Guide\s+/, "").replace(/\s*\(waiting on Home\)\s*$/, " · on Home").trim();
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : null;
}

// Why a card is marked, from what the board really knows (the status rule in
// shared/communityMemberJourney.ts deriveMemberJourneyStatus): a payment
// problem, a status the host set, days quiet, or a check-in not answered.
export function cardReason(card: Pick<CloudMemberJourneyCard, "status" | "status_is_manual" | "money_kind" | "last_active_at" | "joined_at">, nowMs: number): string | null {
  if (card.money_kind === "on_hold") return "Payment on hold";
  if (card.money_kind === "cancelling") return "Cancelling";
  if (card.status_is_manual) return `Marked ${JOURNEY_CARD_STATUS_LABELS[card.status].toLowerCase()} by you`;
  const at = Date.parse(card.last_active_at ?? card.joined_at ?? "");
  const days = Number.isFinite(at) ? Math.floor((nowMs - at) / 86_400_000) : null;
  if (card.status === "quiet") return days !== null ? `Quiet for ${days} days` : "Quiet for a month";
  if (card.status === "stuck") return days !== null && days >= 10 ? `Quiet for ${days} days` : "Hasn't answered a check-in";
  return null;
}

// What moves someone on from a stage, in a line.
export function stageRuleLine(stage: Pick<JourneyStageDefinition, "checkpoints">, isLast: boolean): string {
  const labels = (stage.checkpoints ?? []).map((cp) => cp.label.charAt(0).toLowerCase() + cp.label.slice(1));
  if (labels.length) return `To move on: ${labels.join(", ")}`;
  return isLast ? "The last stage" : "No checkpoints yet";
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
  onSaveStages: (stages: StageSaveInput[]) => Promise<JourneyStageDefinition[] | null | void>;
  getAvatarColor: (id: string) => string;
  getInitials: (name: string) => string;
}) {
  const [statusFilter, setStatusFilter] = useState<JourneyCardStatus | "all" | "ready">("all");
  const [localStages, setLocalStages] = useState<JourneyStageDefinition[] | null>(null);
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
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [phoneStageKey, setPhoneStageKey] = useState<string | null>(null);
  const phone = usePhoneLayout();

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const stagesRef = useRef<JourneyStageDefinition[]>([]);
  const propStages = props.board?.stages ?? [];
  useEffect(() => {
    setLocalStages(null);
  }, [props.board?.stages]);
  const stages = localStages ?? propStages;
  stagesRef.current = stages;
  const allCards = props.board?.cards ?? [];

  useEffect(() => {
    if (!openMenuStageKey && !openCpStageKey) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setOpenMenuStageKey(null);
        setOpenCpStageKey(null);
        setConfirmDeleteKey(null);
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
      const saved = await props.onSaveStages(nextStages);
      if (Array.isArray(saved)) {
        stagesRef.current = saved;
        setLocalStages(saved);
      }
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
    const currentStages = stagesRef.current;
    const stage = currentStages.find((entry) => entry.key === stageKey);
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
    const nextList = toSaveList(currentStages).map((entry) =>
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
    const nextList = toSaveList(stagesRef.current).map((entry) => {
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
    const currentStages = stagesRef.current;
    const currentStage = currentStages.find((entry) => entry.key === stageKey);
    if (!currentStage) return;
    if (
      currentStage.checkpoints.length >= MAX_STAGE_CHECKPOINTS ||
      currentStage.checkpoints.some((cp) => cp.key === cpKey)
    ) {
      setCustomCpDraft("");
      return;
    }
    const nextList = toSaveList(currentStages).map((entry) =>
      entry.key === stageKey
        ? { ...entry, checkpoints: [...entry.checkpoints, { key: cpKey, label, kind: "custom" as const }] }
        : entry,
    );
    setCustomCpDraft("");
    await persistStages(nextList);
  };

  const removeStageCheckpoint = async (stageKey: string, cpKey: string) => {
    const nextList = toSaveList(stagesRef.current).map((entry) =>
      entry.key === stageKey
        ? { ...entry, checkpoints: entry.checkpoints.filter((cp) => cp.key !== cpKey) }
        : entry,
    );
    await persistStages(nextList);
  };

  const moveStage = async (index: number, delta: -1 | 1) => {
    const currentStages = stagesRef.current;
    const target = index + delta;
    if (target < 0 || target >= currentStages.length) return;
    const nextList = toSaveList(currentStages);
    [nextList[index], nextList[target]] = [nextList[target]!, nextList[index]!];
    setOpenMenuStageKey(null);
    await persistStages(nextList);
  };

  const deleteStage = async (stageKey: string) => {
    const currentStages = stagesRef.current;
    if (currentStages.length <= MIN_JOURNEY_STAGES) return;
    const nextList = toSaveList(currentStages).filter((entry) => entry.key !== stageKey);
    setOpenMenuStageKey(null);
    await persistStages(nextList);
  };

  const addStageInline = async () => {
    const currentStages = stagesRef.current;
    if (currentStages.length >= MAX_JOURNEY_STAGES || savingStage) return;
    const existingKeys = new Set(currentStages.map((entry) => entry.key));
    let suffix = currentStages.length + 1;
    let newKey = `stage_${suffix}`;
    while (existingKeys.has(newKey)) {
      suffix += 1;
      newKey = `stage_${suffix}`;
    }
    const newName = `Stage ${currentStages.length + 1}`;
    const nextList = [
      ...toSaveList(currentStages),
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

  const lastStageKey = stages[stages.length - 1]?.key ?? null;
  const isReady = (card: (typeof allCards)[number]) =>
    card.checkpoints_total > 0 && card.checkpoints_done >= card.checkpoints_total && card.stage_key !== lastStageKey;
  const readyCount = searchedCards.filter(isReady).length;
  const visibleCards = useMemo(
    () =>
      statusFilter === "all"
        ? searchedCards
        : statusFilter === "ready"
          ? searchedCards.filter(isReady)
          : searchedCards.filter((card) => card.status === statusFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchedCards, statusFilter, lastStageKey],
  );
  const moveCardTo = async (membershipId: string, stageKey: string) => {
    setMovingId(membershipId);
    try {
      await props.onMoveCard(membershipId, stageKey);
    } finally {
      setMovingId(null);
    }
  };

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

  // The phone's tab, or the first stage when it's unset or its stage was deleted.
  const phoneKey = stages.some((stage) => stage.key === phoneStageKey) ? phoneStageKey : stages[0]?.key ?? null;
  const shownStages = phone ? stages.filter((stage) => stage.key === phoneKey) : stages;

  return (
    <div className={phone ? "members-board-shell is-phone" : "members-board-shell"}>
      <div className="members-board-toolbar">
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
        <div className="members-board-filters" role="group" aria-label="Filter cards">
          <button type="button" className={statusFilter === "all" ? "members-board-filter is-on" : "members-board-filter"}
            aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Everyone <em>{searchedCards.length}</em>
          </button>
          {readyCount ? (
            <button type="button" className={statusFilter === "ready" ? "members-board-filter is-ready is-on" : "members-board-filter is-ready"}
              aria-pressed={statusFilter === "ready"} onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}>
              <i className="members-board-dot" />Ready to move <em>{readyCount}</em>
            </button>
          ) : null}
          {[...JOURNEY_CARD_STATUSES.filter((status) => NEEDS_LOOK.has(status)), ...JOURNEY_CARD_STATUSES.filter((status) => !NEEDS_LOOK.has(status))]
            .filter((status) => statusCounts[status] > 0).map((status) => (
            <button key={status} type="button"
              className={`members-board-filter is-${status}${statusFilter === status ? " is-on" : ""}`}
              aria-pressed={statusFilter === status} onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}>
              {NEEDS_LOOK.has(status) ? <i className="members-board-dot" /> : null}{JOURNEY_CARD_STATUS_LABELS[status]} <em>{statusCounts[status]}</em>
            </button>
          ))}
        </div>
        <span className="members-board-pulse" aria-label="Board summary">
          <strong>{activatedPercent}%</strong> activated
          {totalLoggedWins > 0 ? <> · <strong>{totalLoggedWins}</strong> {totalLoggedWins === 1 ? "win" : "wins"}</> : null}
        </span>
      </div>

      {phone ? (
        <div className="members-board-tabs" role="tablist" aria-label="Stages">
          {stages.map((stage) => {
            const on = stage.key === phoneKey;
            return (
              <button key={stage.key} type="button" role="tab" aria-selected={on} className={on ? "is-on" : ""} onClick={() => setPhoneStageKey(stage.key)}>
                {stage.name} <em>{visibleCards.filter((card) => card.stage_key === stage.key).length}</em>
              </button>
            );
          })}
        </div>
      ) : null}

      {stageError ? (
        <p className={cx("bad")} role="alert" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          {stageError}
        </p>
      ) : null}

      <div className="members-board-columns" role="region" aria-label="Member journey board">
        {shownStages.map((stage) => {
          const stageIndex = stages.findIndex((entry) => entry.key === stage.key);
          const nextStage = stages[stageIndex + 1] ?? null;
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
          const confirming = confirmDeleteKey === stage.key;
          const moveTo = stages.find((entry) => entry.key !== stage.key)?.name ?? "the first stage";

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
              <div className="members-board-col-head" title={stage.goal || undefined}>
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
                  <span className="members-board-col-count">{stageCards.length}</span>
                  <div className="members-board-col-menu-wrap" ref={menuOpen || cpOpen ? popoverRef : undefined}>
                    <button
                      type="button"
                      className="members-board-col-menu-btn"
                      aria-label={`Stage options for ${stage.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => {
                        setOpenCpStageKey(null);
                        setConfirmDeleteKey(null);
                        setOpenMenuStageKey(menuOpen ? null : stage.key);
                      }}
                    >
                      <MoreHorizontal size={14} aria-hidden="true" />
                    </button>
                    {menuOpen ? (
                      <div className="members-board-popover" role="menu">
                        {confirming ? (
                          <div className="members-board-confirm">
                            <p>Delete {stage.name}? {stageCards.length ? `Its ${stageCards.length} ${stageCards.length === 1 ? "member moves" : "members move"} to ${moveTo}.` : "No one is in it."}</p>
                            <div>
                              <button type="button" className="is-danger" disabled={savingStage}
                                onClick={() => { setConfirmDeleteKey(null); void deleteStage(stage.key); }}>Delete stage</button>
                              <button type="button" onClick={() => setConfirmDeleteKey(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button type="button" role="menuitem" disabled={savingStage} onClick={() => startInlineEdit(stage, "goal")}>
                              <Target size={12} aria-hidden="true" />{stage.goal ? "Edit the goal" : "Add a goal"}
                            </button>
                            <button type="button" role="menuitem" disabled={savingStage}
                              onClick={() => { setOpenMenuStageKey(null); setCustomCpDraft(""); setOpenCpStageKey(stage.key); }}>
                              <ListChecks size={12} aria-hidden="true" />Checkpoints
                            </button>
                            <button type="button" role="menuitem" disabled={stageIndex === 0 || savingStage} onClick={() => void moveStage(stageIndex, -1)}>
                              <ArrowLeft size={12} aria-hidden="true" />Move left
                            </button>
                            <button type="button" role="menuitem" disabled={stageIndex === stages.length - 1 || savingStage} onClick={() => void moveStage(stageIndex, 1)}>
                              <ArrowRight size={12} aria-hidden="true" />Move right
                            </button>
                            <button type="button" role="menuitem" className="is-danger"
                              disabled={stages.length <= MIN_JOURNEY_STAGES || savingStage} onClick={() => setConfirmDeleteKey(stage.key)}>
                              <Trash2 size={12} aria-hidden="true" />Delete stage
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                    {cpOpen ? (
                      <div className="members-board-popover is-cp" role="menu">
                        <span className="members-board-popover-label">Ticks itself</span>
                        {BUILTIN_JOURNEY_CHECKPOINTS.map((builtin) => {
                          const active = (stage.checkpoints ?? []).some((cp) => cp.key === builtin.key);
                          return (
                            <button key={builtin.key} type="button" role="menuitemcheckbox" aria-checked={active}
                              disabled={savingStage || (!active && (stage.checkpoints ?? []).length >= MAX_STAGE_CHECKPOINTS)}
                              onClick={() => void toggleStageBuiltinCheckpoint(stage.key, builtin)}>
                              <span className={active ? "members-board-check is-on" : "members-board-check"} aria-hidden="true">{active ? "✓" : ""}</span>
                              {builtin.label}
                            </button>
                          );
                        })}
                        {(stage.checkpoints ?? []).some((cp) => cp.kind === "custom") ? (
                          <span className="members-board-popover-label">You tick these</span>
                        ) : null}
                        {(stage.checkpoints ?? []).filter((cp) => cp.kind === "custom").map((cp) => (
                          <span key={cp.key} className="members-board-popover-row">
                            {cp.label}
                            <button type="button" aria-label={`Remove checkpoint ${cp.label}`} disabled={savingStage}
                              onClick={() => void removeStageCheckpoint(stage.key, cp.key)}>
                              <X size={11} aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                        {(stage.checkpoints ?? []).length < MAX_STAGE_CHECKPOINTS ? (
                          <form className="members-board-popover-custom"
                            onSubmit={(event) => { event.preventDefault(); void addStageCustomCheckpoint(stageIndex, stage.key); }}>
                            <input value={customCpDraft} maxLength={MAX_CHECKPOINT_LABEL_CHARS} placeholder="Your own milestone…"
                              aria-label={`Custom milestone for ${stage.name}`} onChange={(event) => setCustomCpDraft(event.target.value)} />
                            <button type="submit" disabled={savingStage || !customCpDraft.trim()}>Add</button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                {isEditingGoal ? (
                  <input
                    className="members-board-inline-input is-goal"
                    value={editValue}
                    maxLength={MAX_STAGE_GOAL_CHARS}
                    placeholder="What this stage is for…"
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
                  <button type="button" className="members-board-col-rule" title="What moves someone on"
                    onClick={() => { setOpenMenuStageKey(null); setCustomCpDraft(""); setOpenCpStageKey(cpOpen ? null : stage.key); }}>
                    {stageRuleLine(stage, stageIndex === stages.length - 1)}
                  </button>
                )}
              </div>

              <div className="members-board-col-list">
                {stageCards.length === 0 ? (
                  <div className="members-board-col-empty">
                    {draggingId ? "Drop here to move" : "No one here yet"}
                  </div>
                ) : (
                  stageCards.map((card) => {
                    const selected = props.openKey === card.membership_id;
                    const dragging = draggingId === card.membership_id || movingId === card.membership_id;
                    const ready = isReady(card);
                    const offTrack = NEEDS_LOOK.has(card.status);
                    const did = guideDidShort(card.agent_outcome);
                    const lastSeen = card.last_active_at ? `Last seen ${props.timeFor(card.last_active_at, props.now).toLowerCase()}` : null;
                    // Off track: why. Otherwise their latest win, or what they're working on.
                    const line = offTrack
                      ? cardReason(card, props.now) ?? lastSeen
                      : card.latest_outcome
                        ? <><Award size={12} aria-hidden="true" />{card.latest_outcome.text}</>
                        : card.working_on ?? card.activity_summary ?? lastSeen;
                    return (
                      <div
                        key={card.membership_id}
                        role="button"
                        tabIndex={0}
                        draggable
                        aria-label={`${card.name}${offTrack ? `, ${JOURNEY_CARD_STATUS_LABELS[card.status]}` : ""}${ready ? ", ready to move on" : ""}`}
                        className={["members-board-card", `is-${card.status}`, ready ? "is-ready" : "", selected ? "is-selected" : "", dragging ? "is-dragging" : ""].filter(Boolean).join(" ")}
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
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            props.onOpenCard(card.membership_id);
                          }
                        }}
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
                          <span className="members-board-card-name">{card.name}</span>
                          {offTrack ? (
                            <i className="members-board-dot" title={JOURNEY_CARD_STATUS_LABELS[card.status]} aria-hidden="true" />
                          ) : null}
                        </div>
                        {line ? <p className="members-board-card-line">{line}</p> : null}
                        <div className="members-board-card-foot">
                          {card.checkpoints_total > 0 ? (
                            <span className="members-board-card-bar" title={`${card.checkpoints_done} of ${card.checkpoints_total} checkpoints`}>
                              {Array.from({ length: card.checkpoints_total }, (_, index) => (
                                <i key={index} className={index < card.checkpoints_done ? "is-done" : ""} />
                              ))}
                            </span>
                          ) : null}
                          <span className="members-board-card-marks">
                            {card.founder_instruction ? (
                              <span title={`Your note to the guide: ${card.founder_instruction}`}><PenLine size={12} aria-label="Your note to the guide" /></span>
                            ) : null}
                            {did ? (
                              <span className="is-ai" title={[card.agent_outcome, card.agent_outcome_at ? props.timeFor(card.agent_outcome_at, props.now) : null].filter(Boolean).join(" · ")}><Sparkles size={12} aria-hidden="true" />{did}</span>
                            ) : null}
                          </span>
                        </div>
                        {ready && nextStage ? (
                          <button
                            type="button"
                            className="members-board-move"
                            disabled={movingId === card.membership_id}
                            onClick={(event) => { event.stopPropagation(); void moveCardTo(card.membership_id, nextStage.key); }}
                          >
                            Move to {nextStage.name} →
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {!phone && stages.length < MAX_JOURNEY_STAGES ? (
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
