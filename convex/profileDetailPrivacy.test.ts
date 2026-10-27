/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "./_generated/**/*.*s"]);

test("a profile's time zone and onboarding state are visible to its owner only", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "user_owner", displayName: "Owner", handle: "owner", normalizedHandle: "owner", createdAt: 0, updatedAt: 0,
    } as any);
    await ctx.db.insert("userProfileDetails", { userId, displayName: "Owner", bio: "Runs at dawn", timezone: "America/New_York", onboardingCompletedAt: 1, createdAt: 0, updatedAt: 0 } as any);
  });
  const read = (viewer?: string) => (viewer ? t.withIdentity({ subject: viewer }) : t)
    .query((api as any).profiles.getProfileDetailByUserId, { userId: "user_owner" });
  const stranger = await read();
  expect(stranger).toMatchObject({ bio: "Runs at dawn", timezone: null, onboarding_completed_at: null });
  expect(await read("user_someone_else")).toMatchObject({ timezone: null });
  expect(await read("user_owner")).toMatchObject({ timezone: "America/New_York", onboarding_completed_at: expect.any(String) });
});
