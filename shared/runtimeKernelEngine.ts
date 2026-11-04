// Which loop engine runs a surface's agent turns. Both run the same rules
// (RuntimeKernelRun); Pi only sequences them. The switch is the Convex env
// variable POLYNET_PI_ENGINE_SURFACES, a comma list of surfaces (ask, tag,
// steward) that run on Pi. Unset means every surface stays native.
import { runNativeRuntimeKernel } from "./runtimeKernel.ts";
import { runPiRuntimeKernel } from "./piRuntimeKernel.ts";

export type RuntimeKernelSurface = "ask" | "tag" | "steward";
export type RuntimeKernelEngine = "native" | "pi";

export function resolveRuntimeKernelEngine(
  surface: RuntimeKernelSurface,
  configured: string | undefined,
): RuntimeKernelEngine {
  const surfaces = String(configured ?? "").split(",").map((value) => value.trim().toLowerCase());
  return surfaces.includes(surface) ? "pi" : "native";
}

export function selectRuntimeKernel(surface: RuntimeKernelSurface): {
  engine: RuntimeKernelEngine;
  run: typeof runNativeRuntimeKernel;
} {
  const engine = resolveRuntimeKernelEngine(
    surface,
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.POLYNET_PI_ENGINE_SURFACES,
  );
  return { engine, run: engine === "pi" ? runPiRuntimeKernel : runNativeRuntimeKernel };
}
