/// <reference types="vite/client" />
// The member lens reads the same community through both doors: a person's own
// AI (the MCP) and the guide in a private talk. One difference is meant: the
// guide's notes are the guide's, so only the guide reads them.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { ensureGeneralChannel } from "./communityChannelCore";
import schema from "./schema";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob("./**/*.*s");

async function world() {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = async (handle: string) => {
      const userId = await ctx.db.insert("users", { authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", { userId, documentKey: document.key, documentVersion: document.version, acceptedAt: nowMs, source: "test", createdAt: nowMs });
      }
      await ctx.db.insert("userProfileDetails", { userId, displayName: handle, bio: `${handle} runs hills.`, createdAt: nowMs, updatedAt: nowMs } as any);
      return userId;
    };
    const owner = await user("owner");
    const member = await user("member");
    const other = await user("other");
    const communityId = await ctx.db.insert("communities", { ownerId: owner, slug: "run-club", name: "Run club", oneLiner: "We run.", about: "A club for runners.",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: nowMs, updatedAt: nowMs } as any);
    await ensureGeneralChannel({ ctx, communityId, nowMs });
    for (const userId of [member, other]) {
      await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "free_grant", state: "active",
        activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
    }
    const general: any = await ctx.db.query("communityChannels").withIndex("by_community_systemRole", (q: any) => q.eq("communityId", communityId).eq("systemRole", "general")).first();
    await ctx.db.insert("communityInteractionRoots", { communityId, channelId: general._id, actorType: "human", actorUserId: other, kind: "discussion", status: "live",
      visibilityScope: "community", contentSummary: "Who is in for Saturday?", replyCount: 0, reactionSummary: [], idempotencyKey: "p1", createdAt: nowMs, updatedAt: nowMs } as any);
    await ctx.db.insert("communityEvents", { communityId, createdByUserId: owner, title: "Saturday long run", startsAt: nowMs + 86_400_000, timezone: "UTC",
      locationType: "physical", locationLabel: "Boathouse", visibility: "members", status: "live", createdAt: nowMs, updatedAt: nowMs } as any);
    const course = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: owner, status: "live", name: "Start here", sortOrder: 1, createdAt: nowMs, updatedAt: nowMs });
    await ctx.db.insert("communityResources", { communityId, createdByUserId: owner, moduleId: course, type: "post", role: "page", status: "draft",
      title: "Your first week", bodyMd: "Run three times, easy.", pinned: false, sortOrder: 1, createdAt: nowMs, updatedAt: nowMs });
    const draft = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: owner, status: "draft", name: "Not ready", sortOrder: 2, createdAt: nowMs, updatedAt: nowMs });
    await ctx.db.insert("communityResources", { communityId, createdByUserId: owner, moduleId: draft, type: "post", role: "page", status: "draft",
      title: "Secret", bodyMd: "DRAFT ONLY", pinned: false, sortOrder: 1, createdAt: nowMs, updatedAt: nowMs });
    return { owner, member, other, communityId };
  });
  const door = (who: "member" | "owner", principalKind: "external_mcp" | "community_agent_for_member") => (toolName: any, input: Record<string, unknown>) => {
    const as = t.withIdentity({ subject: `${who}-subject` });
    return executePolynetCanonicalTool({
      ctx: { runQuery: (r: any, a: any) => as.query(r, a), runMutation: (r: any, a: any) => as.mutation(r, a), runAction: (r: any, a: any) => as.action(r, a) } as any,
      authSubject: `${who}-subject`, userId: (ids as any)[who], principalKind,
      evidenceSurface: principalKind === "external_mcp" ? "external_mcp" : "member_agent_dock", toolName, input,
    } as any);
  };
  return { t, ids, door };
}

const ROOT = "/communities/run-club/";
const DOORS = ["external_mcp", "community_agent_for_member"] as const;
// Everything a member reads about the community.
const READS = ["community.md", "rules.md", "brief.md", "presence.json", "channels/", "channels/general/", "members/", "members/me/", "members/me/context.md",
  "members/other.json", "members/owner.json", "members/other/timeline.md", "events/", "resources/", "pods/", "capabilities/"];
// What a member's lens never opens.
const CLOSED = ["builder/"];

const toolFor = (path: string) => (path.endsWith("/") ? "polynet_list" : "polynet_read");
const pathsOf = (value: any): string[] => (value.entries ?? []).map((entry: any) => String(entry.path));

