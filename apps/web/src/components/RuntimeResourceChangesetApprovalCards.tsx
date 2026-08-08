import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  applyCloudCommunityResourceBuilderChangeset,
  getCloudCommunityResourceBuilderChangesetStatus,
  rejectCloudCommunityResourceBuilderChangeset,
} from "../../../../shared/cloudCommunityAdminGateway";
import { dispatchCommunityResourcesMutated } from "../../../../shared/communityResourceMutationEvents";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";

const CHANGESET_CARD_LIMIT = 1;

type ResourceChangesetPreviewItem = {
  id: string;
  marker: string;
  title: string;
  preview: string | null;
};

export type ResourceChangesetCardModel = {
  id: string;
  communityId: string;
  changesetId: string;
  summary: string;
  operationCount: number;
  warningCount: number;
  previewItems: ResourceChangesetPreviewItem[];
  seq: number;
};

type ResourceChangesetActionState =
  | "idle"
  | "applying"
  | "applied"
  | "rejecting"
  | "rejected"
  | "error";

type ResourceChangesetServerStatus =
  | "staged"
  | "approved"
  | "applied"
  | "rejected"
  | "failed"
  | "expired";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function asResourceChangesetServerStatus(value: unknown): ResourceChangesetServerStatus | null {
  const status = asString(value);
  return status === "staged" ||
    status === "approved" ||
    status === "applied" ||
    status === "rejected" ||
    status === "failed" ||
    status === "expired"
    ? status
    : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseToolOutputRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  return (
    parseJsonRecord(payload.output) ??
    parseJsonRecord(payload.output_preview) ??
    asRecord(payload.details)
  );
}

function findChangesetOutputRecord(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 5) return null;
  const record = typeof value === "string" ? parseJsonRecord(value) : asRecord(value);
  if (!record) return null;
  const changesetId = asString(record.changeset_id);
  const communityId = asString(record.community_id);
  if (changesetId && communityId) return record;
  for (const key of ["result", "value", "data", "details", "output", "output_preview"] as const) {
    const nested = findChangesetOutputRecord(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function normalizePreviewItems(value: unknown): ResourceChangesetPreviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((raw, index) => {
    const row = asRecord(raw);
    if (!row) return [];
    const title = asString(row.title);
    if (!title) return [];
    const marker = asString(row.marker) || "+";
    const preview = asString(row.preview);
    return [
      {
        id: `${index}:${marker}:${title}`,
        marker,
        title,
        preview: preview || null,
      },
    ];
  });
}

function extractTerminalChangesetIds(
  events: ThreadStreamingRuntimeEvent[],
): Set<string> {
  const terminal = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload || payload.success !== true) continue;
    const toolName = asString(payload.tool_name);
    if (
      toolName !== "community_resource_builder_apply_changeset" &&
      toolName !== "polynet_call"
    ) continue;
    const output = findChangesetOutputRecord(parseToolOutputRecord(payload));
    const kind = asString(output?.kind);
    if (
      kind !== "community_resource_builder_changeset_applied" &&
      kind !== "community_resource_builder_changeset_rejected"
    ) continue;
    const changesetId = asString(output?.changeset_id);
    if (changesetId) terminal.add(changesetId);
  }
  return terminal;
}

export function buildResourceChangesetCardFromPayload(
  value: unknown,
  seq = 0,
): ResourceChangesetCardModel | null {
  const output = findChangesetOutputRecord(value);
  const changesetId = asString(output?.changeset_id);
  const communityId = asString(output?.community_id);
  if (!changesetId || !communityId) return null;
  return {
    id: changesetId,
    communityId,
    changesetId,
    summary: asString(output?.summary) || "Resource changes proposed.",
    operationCount: asNumber(output?.operation_count ?? output?.preview_total_count),
    warningCount: asNumber(output?.warning_count),
    previewItems: normalizePreviewItems(output?.preview_items),
    seq,
  };
}

export function extractRuntimeResourceChangesetCards(
  events: ThreadStreamingRuntimeEvent[],
): ResourceChangesetCardModel[] {
  const terminalChangesetIds = extractTerminalChangesetIds(events);
  const cards = new Map<string, ResourceChangesetCardModel>();
  for (const event of events) {
    if (event.event_type !== "tool_call_finished") continue;
    const payload = asRecord(event.payload);
    if (!payload || payload.success !== true) continue;
    const toolName = asString(payload.tool_name);
    if (
      toolName !== "community_resource_builder_stage_changeset" &&
      toolName !== "polynet_write"
    ) continue;
    const rawOutput = parseToolOutputRecord(payload);
    const output = findChangesetOutputRecord(rawOutput);
    if (asString(output?.kind) !== "community_resource_builder_changeset_staged") {
      continue;
    }
    const card = buildResourceChangesetCardFromPayload(output, event.seq);
    if (!card || terminalChangesetIds.has(card.changesetId)) {
      continue;
    }
    cards.set(card.changesetId, card);
  }
  return [...cards.values()]
    .sort((a, b) => a.seq - b.seq)
    .slice(-CHANGESET_CARD_LIMIT);
}

