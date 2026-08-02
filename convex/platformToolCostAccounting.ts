import { internal } from "./_generated/api";

type ProviderCostCategory = "workspace" | "web" | "voice";
type ProviderCostComponent =
  | "blaxel_active_runtime"
  | "daytona_codex_runtime_active"
  | "web_research_call"
  | "web_crawl_provider_call"
  | "voice_transcription";

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function classifyProviderCost(costKey: string, metadata: Record<string, unknown>): {
  category: ProviderCostCategory;
  component: ProviderCostComponent;
  provider: string;
  quantityKind: string;
  quantity: number;
  resourceId: string | null;
  durationSeconds: number;
} {
  const provider =
    normalizeString(metadata.final_provider) ??
    normalizeString(metadata.provider) ??
    (costKey.startsWith("voice_") ? "voice_provider" : "unknown");
  const durationSeconds = Math.max(
    0,
    normalizeNumber(metadata.duration_seconds) ??
      normalizeNumber(metadata.final_duration_seconds) ??
      0,
  );
  const resourceId =
    normalizeString(metadata.provider_sandbox_id) ??
    normalizeString(metadata.sandbox_id) ??
    normalizeString(metadata.worker_machine_id) ??
    normalizeString(metadata.target_id);

  if (provider === "daytona" || costKey.startsWith("workspace_compute:daytona:")) {
    return {
      category: "workspace",
      component: "daytona_codex_runtime_active",
      provider: "daytona",
      quantityKind: "runtime_seconds",
      quantity: durationSeconds,
      resourceId,
      durationSeconds,
    };
  }
  if (provider === "blaxel" || costKey.startsWith("workspace_")) {
    const memoryGiB = Math.max(0, normalizeNumber(metadata.sandbox_memory_gib) ?? 0);
    return {
      category: "workspace",
      component: "blaxel_active_runtime",
      provider: "blaxel",
      quantityKind: "memory_gib_seconds",
      quantity: durationSeconds * memoryGiB,
      resourceId,
      durationSeconds,
    };
  }
  if (costKey.startsWith("voice_")) {
    return {
      category: "voice",
      component: "voice_transcription",
      provider,
      quantityKind: "audio_seconds",
      quantity: durationSeconds,
      resourceId,
      durationSeconds,
    };
  }
  return {
    category: "web",
    component: costKey.startsWith("crawl_")
      ? "web_crawl_provider_call"
      : "web_research_call",
    provider,
    quantityKind: "call",
    quantity: 1,
    resourceId,
    durationSeconds: 0,
  };
}

export async function recordPlatformToolCostBestEffort(params: {
  ctx: any;
  costKey?: string | null;
  userId?: any;
  projectId?: any;
  communityId?: any;
  runId?: string | null;
  rawVendorCostUsd?: number;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}): Promise<void> {
  const costKey = normalizeString(params.costKey);
  if (!costKey) return;
  const metadata = metadataRecord(params.metadata);
  const classification = classifyProviderCost(costKey, metadata);
  const nowMs = params.nowMs ?? Date.now();
  const rawVendorCostUsd = Math.max(0, normalizeNumber(params.rawVendorCostUsd) ?? 0);
  const evidenceSource =
    normalizeString(metadata.provider_billing_evidence) ??
    normalizeString(metadata.final_cost_source);
  const evidence = evidenceSource && !evidenceSource.includes("estimated")
    ? "provider_reported" as const
    : "estimated" as const;

  try {
    await params.ctx.runMutation(internal.workspaceCredits.recordProviderCostInternal as any, {
      costKey: `platform_tool:${costKey}:provider_cost`,
      userId: params.userId ?? undefined,
      projectId: params.projectId ?? undefined,
      communityId: params.communityId ?? undefined,
      runId: normalizeString(params.runId) ?? undefined,
      category: classification.category,
      component: classification.component,
      provider: classification.provider,
      resourceId: classification.resourceId ?? undefined,
      periodStart: classification.durationSeconds > 0
        ? nowMs - classification.durationSeconds * 1000
        : nowMs,
      periodEnd: nowMs,
      quantityKind: classification.quantityKind,
      quantity: classification.quantity,
      rawVendorCostUsd,
      evidence,
      billingDisposition: "platform_absorbed",
      metadata: {
        ...metadata,
        provider_cost_source: "platform_tool_cost_accounting",
        provider_cost_charge_disposition: "platform_absorbed",
      },
      nowMs,
    });
  } catch (error) {
    console.warn("platform_tool_cost_record_failed", {
      cost_key: costKey,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}
