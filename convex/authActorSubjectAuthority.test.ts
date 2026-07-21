/// <reference types="vite/client" />

import { readFileSync } from "node:fs";

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import { ensureAuthenticatedActor } from "./authActor";
import schema from "./schema";

const modules = import.meta.glob(["./authActor.ts", "./_generated/**/*.*s"]);

async function provision(
  t: ReturnType<typeof convexTest>,
  args: {
    authSubject: string;
    email?: string;
    emailVerified?: boolean;
    emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code";
    displayName?: string;
    avatarUrl?: string;
    nowMs?: number;
  },
) {
  return await t.mutation(
    internal.authActor.ensureAuthenticatedActorByExplicitSubjectInternal,
    args,
  );
}

test("subject-authoritative provisioning is idempotent and only patches mutable profile data", async () => {
  const t = convexTest(schema, modules);
  const authSubject = "workos:user_subject_authority";

  const first = await provision(t, {
    authSubject,
    email: " First.User@Example.com ",
    emailVerified: true,
    emailVerificationSource: "oauth_provider",
    displayName: "First name",
    nowMs: 1_750_000_000_000,
  });
  const second = await provision(t, {
    authSubject,
    email: "second.user@example.com",
    emailVerified: true,
    emailVerificationSource: "magic_link",
    displayName: "Second name",
    avatarUrl: "https://example.com/avatar.png",
    nowMs: 1_750_000_000_100,
  });
  const third = await provision(t, {
    authSubject,
    displayName: "Profile-only update",
    nowMs: 1_750_000_000_200,
  });

  expect(String(second.dbUserId)).toBe(String(first.dbUserId));
  expect(String(third.dbUserId)).toBe(String(first.dbUserId));
  const state = await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    entitlements: await ctx.db.query("userEntitlements").collect(),
  }));
  expect(state.users).toHaveLength(1);
  expect(state.entitlements).toHaveLength(0);
  expect(state.users[0]).toMatchObject({
    authSubject,
    email: "second.user@example.com",
    normalizedEmail: "second.user@example.com",
    emailVerificationSource: "magic_link",
    displayName: "Profile-only update",
    avatarUrl: "https://example.com/avatar.png",
    updatedAt: 1_750_000_000_200,
  });
});

test("verified email equality never selects or relinks an account", async () => {
  const t = convexTest(schema, modules);
  const email = "shared@example.com";
  const firstSubject = "workos:first_subject";
  const secondSubject = "workos:second_subject";

  const first = await provision(t, {
    authSubject: firstSubject,
    email,
    emailVerified: true,
    emailVerificationSource: "oauth_provider",
    nowMs: 1_750_000_000_000,
  });
  const second = await provision(t, {
    authSubject: secondSubject,
    email,
    emailVerified: true,
    emailVerificationSource: "oauth_provider",
    nowMs: 1_750_000_000_100,
  });

  expect(String(second.dbUserId)).not.toBe(String(first.dbUserId));
  const state = await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    entitlements: await ctx.db.query("userEntitlements").collect(),
  }));
  expect(state.users.map((row) => row.authSubject).sort()).toEqual([
    firstSubject,
    secondSubject,
  ]);
  expect(state.entitlements).toHaveLength(0);
});

test("a requested user mismatch fails closed without creating or mutating an actor", async () => {
  const t = convexTest(schema, modules);
  const existingSubject = "workos:existing_subject";
  const requestedSubject = "workos:requested_subject";
  const existing = await provision(t, {
    authSubject: existingSubject,
    email: "existing@example.com",
    nowMs: 1_750_000_000_000,
  });

  const asRequestedSubject = t.withIdentity({ subject: requestedSubject });
  await expect(
    asRequestedSubject.mutation(async (ctx) => {
      return await ensureAuthenticatedActor({
        ctx,
        authSubject: requestedSubject,
        userId: existing.dbUserId,
        email: "existing@example.com",
        emailVerified: true,
        emailVerificationSource: "oauth_provider",
        nowMs: 1_750_000_000_100,
      });
    }),
  ).rejects.toThrow("user_id_mismatch");

  const state = await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    entitlements: await ctx.db.query("userEntitlements").collect(),
  }));
  expect(state.users).toHaveLength(1);
  expect(state.users[0]).toMatchObject({
    authSubject: existingSubject,
    email: "existing@example.com",
    updatedAt: 1_750_000_000_000,
  });
  expect(state.entitlements).toHaveLength(0);
});

test("actor provisioning has one indexed subject authority and no relink compatibility surface", () => {
  const actorSource = readFileSync(new URL("./authActor.ts", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
  const schemaSource = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  const clientSource = readFileSync(
    new URL("../shared/convexAuthenticatedClient.ts", import.meta.url),
    "utf8",
  );
  const usersSchema = schemaSource.match(/users: defineTable\([\s\S]*?\n\s*authSessions:/)?.[0] ?? "";

  expect(actorSource).toContain('.withIndex("by_authSubject"');
  expect(actorSource).not.toMatch(/query\("users"\)\s*\.collect\(/);
  expect(actorSource).not.toContain("by_normalizedEmail");
  expect(actorSource).not.toContain("ARX_AUTH_ENABLE_EMAIL_RELINK");
  expect(actorSource.toLowerCase()).not.toContain("relink");
  expect(authSource).not.toContain("continuity");
  expect(clientSource).not.toContain("continuity");
  expect(usersSchema).not.toContain('.index("by_email"');
  expect(usersSchema).not.toContain('.index("by_normalizedEmail"');
  expect(schemaSource).toMatch(
    /operatorRoles: defineTable\([\s\S]*?\.index\("by_normalizedEmail", \["normalizedEmail"\]\)/,
  );
});
