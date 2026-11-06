/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./founderBilling.ts",
  "./_generated/**/*.*s",
]);

// The $79 Builder purchase before signing in (and its recovery by email) is
// gone: the public checkout refuses and charges nobody; a founder checkout is
// always started signed in.
test("the public Builder checkout is retired: it refuses and charges nobody", async () => {
  const t = convexTest(schema, modules);
  await expect(t.action((api as any).founderBilling.startPublicBuilderCheckout, {})).rejects.toThrow(/public_builder_checkout_retired/);
  expect(await t.run((ctx) => ctx.db.query("checkoutSessions").collect())).toHaveLength(0);
});
