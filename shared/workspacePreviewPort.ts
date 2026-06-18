export const WORKSPACE_PREVIEW_PORT_MIN = 3000;
export const WORKSPACE_PREVIEW_PORT_MAX = 9999;

export function normalizeWorkspacePreviewPort(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error("invalid_preview_port");
  const integer = Math.floor(parsed);
  if (
    integer < WORKSPACE_PREVIEW_PORT_MIN ||
    integer > WORKSPACE_PREVIEW_PORT_MAX
  ) {
    throw new Error("invalid_preview_port");
  }
  return integer;
}

export function formatWorkspacePreviewPortRange(): string {
  return `${WORKSPACE_PREVIEW_PORT_MIN} and ${WORKSPACE_PREVIEW_PORT_MAX}`;
}
