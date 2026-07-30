import {
  getPolynetCanonicalToolDefinition,
  getPolynetCanonicalToolDefinitions,
  type PolynetCanonicalToolAnnotations,
  type PolynetCanonicalToolName,
} from "./polynetCanonicalToolContract.ts";
import type { PlatformOperationJsonSchema } from "./platformOperationContract.ts";

export type PolynetMcpToolName = PolynetCanonicalToolName;

export type PolynetMcpToolDefinition = {
  name: PolynetMcpToolName;
  title: string;
  description: string;
  inputSchema: PlatformOperationJsonSchema;
  outputSchema: PlatformOperationJsonSchema;
  annotations: PolynetCanonicalToolAnnotations;
};

export const POLYNET_MCP_PROTOCOL_VERSION = "2025-11-25";
export const POLYNET_MCP_CODEX_PROTOCOL_VERSION = "2025-06-18";
export const POLYNET_MCP_COMPAT_PROTOCOL_VERSION = "2025-03-26";
export const POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  POLYNET_MCP_PROTOCOL_VERSION,
  POLYNET_MCP_CODEX_PROTOCOL_VERSION,
  POLYNET_MCP_COMPAT_PROTOCOL_VERSION,
] as const;

export function isSupportedPolynetMcpProtocolVersion(
  version: string,
): boolean {
  return POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(
    version as (typeof POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS)[number],
  );
}

export function getPolynetMcpToolDefinitions(): PolynetMcpToolDefinition[] {
  return getPolynetCanonicalToolDefinitions();
}

export function getPolynetMcpToolDefinition(
  name: string,
): PolynetMcpToolDefinition | null {
  return getPolynetCanonicalToolDefinition(name);
}
