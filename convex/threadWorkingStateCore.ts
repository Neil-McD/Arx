export type ThreadWorkingStateLike = {
  version?: number;
  goal?: string;
  status?: "idle" | "in_progress" | "blocked" | "needs_verification" | "complete";
  currentStep?: string;
  plan?: string[];
  completedSteps?: string[];
  decisions?: string[];
  openQuestions?: string[];
  focusFiles?: string[];
  lastResult?: string;
  verificationStatus?: "not_needed" | "needed" | "passed" | "failed";
  filesTouched?: string[];
  filesChanged: string[];
  verifiedFindings: string[];
  recentActions?: string[];
  lastDiagnostic?: string;
  openIssue?: string;
  blocker?: string;
  nextAction?: string;
  updatedAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeOptionalSummaryText(raw: unknown, maxLen = 240): string | null {
  const value = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return null;
  return value.slice(0, maxLen);
}

function normalizeWorkingStateText(raw: unknown, maxLen = 240): string | undefined {
  const value = normalizeOptionalSummaryText(raw, maxLen);
  return value ?? undefined;
}

function normalizeWorkingStateList(raw: string[], maxItems = 6, maxLen = 180): string[] {
  const out: string[] = [];
  for (const value of raw) {
    const normalized = normalizeWorkingStateText(value, maxLen);
    if (!normalized) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

const TASK_PIVOT_PATTERN =
  /^(new task|new topic|switch(ing)? to|change topic|different task|ignore that|forget that|now let's|let's move to|moving on|separate question|unrelated|actually|instead)\b/i;

const TASK_PIVOT_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "what",
  "when",
  "where",
  "into",
  "onto",
  "then",
  "than",
  "your",
  "our",
  "can",
  "you",
  "lets",
  "let",
  "now",
]);

function tokenizeTaskGoal(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TASK_PIVOT_STOP_WORDS.has(token));
}

function shouldPreserveActiveTaskLedger(args: {
  previous: ThreadWorkingStateLike | null;
  latestUserText?: string | null;
}): boolean {
  const previous = args.previous;
  if (!previous || previous.status === "complete") return false;
  const latest = normalizeWorkingStateText(args.latestUserText, 240);
  const previousGoal = normalizeWorkingStateText(previous.goal, 240);
  if (!latest || !previousGoal) return true;
  if (TASK_PIVOT_PATTERN.test(latest)) return false;
  if (latest.length < 28) return true;
  const latestLower = latest.toLowerCase();
  const previousLower = previousGoal.toLowerCase();
  if (latestLower.includes(previousLower) || previousLower.includes(latestLower)) {
    return true;
  }
  const latestTokens = tokenizeTaskGoal(latest);
  const previousTokens = new Set(tokenizeTaskGoal(previousGoal));
  if (latestTokens.length < 4 || previousTokens.size < 4) return true;
  const overlap = latestTokens.filter((token) => previousTokens.has(token)).length;
  const overlapRatio = overlap / Math.min(latestTokens.length, previousTokens.size);
  return overlapRatio >= 0.25;
}

function normalizePreviousWorkingState(raw: unknown): ThreadWorkingStateLike | null {
  const record = asRecord(raw);
  if (!record) return null;
  const filesChanged = Array.isArray(record.filesChanged)
    ? normalizeWorkingStateList(
        record.filesChanged.map((value) => String(value ?? "")),
        8,
        180,
      )
    : [];
  const filesTouched = Array.isArray(record.filesTouched)
    ? normalizeWorkingStateList(
        record.filesTouched.map((value) => String(value ?? "")),
        10,
        180,
      )
    : filesChanged;
  const verifiedFindings = Array.isArray(record.verifiedFindings)
    ? normalizeWorkingStateList(
        record.verifiedFindings.map((value) => String(value ?? "")),
        4,
        220,
      )
    : [];
  const recentActions = Array.isArray(record.recentActions)
    ? normalizeWorkingStateList(
        record.recentActions.map((value) => String(value ?? "")),
        6,
        180,
      )
    : [];
  const plan = Array.isArray(record.plan)
    ? normalizeWorkingStateList(
        record.plan.map((value) => String(value ?? "")),
        5,
        180,
      )
    : [];
  const completedSteps = Array.isArray(record.completedSteps)
    ? normalizeWorkingStateList(
        record.completedSteps.map((value) => String(value ?? "")),
        8,
        180,
      )
    : [];
  const decisions = Array.isArray(record.decisions)
    ? normalizeWorkingStateList(
        record.decisions.map((value) => String(value ?? "")),
        5,
        200,
      )
    : [];
  const openQuestions = Array.isArray(record.openQuestions)
    ? normalizeWorkingStateList(
        record.openQuestions.map((value) => String(value ?? "")),
        4,
        200,
      )
    : [];
  const focusFiles = Array.isArray(record.focusFiles)
    ? normalizeWorkingStateList(
        record.focusFiles.map((value) => String(value ?? "")),
        8,
        180,
      )
    : [];
  const statusRaw = String(record.status ?? "").trim();
  const status =
    statusRaw === "idle" ||
    statusRaw === "in_progress" ||
    statusRaw === "blocked" ||
    statusRaw === "needs_verification" ||
    statusRaw === "complete"
      ? statusRaw
      : undefined;
  const verificationStatusRaw = String(record.verificationStatus ?? "").trim();
  const verificationStatus =
    verificationStatusRaw === "not_needed" ||
    verificationStatusRaw === "needed" ||
    verificationStatusRaw === "passed" ||
    verificationStatusRaw === "failed"
      ? verificationStatusRaw
      : undefined;
  return {
    version: Number.isFinite(Number(record.version)) ? Math.max(1, Math.floor(Number(record.version))) : 1,
    goal: normalizeWorkingStateText(record.goal, 240),
    status,
    currentStep: normalizeWorkingStateText(record.currentStep, 180),
    plan,
    completedSteps,
    decisions,
    openQuestions,
    focusFiles,
    lastResult: normalizeWorkingStateText(record.lastResult, 240),
    verificationStatus,
    filesTouched,
    filesChanged,
    verifiedFindings,
    recentActions,
    lastDiagnostic: normalizeWorkingStateText(record.lastDiagnostic, 240),
    openIssue: normalizeWorkingStateText(record.openIssue, 240),
    blocker: normalizeWorkingStateText(record.blocker ?? record.openIssue, 240),
    nextAction: normalizeWorkingStateText(record.nextAction, 200),
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Math.floor(Number(record.updatedAt)) : Date.now(),
  };
}

