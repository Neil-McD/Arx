/// <reference types="vite/client" />

import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test } from "vitest";
import { convexTest } from "convex-test";

import { internal } from "./_generated/api";
import { EMAIL_TEMPLATE_KEYS, renderEmailTemplate } from "./emailCore";
import schema from "./schema";

const modules = import.meta.glob([
  "./email.ts",
  "./_generated/**/*.*s",
]);

const priorPublicAppUrl = process.env.ARX_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.ARX_PUBLIC_APP_URL = "https://polynet.test";
});

afterEach(() => {
  if (priorPublicAppUrl === undefined) delete process.env.ARX_PUBLIC_APP_URL;
  else process.env.ARX_PUBLIC_APP_URL = priorPublicAppUrl;
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("weekly member digest preserves the canonical default-dark rendered output", () => {
  const rendered = renderEmailTemplate({
    templateKey: "weekly_member_digest",
    payload: {
      communityName: "Founders Lab",
      dateLabel: "Aug 3 - Aug 9, 2026",
      intro: "12 discussions · 3 resources · 2 new members",
      ctaLabel: "View community",
      actionUrl: "https://polynet.test/c/founders-lab/chat",
      footerNote: "You can change digest emails from account settings.",
      items: [
        {
          title: "A useful discussion",
          meta: "Community chat",
          summary: "Members shared a practical answer.",
          url: "https://polynet.test/c/founders-lab/chat",
        },
        {
          title: "New operating guide",
          meta: "Resource",
          summary: "A concise guide was added.",
          url: "https://polynet.test/c/founders-lab/resources",
        },
      ],
    },
  });

  expect(rendered.subject).toBe(
    "Founders Lab weekly digest for Aug 3 - Aug 9, 2026",
  );
  expect(sha256(rendered.subject)).toBe(
    "5f03726cc04ad1b431cd0367cde1ee97e442bfb6e3c099ebf341588a3d709375",
  );
  expect(sha256(rendered.html)).toBe(
    "1cd8b7eb160dcc995a89e6ca348e08123cfacfaf439f39509b8922bf26d38184",
  );
  expect(sha256(rendered.text)).toBe(
    "2e755e8abd701aea441ce6a4084ece82a5dc8bc73260e197310a2a5aa3e1b047",
  );
  expect(rendered.html).toContain("background:#111113");
  expect(rendered.html).toContain("background:#1a1a1a");
  expect(rendered.html).toContain("background:#222222");
  expect(rendered.html).toContain("max-width:640px");
  expect(rendered.html).toContain("background:#f1ede5");
  expect(rendered.html).not.toContain("#0f1116");
  expect(rendered.html).not.toContain("#f26b9a");
  expect(EMAIL_TEMPLATE_KEYS).not.toContain("weekly_founder_digest");
});

test("weekly member digest escapes community-authored content", () => {
  const rendered = renderEmailTemplate({
    templateKey: "weekly_member_digest",
    payload: {
      communityName: "<Founders & Friends>",
      items: [
        {
          title: "<script>alert('digest')</script>",
          summary: "A & B",
          url: "https://polynet.test/?a=1&b=2",
        },
      ],
    },
  });

  expect(rendered.html).not.toContain("<script>");
  expect(rendered.html).toContain("&lt;script&gt;alert(&#39;digest&#39;)&lt;/script&gt;");
  expect(rendered.html).toContain("A &amp; B");
  expect(rendered.html).toContain("a=1&amp;b=2");
});

async function createEmailFixture(options?: { weeklyDigestEnabled?: boolean }) {
  const t = convexTest(schema, modules);
  const nowMs = 1_765_000_000_000;
  const fixture = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: `weekly-digest-user-${String(options?.weeklyDigestEnabled)}`,
      displayName: "Weekly digest user",
      handle: `weekly-digest-${options?.weeklyDigestEnabled === false ? "off" : "on"}`,
      normalizedHandle: `weekly-digest-${options?.weeklyDigestEnabled === false ? "off" : "on"}`,
      email: "weekly-digest@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: `weekly-digest-community-${options?.weeklyDigestEnabled === false ? "off" : "on"}`,
      name: "Weekly digest community",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    if (options?.weeklyDigestEnabled !== undefined) {
      await ctx.db.insert("emailPreferences", {
        userId,
        weeklyDigestEnabled: options.weeklyDigestEnabled,
        eventReminderEnabled: true,
        founderAdminEmailsEnabled: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { userId, communityId };
  });
  return { t, nowMs, ...fixture };
}

function enqueueDigest(
  fixture: Awaited<ReturnType<typeof createEmailFixture>>,
  dedupeKey: string,
) {
  return fixture.t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "weekly_member_digest",
    communityId: fixture.communityId,
    communityLifecycleGeneration: 0,
    recipientUserId: fixture.userId,
    templateKey: "weekly_member_digest",
    payload: { communityName: "Weekly digest community" },
    dedupeKey,
    nowMs: fixture.nowMs,
  });
}

test("weekly digest is enabled when the preference is absent", async () => {
  const fixture = await createEmailFixture();
  await expect(enqueueDigest(fixture, "weekly-digest-default-on")).resolves.toMatchObject({
    status: "pending",
  });
});

test("weekly digest opt-out suppresses enqueue", async () => {
  const fixture = await createEmailFixture({ weeklyDigestEnabled: false });
  await expect(enqueueDigest(fixture, "weekly-digest-disabled-at-enqueue")).resolves.toMatchObject({
    status: "suppressed",
  });
});

test("weekly digest opt-out after enqueue suppresses delivery claim", async () => {
  const fixture = await createEmailFixture();
  await expect(enqueueDigest(fixture, "weekly-digest-disabled-before-claim")).resolves.toMatchObject({
    status: "pending",
  });
  await fixture.t.run(async (ctx) => {
    await ctx.db.insert("emailPreferences", {
      userId: fixture.userId,
      weeklyDigestEnabled: false,
      eventReminderEnabled: true,
      founderAdminEmailsEnabled: true,
      createdAt: fixture.nowMs + 1,
      updatedAt: fixture.nowMs + 1,
    });
  });

  await expect(
    fixture.t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
      nowMs: fixture.nowMs + 1,
    }),
  ).resolves.toEqual([]);
  await fixture.t.run(async (ctx) => {
    const outbox = await ctx.db
      .query("emailOutbox")
      .withIndex("by_dedupeKey", (q) =>
        q.eq("dedupeKey", "weekly-digest-disabled-before-claim"),
      )
      .unique();
    expect(outbox).toMatchObject({
      status: "suppressed",
      failureReason: "email_preference_disabled",
    });
  });
});

