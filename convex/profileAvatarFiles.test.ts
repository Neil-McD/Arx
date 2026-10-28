/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "./_generated/**/*.*s"]);

test("pointing a profile at someone else's file and then replacing it never deletes that file", async () => {
  const t = convexTest(schema, modules);
  const banner = await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: "user_mallory", displayName: "Mallory", handle: "mallory", normalizedHandle: "mallory", createdAt: 0, updatedAt: 0,
    } as any);
    // Someone else's file: another member's photo, a banner, an attachment.
    return await ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  });
  const asMallory = t.withIdentity({ subject: "user_mallory" });
  await asMallory.mutation((api as any).profiles.upsertProfileDetail, { avatarStorageId: banner });
  await asMallory.mutation((api as any).profiles.upsertProfileDetail, { avatarStorageId: null });
  expect(await t.run(async (ctx) => await ctx.db.system.get(banner))).not.toBeNull();
});