function ResourceChangesetApprovalCard(props: {
  card: ResourceChangesetCardModel;
  session: AuthSessionLike;
}): JSX.Element {
  const [actionState, setActionState] = useState<ResourceChangesetActionState>("idle");
  const [serverStatus, setServerStatus] = useState<ResourceChangesetServerStatus | null>(null);
  const [verifiedApply, setVerifiedApply] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isBusy = actionState === "applying" || actionState === "rejecting";
  const isDone =
    actionState === "applied" ||
    actionState === "rejected" ||
    serverStatus === "applied" ||
    serverStatus === "rejected" ||
    serverStatus === "failed" ||
    serverStatus === "expired";

  useEffect(() => {
    if (!props.session) return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getCloudCommunityResourceBuilderChangesetStatus<unknown, Record<string, unknown>>({
          session: props.session,
          communityId: props.card.communityId,
          changesetId: props.card.changesetId,
        });
        if (cancelled) return;
        const status = asResourceChangesetServerStatus(payload?.status);
        if (status) {
          setServerStatus(status);
          if (status === "applied") {
            setActionState("applied");
            setVerifiedApply(true);
          }
          if (status === "rejected") setActionState("rejected");
          if (status === "failed") {
            setActionState("error");
            setErrorMessage("This proposed changeset failed.");
          }
          if (status === "expired") {
            setActionState("error");
            setErrorMessage("This proposed changeset expired.");
          }
        }
      } catch {
        if (!cancelled) setServerStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.card.changesetId, props.card.communityId, props.session]);

  async function readAuthoritativeStatus(): Promise<ResourceChangesetServerStatus> {
    const payload = await getCloudCommunityResourceBuilderChangesetStatus<
      unknown,
      Record<string, unknown>
    >({
      session: props.session,
      communityId: props.card.communityId,
      changesetId: props.card.changesetId,
    });
    const status = asResourceChangesetServerStatus(payload?.status);
    if (!status) {
      throw new Error("Could not verify the resource proposal state.");
    }
    setServerStatus(status);
    return status;
  }

  async function applyChangeset(): Promise<void> {
    if (!props.session || isBusy || isDone) return;
    setActionState("applying");
    setVerifiedApply(false);
    setErrorMessage(null);
    try {
      await applyCloudCommunityResourceBuilderChangeset({
        session: props.session,
        communityId: props.card.communityId,
        changesetId: props.card.changesetId,
      });
      const status = await readAuthoritativeStatus();
      if (status !== "applied") {
        setActionState("error");
        setErrorMessage(
          status === "expired"
            ? "This proposed changeset expired."
            : `The server reports this proposal as ${status}, not applied.`,
        );
        return;
      }
      setVerifiedApply(true);
      setActionState("applied");
      dispatchCommunityResourcesMutated({
        communityId: props.card.communityId,
        changesetId: props.card.changesetId,
        source: "resource_changeset_approval_card",
      });
    } catch (error) {
      setActionState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not apply changes.");
    }
  }

  async function rejectChangeset(): Promise<void> {
    if (!props.session || isBusy || isDone) return;
    setActionState("rejecting");
    setVerifiedApply(false);
    setErrorMessage(null);
    try {
      await rejectCloudCommunityResourceBuilderChangeset({
        session: props.session,
        communityId: props.card.communityId,
        changesetId: props.card.changesetId,
        reason: "Rejected from resource changeset approval card.",
      });
      const status = await readAuthoritativeStatus();
      if (status !== "rejected") {
        setActionState("error");
        setErrorMessage(
          status === "expired"
            ? "This proposed changeset expired."
            : `The server reports this proposal as ${status}, not rejected.`,
        );
        return;
      }
      setActionState("rejected");
    } catch (error) {
      setActionState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not reject changes.");
    }
  }

  const metaParts = [
    `${props.card.operationCount || props.card.previewItems.length} changes`,
    props.card.warningCount > 0 ? `${props.card.warningCount} warnings` : null,
  ].filter(Boolean);

  return (
    <section className="resource-changeset-card" aria-label="Resource changes proposed">
      <div className="resource-changeset-card-header">
        <div className="resource-changeset-card-title-block">
          <div className="resource-changeset-card-title">Resource changes proposed</div>
          <div className="resource-changeset-card-summary">{props.card.summary}</div>
        </div>
        <div className="resource-changeset-card-actions">
          <button
            type="button"
            className="resource-changeset-icon-action approve"
            aria-label="Apply resource changes"
            title="Apply"
            disabled={isBusy || isDone}
            onClick={() => {
              void applyChangeset();
            }}
          >
            <Check size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="resource-changeset-icon-action reject"
            aria-label="Reject resource changes"
            title="Reject"
            disabled={isBusy || isDone}
            onClick={() => {
              void rejectChangeset();
            }}
          >
            <X size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
      {props.card.previewItems.length > 0 ? (
        <div className="resource-changeset-preview-list">
          {props.card.previewItems.map((item) => (
            <div key={item.id} className="resource-changeset-preview-row">
              <span className="resource-changeset-preview-marker">{item.marker}</span>
              <span className="resource-changeset-preview-copy">
                <span className="resource-changeset-preview-title">{item.title}</span>
                {item.preview ? (
                  <span className="resource-changeset-preview-text">{item.preview}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="resource-changeset-card-meta">
        {actionState === "applying" ? "Applying..." : null}
        {actionState === "rejecting" ? "Rejecting..." : null}
        {actionState === "applied" ? (verifiedApply ? "Applied / Verified" : "Applied") : null}
        {actionState === "rejected" ? "Rejected" : null}
        {actionState === "idle" || actionState === "error" ? metaParts.join(" / ") : null}
      </div>
      {errorMessage ? (
        <div className="resource-changeset-card-error" role="alert">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}

export function RuntimeResourceChangesetApprovalCards(props: {
  cards: ResourceChangesetCardModel[];
  session: AuthSessionLike | null;
}): JSX.Element | null {
  if (!props.session || props.cards.length === 0) return null;
  return (
    <div className="resource-changeset-card-stack">
      {props.cards.map((card) => (
        <ResourceChangesetApprovalCard
          key={card.id}
          card={card}
          session={props.session}
        />
      ))}
    </div>
  );
}
