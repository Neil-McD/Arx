import { createHmac, randomUUID } from "node:crypto";
import { normalizeCodexBridgeBaseUrlOrigin } from "../shared/codexBridgeContract.ts";

type CodexBridgeOperatorAction =
  | "codex_bridge_echo_smoke"
  | "codex_bridge_codex_exec_smoke";

const CODEX_BRIDGE_OPERATOR_TOKEN_ISSUER = "polynet-codex-bridge-operator-v1";
const CODEX_BRIDGE_OPERATOR_TOKEN_VERSION = "v1";
const CODEX_BRIDGE_OPERATOR_TOKEN_TTL_MS = 5 * 60 * 1000;

function encodeBase64UrlText(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(secret: string, value: string): string {
  return createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildCodexBridgeSmokeRunId(prefix: string, raw: string): string {
  const provided = raw.trim();
  if (provided) return provided.slice(0, 180);
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function mintCodexBridgeOperatorToken(params: {
  secret: string;
  action: CodexBridgeOperatorAction;
  runId: string;
  projectId: string;
  threadId: string;
  baseUrl?: string | null;
}): string {
  const secret = params.secret.trim();
  if (secret.length < 32) throw new Error("operator_secret_too_short");
  const projectId = params.projectId.trim();
  const threadId = params.threadId.trim();
  if (!projectId) throw new Error("operator_project_id_required");
  if (!threadId) throw new Error("operator_thread_id_required");
  const rawBaseUrl = String(params.baseUrl ?? "").trim();
  const baseUrlOrigin = normalizeCodexBridgeBaseUrlOrigin(rawBaseUrl);
  if (rawBaseUrl && !baseUrlOrigin) throw new Error("operator_base_url_invalid");
  const issuedAt = Date.now();
  const payload = encodeBase64UrlText(
    JSON.stringify({
      issuer: CODEX_BRIDGE_OPERATOR_TOKEN_ISSUER,
      action: params.action,
      runId: params.runId,
      projectId,
      threadId,
      baseUrlOrigin,
      issuedAt,
      expiresAt: issuedAt + CODEX_BRIDGE_OPERATOR_TOKEN_TTL_MS,
      nonce: randomUUID(),
    }),
  );
  const signedPayload = `${CODEX_BRIDGE_OPERATOR_TOKEN_VERSION}.${payload}`;
  return `${signedPayload}.${sign(secret, signedPayload)}`;
}
