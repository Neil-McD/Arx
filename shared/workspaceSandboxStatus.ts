export type WorkspaceSandboxStatus = "ready" | "provisioning" | "stopped" | "paused" | "error";

export type WorkspaceSandboxStatusBadge = {
  label: string;
  tone: "running" | "starting" | "stopped" | "error";
};

export function normalizeWorkspaceSandboxStatus(value: unknown): WorkspaceSandboxStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "ready" ||
    normalized === "provisioning" ||
    normalized === "stopped" ||
    normalized === "paused" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return null;
}

export function workspaceSandboxStatusBadge(
  rawStatus: string | null | undefined,
): WorkspaceSandboxStatusBadge | null {
  const status = String(rawStatus ?? "").trim().toLowerCase();
  if (status === "ready") return { label: "Running", tone: "running" };
  if (status === "provisioning") return { label: "Starting", tone: "starting" };
  if (status === "stopped" || status === "paused") return { label: "Stopped", tone: "stopped" };
  if (status === "error") return { label: "Error", tone: "error" };
  return null;
}
