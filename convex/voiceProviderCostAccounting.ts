import { internal } from "./_generated/api";

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

export async function recordVoiceProviderCostBestEffort(params: {
  ctx: any;
  costKey?: string | null;
  userId?: any;
  rawVendorCostUsd?: number;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}): Promise<void> {
  const costKey = normalizeString(params.costKey);
  if (!costKey) return;
  const metadata = metadataRecord(params.metadata);
  const nowMs = params.nowMs ?? Date.now();
  const durationSeconds = Math.max(
    0,
    normalizeNumber(metadata.duration_seconds) ??
      normalizeNumber(metadata.final_duration_seconds) ??
      0,
  );
  const rawVendorCostUsd = Math.max(0, normalizeNumber(params.rawVendorCostUsd) ?? 0);
  const evidenceSource =
    normalizeString(metadata.provider_billing_evidence) ??
    normalizeString(metadata.final_cost_source);

  try {
    await params.ctx.runMutation(internal.workspaceCredits.recordProviderCostInternal as any, {
      costKey: `platform_tool:${costKey}:provider_cost`,
      userId: params.userId ?? undefined,
      category: "voice",
      component: "voice_transcription",
      provider:
        normalizeString(metadata.final_provider) ??
        normalizeString(metadata.provider) ??
        "voice_provider",
      periodStart: durationSeconds > 0 ? nowMs - durationSeconds * 1000 : nowMs,
      periodEnd: nowMs,
      quantityKind: "audio_seconds",
      quantity: durationSeconds,
      rawVendorCostUsd,
      evidence:
        evidenceSource && !evidenceSource.includes("estimated")
          ? "provider_reported"
          : "estimated",
      billingDisposition: "platform_absorbed",
      metadata: {
        ...metadata,
        provider_cost_source: "voice_provider_cost_accounting",
        provider_cost_charge_disposition: "platform_absorbed",
      },
      nowMs,
    });
  } catch (error) {
    console.warn("voice_provider_cost_record_failed", {
      cost_key: costKey,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}