export function compactThreadWorkingState(state: ThreadWorkingStateLike): ThreadWorkingStateLike {
  const out: Partial<ThreadWorkingStateLike> = {
    version: Number.isFinite(Number(state.version)) ? Math.floor(Number(state.version)) : undefined,
    status: state.status,
    verificationStatus: state.verificationStatus,
    plan: Array.isArray(state.plan) && state.plan.length > 0 ? state.plan : undefined,
    completedSteps: Array.isArray(state.completedSteps) && state.completedSteps.length > 0 ? state.completedSteps : undefined,
    decisions: Array.isArray(state.decisions) && state.decisions.length > 0 ? state.decisions : undefined,
    openQuestions: Array.isArray(state.openQuestions) && state.openQuestions.length > 0 ? state.openQuestions : undefined,
    focusFiles: Array.isArray(state.focusFiles) && state.focusFiles.length > 0 ? state.focusFiles : undefined,
    filesTouched: Array.isArray(state.filesTouched) ? state.filesTouched : undefined,
    filesChanged: Array.isArray(state.filesChanged) ? state.filesChanged : [],
    verifiedFindings: Array.isArray(state.verifiedFindings) ? state.verifiedFindings : [],
    recentActions: Array.isArray(state.recentActions) ? state.recentActions : undefined,
    updatedAt: Number.isFinite(Number(state.updatedAt)) ? Math.floor(Number(state.updatedAt)) : Date.now(),
  };
  for (const key of [
    "goal",
    "currentStep",
    "lastResult",
    "lastDiagnostic",
    "openIssue",
    "blocker",
    "nextAction",
  ] as const) {
    const value = normalizeWorkingStateText(state[key], key === "goal" ? 240 : 260);
    if (value) out[key] = value;
  }
  for (const key of Object.keys(out) as Array<keyof ThreadWorkingStateLike>) {
    if (out[key] === undefined || out[key] === null) {
      delete out[key];
    }
  }
  return out as ThreadWorkingStateLike;
}

export function buildRunStartedWorkingState(args: {
  previous: unknown;
  latestUserText?: string | null;
  nowMs: number;
}): ThreadWorkingStateLike {
  const previous = normalizePreviousWorkingState(args.previous);
  const goal = normalizeWorkingStateText(args.latestUserText, 240) ?? previous?.goal;
  const taskStillActive = shouldPreserveActiveTaskLedger({
    previous,
    latestUserText: args.latestUserText,
  });
  return compactThreadWorkingState({
    version: 3,
    goal,
    status: "in_progress",
    currentStep: "Run is in progress.",
    plan: taskStillActive ? previous?.plan : undefined,
    completedSteps: taskStillActive ? previous?.completedSteps : undefined,
    decisions: taskStillActive ? previous?.decisions : undefined,
    openQuestions: taskStillActive ? previous?.openQuestions : undefined,
    focusFiles: taskStillActive ? previous?.focusFiles : undefined,
    lastResult: previous?.lastResult,
    verificationStatus: "not_needed",
    filesTouched: [],
    filesChanged: [],
    verifiedFindings: [],
    lastDiagnostic: undefined,
    recentActions: normalizeWorkingStateList(
      ["Started a new workspace run.", ...(previous?.recentActions ?? [])],
      6,
      180,
    ),
    openIssue: undefined,
    blocker: undefined,
    nextAction: "Wait for the current run to finish or inspect the latest runtime events.",
    updatedAt: args.nowMs,
  });
}

export function extractThreadMessageText(contentJson: unknown): string | null {
  if (typeof contentJson === "string") {
    return normalizeOptionalSummaryText(contentJson, 400);
  }
  const record = asRecord(contentJson);
  if (!record) return null;
  const textCandidate =
    typeof record.text === "string"
      ? record.text
      : typeof record.content === "string"
        ? record.content
        : null;
  return normalizeOptionalSummaryText(textCandidate, 400);
}
