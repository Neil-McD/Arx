// Test members are stand-in accounts an owner (or admin) creates to go through
// their own community as a new member. The owner stays signed in as themselves;
// a browser tab in a test run sends the test member's subject instead of the
// owner's, and the server accepts it only for the manager who made it, while it
// is running. Kept free of community imports: auth identity resolution uses it.

export const TEST_MEMBER_SUBJECT_PREFIX = "polynet-test:";

export function isTestMemberAuthSubject(raw: unknown): boolean {
  return typeof raw === "string" && raw.startsWith(TEST_MEMBER_SUBJECT_PREFIX);
}

export type TestMemberRow = {
  _id: any;
  communityId: any;
  userId: any;
  authSubject: string;
  ownerUserId: any;
  ownerAuthSubject: string;
  label: string;
  number: number;
  startMilestoneKey?: string;
  autoplayUntil?: number;
  autoplayDone?: string[];
  autoplayLast?: { at: number; text: string; path?: string; target?: string };
  autoplayPending?: { id: string; plan: any; pace: number; issuedAt: number; seenAt?: number; reportedAt?: number; reportOk?: boolean; reportDetail?: string };
  createdAt: number;
  endedAt?: number;
};

export async function findTestMemberBySubject(ctx: any, authSubject: string): Promise<TestMemberRow | null> {
  return (await ctx.db.query("communityTestMembers")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject)).first()) as TestMemberRow | null;
}

/** The running test member for this user, if the user is one. */
export async function findTestMemberByUserId(ctx: any, userId: any): Promise<TestMemberRow | null> {
  if (!ctx?.db || !userId) return null;
  return (await ctx.db.query("communityTestMembers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId)).first()) as TestMemberRow | null;
}

async function managerStillManages(ctx: any, row: TestMemberRow): Promise<boolean> {
  const community = await ctx.db.get(row.communityId);
  if (!community) return false;
  if (String(community.ownerId) === String(row.ownerUserId)) return true;
  const membership = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", row.communityId).eq("userId", row.ownerUserId))
    .first();
  return Boolean(membership && membership.active !== false && membership.role === "admin");
}

/**
 * Accepts a test member's subject from the manager who created it. Anything
 * else (another person, an ended run, a function without database access such
 * as an action) is refused, so a test tab can only do what a query or mutation
 * checks for that member.
 */
export async function resolveTestMemberStandIn(ctx: any, verifiedSubject: string, testSubject: string): Promise<TestMemberRow> {
  if (!ctx?.db?.query) throw new Error("test_member_unavailable_here");
  const row = await findTestMemberBySubject(ctx, testSubject);
  if (!row || row.endedAt !== undefined) throw new Error("test_member_ended");
  if (row.ownerAuthSubject !== verifiedSubject) throw new Error("auth_subject_mismatch");
  if (!(await managerStillManages(ctx, row))) throw new Error("test_member_ended");
  return row;
}

/** A test member may only act in the community it was made for. */
export async function requireNotTestMemberOutsideCommunity(ctx: any, userId: any, communityId?: any): Promise<void> {
  const row = await findTestMemberByUserId(ctx, userId);
  if (!row) return;
  if (communityId === undefined || String(row.communityId) !== String(communityId)) {
    throw new Error("test_member_outside_community");
  }
}

/** A test member Autoplay is driving right now: agent messages a Workflow sends are previewed, not sent. */
export async function testMemberAutoplayIsOn(ctx: any, userId: any, nowMs = Date.now()): Promise<boolean> {
  const row = await findTestMemberByUserId(ctx, userId);
  return !!row && row.endedAt === undefined && (row.autoplayUntil ?? 0) > nowMs;
}

/**
 * While Autoplay plays, agent steps are previewed, not sent, so a test run
 * doesn't spend the community's AI credits.
 */
export async function testMemberAutoplayPreviewsAgent(ctx: any, userId: any, nowMs = Date.now()): Promise<boolean> {
  return await testMemberAutoplayIsOn(ctx, userId, nowMs);
}