test("weekly digest rechecks community membership before delivery", async () => {
  const fixture = await createEmailFixture();
  const memberId = await fixture.t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "weekly-digest-revoked-member",
      displayName: "Revoked member",
      handle: "weekly-digest-revoked-member",
      normalizedHandle: "weekly-digest-revoked-member",
      email: "weekly-digest-revoked-member@example.com",
      emailVerifiedAt: fixture.nowMs,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId: fixture.communityId,
      userId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
    return userId;
  });
  await fixture.t.mutation(internal.email.enqueueEmailJobInternal, {
    kind: "weekly_member_digest",
    communityId: fixture.communityId,
    communityLifecycleGeneration: 0,
    recipientUserId: memberId,
    templateKey: "weekly_member_digest",
    payload: { communityName: "Weekly digest community" },
    dedupeKey: "weekly-digest-revoked-before-claim",
    nowMs: fixture.nowMs,
  });
  await fixture.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", fixture.communityId).eq("userId", memberId),
      )
      .unique();
    await ctx.db.patch(membership!._id, {
      active: false,
      revokedAt: fixture.nowMs + 1,
      updatedAt: fixture.nowMs + 1,
    });
  });

  await expect(
    fixture.t.mutation(internal.email.claimDueEmailOutboxBatchInternal, {
      nowMs: fixture.nowMs + 1,
    }),
  ).resolves.toEqual([]);
  await fixture.t.run(async (ctx) => {
    const outbox = await ctx.db
      .query("emailOutbox")
      .withIndex("by_dedupeKey", (q) =>
        q.eq("dedupeKey", "weekly-digest-revoked-before-claim"),
      )
      .unique();
    expect(outbox).toMatchObject({
      status: "suppressed",
      failureReason: "community_membership_inactive",
    });
  });
});

test("every outbox status permanently closes a generic idempotency key", async () => {
  const fixture = await createEmailFixture();
  const statuses = ["pending", "sending", "sent", "failed", "suppressed"] as const;

  for (const status of statuses) {
    const dedupeKey = `generic-email-dedupe-${status}`;
    const first = await fixture.t.mutation(internal.email.enqueueEmailJobInternal, {
      kind: "event_reminder",
      recipientEmail: `dedupe-${status}@example.com`,
      templateKey: "event_reminder",
      payload: { eventName: "Canonical event" },
      dedupeKey,
      nowMs: fixture.nowMs,
    });
    await fixture.t.run((ctx) =>
      ctx.db.patch(first.outboxId!, {
        status,
        ...(status === "failed" || status === "suppressed"
          ? { failureReason: `test_${status}` }
          : null),
        updatedAt: fixture.nowMs + 1,
      }),
    );

    await expect(
      fixture.t.mutation(internal.email.enqueueEmailJobInternal, {
        kind: "event_reminder",
        recipientEmail: `dedupe-${status}@example.com`,
        templateKey: "event_reminder",
        payload: { eventName: "Canonical event" },
        dedupeKey,
        nowMs: fixture.nowMs + 2,
      }),
    ).resolves.toMatchObject({
      deduped: true,
      outboxId: first.outboxId,
      status,
    });
  }

  const outbox = await fixture.t.run((ctx) => ctx.db.query("emailOutbox").collect());
  expect(outbox).toHaveLength(statuses.length);
});
