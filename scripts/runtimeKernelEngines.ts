// Both loop engines run the same rules (RuntimeKernelRun); every kernel test
// runs against each so the Pi engine stays at parity with the native one.
import { runNativeRuntimeKernel } from "../shared/runtimeKernel.ts";
import { runPiRuntimeKernel } from "../shared/piRuntimeKernel.ts";

export type RunRuntimeKernel = typeof runNativeRuntimeKernel;

export const RUNTIME_KERNEL_ENGINES: Array<[engine: string, runKernel: RunRuntimeKernel]> = [
  ["native", runNativeRuntimeKernel],
  ["pi", runPiRuntimeKernel],
];
