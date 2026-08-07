/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./authActor.ts",
  "./_generated/**/*.*s",
]);

test("an omitted auth email preserves the persisted verified identity", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const authSubject = "user_preserve_verified_email";
  await t.mutation(
    (internal as any).authActor.ensureAuthenticatedActorByExplicitSubjectInternal,
    {
      authSubject,
      email: "builder@example.com",
      emailVerified: true,
      emailVerificationSource: "oauth_provider",
      nowMs,
    },
  );

  await t.mutation(
    (internal as any).authActor.ensureAuthenticatedActorByExplicitSubjectInternal,
    { authSubject, nowMs: nowMs + 1_000 },
  );

  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", authSubject))
      .unique();
    expect(user).toMatchObject({
      email: "builder@example.com",
      normalizedEmail: "builder@example.com",
      emailVerifiedAt: nowMs,
      emailVerificationSource: "oauth_provider",
    });
  });
});
