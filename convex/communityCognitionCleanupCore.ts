export const COMMUNITY_COGNITION_CLEANUP_INSPECTION_LIMIT = 100;
export const COMMUNITY_COGNITION_CLEANUP_DEFAULT_BATCH_LIMIT = 100;
export const COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT = 100;

export const COMMUNITY_COGNITION_CLEANUP_PHASES = [
  {
    phase: "agent_run_events",
    table: "communityAgentRunEvents",
    index: "by_community_createdAt",
  },
  {
    phase: "agent_runs",
    table: "communityAgentRuns",
    index: "by_community_createdAt",
  },
  {
    phase: "metabolizer_runs",
    table: "communityMemoryMetabolizerRuns",
    index: "by_community_finishedAt",
  },
  {
    phase: "compiler_digests",
    table: "communityCompilerDigests",
    index: "by_community_createdAt",
  },
  {
    phase: "outcome_observations",
    table: "communityOutcomeObservations",
    index: "by_community_observedAt",
  },
  {
    phase: "memory_retrieval_logs",
    table: "communityIntelligenceRetrievalLogs",
    index: "by_community_createdAt",
  },
  {
    phase: "evidence_retrieval_logs",
    table: "communityEvidenceRetrievalLogs",
    index: "by_community_createdAt",
  },
  {
    phase: "change_requests",
    table: "communityIntelligenceChangeRequests",
    index: "by_community_createdAt",
  },
  {
    phase: "mutations",
    table: "communityIntelligenceMutations",
    index: "by_community_createdAt",
  },
  {
    phase: "edges",
    table: "communityIntelligenceEdges",
    index: "by_community",
  },
  {
    phase: "nodes",
    table: "communityIntelligenceNodes",
    index: "by_community",
  },
  {
    phase: "evidence_citations",
    table: "communityEvidenceCitations",
    index: "by_community_ref_capturedAt",
  },
  {
    phase: "source_traces",
    table: "communitySourceTraces",
    index: "by_community_createdAt",
  },
] as const;

export type CommunityCognitionCleanupPhase =
  (typeof COMMUNITY_COGNITION_CLEANUP_PHASES)[number]["phase"];

export const COMMUNITY_COGNITION_CLEANUP_FIRST_PHASE =
  COMMUNITY_COGNITION_CLEANUP_PHASES[0].phase;

type CleanupDb = {
  get: (id: any) => Promise<unknown>;
  query: (table: string) => {
    withIndex: (
      index: string,
      builder: (query: { eq: (field: string, value: any) => unknown }) => unknown,
    ) => {
      take: (limit: number) => Promise<Array<Record<string, any>>>;
    };
  };
  delete: (id: any) => Promise<void>;
};

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

export function boundCommunityCognitionCleanupLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return COMMUNITY_COGNITION_CLEANUP_DEFAULT_BATCH_LIMIT;
  return Math.max(
    1,
    Math.min(COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT, Math.floor(parsed)),
  );
}

export function getCommunityCognitionCleanupPhaseDefinition(
  phase: CommunityCognitionCleanupPhase,
): (typeof COMMUNITY_COGNITION_CLEANUP_PHASES)[number] {
  const definition = COMMUNITY_COGNITION_CLEANUP_PHASES.find(
    (candidate) => candidate.phase === phase,
  );
  if (!definition) {
    throw new Error("community_cognition_cleanup_phase_invalid");
  }
  return definition;
}

async function requireDeletedCommunityForCognitionCleanup(
  db: CleanupDb,
  communityId: any,
): Promise<void> {
  const community = await db.get(communityId);
  if (community) {
    throw new Error("community_cognition_cleanup_live_community_forbidden");
  }
}

async function readPhaseRows(args: {
  db: CleanupDb;
  communityId: any;
  phase: CommunityCognitionCleanupPhase;
  limit: number;
}): Promise<Array<Record<string, any>>> {
  const definition = getCommunityCognitionCleanupPhaseDefinition(args.phase);
  return await args.db
    .query(definition.table)
    .withIndex(definition.index, (query) =>
      query.eq("communityId", args.communityId),
    )
    .take(args.limit);
}