test("a member reads the same community through their own AI and through the guide", async () => {
  const w = await world();
  const seen: Record<string, Record<string, any>> = {};
  for (const kind of DOORS) {
    const call = w.door("member", kind);
    seen[kind] = {};
    for (const path of [...READS, ...CLOSED]) seen[kind][path] = await call(toolFor(path), { path: `${ROOT}${path}` });
  }
  for (const path of READS) {
    for (const kind of DOORS) expect(seen[kind][path].ok, `${kind} reads ${path}`).toBe(true);
    // Folders hold the same things; what a lens may do there (capabilities) is its own.
    if (path.endsWith("/") && path !== "capabilities/") {
      expect(pathsOf(seen.community_agent_for_member[path].value), path).toEqual(pathsOf(seen.external_mcp[path].value));
    }
  }
  for (const path of CLOSED) for (const kind of DOORS) expect(seen[kind][path].ok, `${kind} ${path}`).toBe(false);
  // Profiles and posts read word for word the same.
  for (const path of ["community.md", "members/other.json", "members/owner.json", "members/other/timeline.md", "channels/general/", "events/", "resources/"]) {
    expect(seen.community_agent_for_member[path].value, path).toEqual(seen.external_mcp[path].value);
  }
});

test("a member reads a live course's lesson in full, and never a draft course", async () => {
  const w = await world();
  for (const kind of DOORS) {
    const call = w.door("member", kind);
    const courses: any = await call("polynet_list", { path: `${ROOT}resources/` });
    expect(courses.value.entries.map((entry: any) => entry.name)).toEqual(["Start here"]);
    const lessons: any = await call("polynet_list", { path: courses.value.entries[0].path });
    expect(lessons.ok).toBe(true);
    const lesson: any = await call("polynet_read", { path: lessons.value.entries[0].path });
    expect(JSON.stringify(lesson.value)).toContain("Run three times, easy.");
    const search: any = await call("polynet_search", { path: ROOT, query: "DRAFT ONLY" });
    expect(JSON.stringify(search.ok ? search.value : {})).not.toContain("DRAFT ONLY");
  }
});

test("the community's front page never lists a folder the lens can't open", async () => {
  const w = await world();
  for (const who of ["member", "owner"] as const) {
    for (const kind of DOORS) {
      const call = w.door(who, kind);
      const root: any = await call("polynet_list", { path: ROOT });
      expect(root.ok).toBe(true);
      for (const path of pathsOf(root.value)) {
        const opened: any = await call(toolFor(path), { path });
        expect(opened.ok, `${who} ${kind} opens ${path}`).toBe(true);
      }
    }
  }
  // The guide's notes: the guide reads them in a private talk; a member's own AI is not shown them.
  const own: any = await w.door("member", "external_mcp")("polynet_list", { path: ROOT });
  const guide: any = await w.door("member", "community_agent_for_member")("polynet_list", { path: ROOT });
  expect(pathsOf(own.value)).not.toContain(`${ROOT}memory/`);
  expect(pathsOf(guide.value)).toContain(`${ROOT}memory/`);
  expect(pathsOf(guide.value).filter((path) => path !== `${ROOT}memory/`)).toEqual(pathsOf(own.value));
});

// The course-building skill (shared/guideSkills.ts) is for whoever is offered
// the course tools: a host, through either door. A member finds no such place.
test("a host reads skills/course-building.md, the same text the guide is given on Knowledge; a member finds nothing there", async () => {
  const { COURSE_BUILDING_SKILL_MD } = await import("../shared/guideSkills");
  const w = await world();
  for (const kind of DOORS) {
    const owner = w.door("owner", kind);
    const listed: any = await owner("polynet_list", { path: `${ROOT}skills/` });
    expect(pathsOf(listed.value)).toEqual([`${ROOT}skills/course-building.md`]);
    const read: any = await owner("polynet_read", { path: `${ROOT}skills/course-building.md` });
    expect(read.value.body).toBe(COURSE_BUILDING_SKILL_MD);
    const member = w.door("member", kind);
    expect(((await member("polynet_list", { path: `${ROOT}skills/` })) as any).ok).toBe(false);
    expect(((await member("polynet_read", { path: `${ROOT}skills/course-building.md` })) as any).ok).toBe(false);
    expect(pathsOf(((await member("polynet_list", { path: ROOT })) as any).value)).not.toContain(`${ROOT}skills/`);
  }
});
