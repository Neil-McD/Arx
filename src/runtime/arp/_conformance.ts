import type { RuntimeClient } from "./client";
import { TauriRuntimeClient } from "./tauriClient";

type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

// Compile-time guard: adapter must implement the contract.
export type _TauriRuntimeClientImplementsRuntimeClient = Assert<
  Extends<TauriRuntimeClient, RuntimeClient>
>;

