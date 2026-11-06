/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { buildAccountSetupStatus, accountSetupBlocksJoining } from "../shared/accountSetup";
import { internal } from "./_generated/api";
import schema from "./schema";
import { ensureStarterProfile } from "./starterProfile";

const modules = import.meta.glob(["./starterProfile.ts", "./_generated/**/*.*s"]);
const nowMs = 1_760_000_000_000;

function user(fields: Record<string, unknown>) {
  return { authSubject: `subject-${Math.random()}`, createdAt: nowMs, updatedAt: nowMs, ...fields };
}

test("a new account gets its sign-in's name and photo and a handle from the name, unique", async () => {
  const t = convexTest(schema, modules);
  const [first, second, emailOnly] = await t.run(async (ctx) => [
    await ctx.db.insert("users", user({ displayName: "Neil McDevitt", avatarUrl: "https://lh3.googleusercontent.com/a" })),
    await ctx.db.insert("users", user({ displayName: "Neil McDevitt" })),
    await ctx.db.insert("users", user({ email: "jo.ann_lee@example.com" })),
  ]);
  await t.run(async (ctx) => {
    for (const id of [first, second, emailOnly]) await ensureStarterProfile(ctx, id, nowMs);
  });
  const rows = await t.run(async (ctx) => {
    const details = await ctx.db.query("userProfileDetails").collect();
    return Promise.all([first, second, emailOnly].map(async (id) => ({
      handle: (await ctx.db.get(id))?.handle,
      detail: details.find((row) => row.userId === id),
    })));
  });
  expect(rows.map((row) => [row.handle, row.detail?.displayName, row.detail?.avatarUrl ?? null])).toEqual([
    ["neil-mcdevitt", "Neil McDevitt", "https://lh3.googleusercontent.com/a"],
    ["neil-mcdevitt-2", "Neil McDevitt", null],
    ["jo-ann-lee", "Jo Ann Lee", null],
  ]);
});

test("a starter profile never overwrites what someone chose", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", user({ displayName: "Google Name", avatarUrl: "https://g/a", handle: "chosen", normalizedHandle: "chosen" }));
    await ctx.db.insert("userProfileDetails", { userId: id, displayName: "Chosen Name", createdAt: nowMs, updatedAt: nowMs });
    return id;
  });
  await t.run(async (ctx) => ensureStarterProfile(ctx, id, nowMs + 1));
  const after = await t.run(async (ctx) => ({
    user: await ctx.db.get(id),
    detail: (await ctx.db.query("userProfileDetails").collect())[0],
  }));
  expect([after.user?.handle, after.detail.displayName, after.detail.avatarUrl]).toEqual(["chosen", "Chosen Name", "https://g/a"]);
});

test("accounts made before starter profiles are filled by the one-time backfill", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", user({ displayName: "Old Account" }));
    await ctx.db.insert("users", user({ displayName: "Done Already", handle: "done-already", normalizedHandle: "done-already" }));
  });
  expect(await t.mutation(internal.starterProfile.backfillStarterProfilesInternal, {})).toEqual({ filled: 2, done: true });
  expect((await t.run(async (ctx) => await ctx.db.query("users").collect())).map((row) => row.handle).sort())
    .toEqual(["done-already", "old-account"]);
  expect(await t.mutation(internal.starterProfile.backfillStarterProfilesInternal, {})).toEqual({ filled: 0, done: true });
});

test("only something beyond the terms blocks joining: Join's click accepts those", () => {
  const legalOnly = buildAccountSetupStatus({ displayName: "A", handle: "abc", hasAcceptedPlatformLegal: false });
  expect([legalOnly.completed, accountSetupBlocksJoining(legalOnly)]).toEqual([false, false]);
  const noHandle = buildAccountSetupStatus({ displayName: "A", handle: null, hasAcceptedPlatformLegal: true });
  expect(accountSetupBlocksJoining(noHandle)).toBe(true);
  // A photo is optional.
  expect(buildAccountSetupStatus({ displayName: "A", handle: "abc", hasAcceptedPlatformLegal: true }).completed).toBe(true);
});