export async function inspectDeletedCommunityCognitionCore(args: {
  db: CleanupDb;
  communityId: any;
}) {
  await requireDeletedCommunityForCognitionCleanup(args.db, args.communityId);
  const phases = [];
  let totalCountLowerBound = 0;
  let hasLowerBoundCount = false;

  for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
    const rows = await readPhaseRows({
      db: args.db,
      communityId: args.communityId,
      phase: definition.phase,
      limit: COMMUNITY_COGNITION_CLEANUP_INSPECTION_LIMIT + 1,
    });
    const countLowerBound = Math.min(
      rows.length,
      COMMUNITY_COGNITION_CLEANUP_INSPECTION_LIMIT,
    );
    const countIsLowerBound =
      rows.length > COMMUNITY_COGNITION_CLEANUP_INSPECTION_LIMIT;
    totalCountLowerBound += countLowerBound;
    hasLowerBoundCount ||= countIsLowerBound;
    phases.push({
      phase: definition.phase,
      table: definition.table,
      count_lower_bound: countLowerBound,
      count_is_lower_bound: countIsLowerBound,
      empty: rows.length === 0,
    });
  }

  return {
    community_id: normalizeId(args.communityId),
    policy_version: "community_cognition_cleanup:v1" as const,
    total_count_lower_bound: totalCountLowerBound,
    total_count_is_lower_bound: hasLowerBoundCount,
    empty: phases.every((phase) => phase.empty),
    phases,
  };
}

export async function deleteDeletedCommunityCognitionBatchCore(args: {
  db: CleanupDb;
  communityId: any;
  phase: CommunityCognitionCleanupPhase;
  limit?: number;
}) {
  await requireDeletedCommunityForCognitionCleanup(args.db, args.communityId);
  const definition = getCommunityCognitionCleanupPhaseDefinition(args.phase);
  const limit = boundCommunityCognitionCleanupLimit(args.limit);
  const rows = await readPhaseRows({
    db: args.db,
    communityId: args.communityId,
    phase: args.phase,
    limit: limit + 1,
  });
  const rowsToDelete = rows.slice(0, limit);

  for (const row of rowsToDelete) {
    if (
      normalizeId(row.communityId) !== normalizeId(args.communityId) ||
      !normalizeId(row._id)
    ) {
      throw new Error("community_cognition_cleanup_row_scope_mismatch");
    }
  }
  for (const row of rowsToDelete) {
    await args.db.delete(row._id);
  }

  return {
    community_id: normalizeId(args.communityId),
    policy_version: "community_cognition_cleanup:v1" as const,
    phase: definition.phase,
    table: definition.table,
    batch_limit: limit,
    deleted_count: rowsToDelete.length,
    has_more: rows.length > limit,
  };
}

export function nextCommunityCognitionCleanupPhase(args: {
  phase: CommunityCognitionCleanupPhase;
  hasMore: boolean;
}): CommunityCognitionCleanupPhase | null {
  if (args.hasMore) return args.phase;
  const currentIndex = COMMUNITY_COGNITION_CLEANUP_PHASES.findIndex(
    (definition) => definition.phase === args.phase,
  );
  if (currentIndex < 0) {
    throw new Error("community_cognition_cleanup_phase_invalid");
  }
  return COMMUNITY_COGNITION_CLEANUP_PHASES[currentIndex + 1]?.phase ?? null;
}

export async function drainDeletedCommunityCognitionStepCore(args: {
  db: CleanupDb;
  communityId: any;
  phase: CommunityCognitionCleanupPhase;
}) {
  const batch = await deleteDeletedCommunityCognitionBatchCore({
    db: args.db,
    communityId: args.communityId,
    phase: args.phase,
    limit: COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT,
  });
  const nextPhase = nextCommunityCognitionCleanupPhase({
    phase: args.phase,
    hasMore: batch.has_more,
  });
  const finalInspection = nextPhase
    ? null
    : await inspectDeletedCommunityCognitionCore({
        db: args.db,
        communityId: args.communityId,
      });
  if (finalInspection && !finalInspection.empty) {
    throw new Error("community_cognition_cleanup_terminal_not_empty");
  }
  return {
    ...batch,
    next_phase: nextPhase,
    complete: nextPhase === null,
    final_inspection: finalInspection,
  };
}
