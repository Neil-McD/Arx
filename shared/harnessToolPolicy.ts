import { type RetrievalToolName } from "./retrievalTools.ts";

export type PolynetHarnessToolPolicy = {
  harnessKind: "polynet";
  fixedRuntimeToolNames: RetrievalToolName[];
};

function uniqueRetrievalToolNames(values: readonly RetrievalToolName[]): RetrievalToolName[] {
  const seen = new Set<string>();
  const out: RetrievalToolName[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function resolvePolynetHarnessToolPolicy(params: {
  allowedToolNames: readonly RetrievalToolName[];
}): PolynetHarnessToolPolicy {
  const fixedRuntimeToolNames = uniqueRetrievalToolNames(params.allowedToolNames);
  return {
    harnessKind: "polynet",
    fixedRuntimeToolNames,
  };
}

export function buildPolynetHarnessToolPolicyReceipt(
  policy: PolynetHarnessToolPolicy,
): Record<string, unknown> {
  return {
    harness_kind: policy.harnessKind,
    fixed_runtime_tool_names: policy.fixedRuntimeToolNames,
  };
}
