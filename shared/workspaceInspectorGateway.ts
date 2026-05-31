import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  normalizePaidUsageBillingMode,
  type PaidUsageBillingMode,
} from "./paidUsageBilling";

export type WorkspaceInspectorEntryType = "directory" | "file";

export type WorkspaceInspectorDirectoryEntry = {
  name: string;
  path: string;
  type: WorkspaceInspectorEntryType;
  extension: string | null;
  heavy: boolean;
  previewable: boolean;
};

export type WorkspaceInspectorDirectoryResult =
  | {
      ok: true;
      providerId: "blaxel" | null;
      status: "active";
      path: string;
      entries: WorkspaceInspectorDirectoryEntry[];
      truncated: boolean;
    }
  | WorkspaceInspectorFailure;

export type WorkspaceInspectorFilePreview =
  | {
      ok: true;
      path: string;
      name: string;
      type: "file";
      previewKind: "text";
      sizeBytes: number | null;
      text: string;
      truncated: boolean;
    }
  | {
      ok: true;
      path: string;
      name: string;
      type: "file";
      previewKind: "image";
      mimeType: string;
      sizeBytes: number | null;
      dataUrl: string;
    }
  | {
      ok: true;
      path: string;
      name: string;
      type: "directory";
      previewKind: "directory";
    }
  | {
      ok: true;
      path: string;
      name: string;
      type: "file" | "other";
      previewKind: "unsupported";
      sizeBytes?: number | null;
      mimeType?: string | null;
      reason: string;
    }
  | WorkspaceInspectorFailure;

export type WorkspaceInspectorFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  paidUsageBillingMode: PaidUsageBillingMode | null;
  retryAfterMs?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeFailure(value: unknown, fallback = "Workspace inspector unavailable."): WorkspaceInspectorFailure {
  const row = isRecord(value) ? value : {};
  const details = isRecord(row.details) ? row.details : {};
  const rawRetryAfterMs = details.retryAfterMs ?? details.retry_after_ms ?? row.retryAfterMs;
  const retryAfterMs = Number(rawRetryAfterMs);
  return {
    ok: false,
    status: Number.isFinite(Number(row.status)) ? Number(row.status) : 503,
    code: String(row.code ?? "workspace_inspector_unavailable"),
    message: String(row.message ?? fallback),
    paidUsageBillingMode: normalizePaidUsageBillingMode(
      details.paid_usage_billing_mode ?? details.paidUsageBillingMode ?? row.paid_usage_billing_mode,
    ),
    retryAfterMs:
      Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.min(30_000, Math.max(250, Math.floor(retryAfterMs)))
        : null,
  };
}

function normalizeDirectoryEntry(value: unknown): WorkspaceInspectorDirectoryEntry | null {
  if (!isRecord(value)) return null;
  const name = String(value.name ?? "").trim();
  const path = String(value.path ?? "").trim();
  const typeRaw = String(value.type ?? "").trim();
  if (!name || !path || (typeRaw !== "directory" && typeRaw !== "file")) return null;
  return {
    name,
    path,
    type: typeRaw,
    extension: typeof value.extension === "string" && value.extension.trim() ? value.extension.trim() : null,
    heavy: value.heavy === true,
    previewable: value.previewable === true,
  };
}

export async function listWorkspaceDirectoryCanonical(params: {
  session: AuthSessionLike;
  projectId: string;
  path?: string | null;
}): Promise<WorkspaceInspectorDirectoryResult> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("workspaceInspector:listWorkspaceDirectory" as any, {
    authSubject,
    projectId: params.projectId,
    path: params.path ?? ".",
  });
  if (!isRecord(payload) || payload.ok !== true) return normalizeFailure(payload);
  return {
    ok: true,
    providerId:
      payload.providerId === "blaxel"
        ? payload.providerId
        : null,
    status: "active",
    path: String(payload.path ?? ".").trim() || ".",
    entries: Array.isArray(payload.entries)
      ? payload.entries.flatMap((entry) => {
          const normalized = normalizeDirectoryEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    truncated: payload.truncated === true,
  };
}

export async function readWorkspaceFilePreviewCanonical(params: {
  session: AuthSessionLike;
  projectId: string;
  path: string;
}): Promise<WorkspaceInspectorFilePreview> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("workspaceInspector:readWorkspaceFilePreview" as any, {
    authSubject,
    projectId: params.projectId,
    path: params.path,
  });
  if (!isRecord(payload) || payload.ok !== true) return normalizeFailure(payload);
  const previewKind = String(payload.previewKind ?? "").trim();
  const type = String(payload.type ?? "").trim();
  const base = {
    ok: true as const,
    path: String(payload.path ?? params.path).trim() || params.path,
    name: String(payload.name ?? params.path).trim() || params.path,
  };
  if (previewKind === "text" && type === "file") {
    return {
      ...base,
      type: "file",
      previewKind: "text",
      sizeBytes: Number.isFinite(Number(payload.sizeBytes)) ? Number(payload.sizeBytes) : null,
      text: String(payload.text ?? ""),
      truncated: payload.truncated === true,
    };
  }
  if (previewKind === "image" && type === "file") {
    return {
      ...base,
      type: "file",
      previewKind: "image",
      mimeType: String(payload.mimeType ?? "application/octet-stream"),
      sizeBytes: Number.isFinite(Number(payload.sizeBytes)) ? Number(payload.sizeBytes) : null,
      dataUrl: String(payload.dataUrl ?? ""),
    };
  }
  if (previewKind === "directory" && type === "directory") {
    return {
      ...base,
      type: "directory",
      previewKind: "directory",
    };
  }
  return {
    ...base,
    type: type === "other" ? "other" : "file",
    previewKind: "unsupported",
    sizeBytes: Number.isFinite(Number(payload.sizeBytes)) ? Number(payload.sizeBytes) : null,
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : null,
    reason: String(payload.reason ?? "This file cannot be previewed."),
  };
}
