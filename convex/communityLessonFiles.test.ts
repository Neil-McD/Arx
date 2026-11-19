/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { registerCommunityLessonFileRoutes } from "./httpCommunityLessonFiles";
import { prepareCommunityAttachmentStream } from "./httpCommunityAttachments";
import { LESSON_FILE_DOWNLOAD_PATH, LESSON_FILE_MAX_BYTES, LESSON_FILE_UPLOAD_PATH } from "../shared/lessonFiles";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = 1_790_000_000_000;
const PDF = new TextEncoder().encode("%PDF-1.7\nworkbook bytes");
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const t = convexTest(schema, modules);
  const f = await t.run(async (ctx: any) => {
    const user = (name: string) => ctx.db.insert("users", { authSubject: name, displayName: name, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner"), memberId = await user("member"), strangerId = await user("stranger");
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Kiln", slug: "kiln", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member",
      accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const liveId = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "live", name: "Core", sortOrder: 1000, createdAt: NOW, updatedAt: NOW });
    const draftId = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "draft", name: "Later", sortOrder: 2000, createdAt: NOW, updatedAt: NOW });
    return { ownerId, memberId, strangerId, communityId, membershipId, liveId, draftId };
  });
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });
  const lesson = async (moduleId: any, title: string, extra: Record<string, unknown> = {}) => (await asOwner.mutation(api.communityResources.saveCommunityResource, {
    resourceId: null, isPatch: false,
    payload: { community_id: f.communityId, type: "post", resource_role: "page", title, body_md: "Words.", url: null, pinned: false, module_id: moduleId, ...extra },
  }) as any).id as string;
  const save = (resourceId: string, payload: Record<string, unknown>) =>
    asOwner.mutation(api.communityResources.saveCommunityResource, { resourceId, isPatch: true, payload });

  // The routes as http.ts registers them, signed in as whoever `actor` is.
  const routes: any[] = [];
  let actor: any = f.ownerId;
  registerCommunityLessonFileRoutes({ http: { route: (config: any) => routes.push(config) } as any, httpAction: ((fn: any) => fn) as any,
    jsonResponse: (_req: Request, status: number, payload: unknown) => Response.json(payload, { status }), optionsResponse: () => new Response(),
    requireAuthenticatedActor: async () => ({ ok: true, actor: { dbUserId: actor, authSubject: "x" } }) as any,
  });
  const route = (path: string) => routes.find((entry) => entry.path === path && entry.method === "POST").handler;
  // Storage, as the provider answers: an upload POST stores the streamed
  // bytes; a GET of a file URL returns them.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init?: any) => {
    if (init?.method !== "POST") return new Response("workbook bytes");
    const blob = await new Response(init.body, { headers: init.headers }).blob();
    const storageId = await t.run(async (ctx: any) => {
      const id = await ctx.storage.store(blob);
      // convex-test omits contentType; the real provider records it.
      await ctx.db.patch(id, { contentType: blob.type });
      return id;
    });
    return Response.json({ storageId });
  });
  const upload = async (resourceId: string, name = "workbook.pdf", body: BodyInit = PDF, as: any = f.ownerId) => {
    actor = as;
    const response = await route(LESSON_FILE_UPLOAD_PATH)({ runMutation: t.mutation }, new Request(`https://stage.example${LESSON_FILE_UPLOAD_PATH}`, {
      method: "POST", body, duplex: "half",
      headers: { "content-type": "application/pdf", "x-polynet-resource-id": resourceId, "x-polynet-file-name": encodeURIComponent(name) },
    } as RequestInit));
    return { status: response.status as number, body: await response.json() as any };
  };
  const download = async (fileId: string, as: any) => {
    actor = as;
    return await route(LESSON_FILE_DOWNLOAD_PATH)({ runQuery: t.query }, new Request(`https://stage.example${LESSON_FILE_DOWNLOAD_PATH}`, {
      method: "POST", headers: { "x-polynet-lesson-file-id": fileId },
    })) as Response;
  };
  const fileRow = (fileId: string): Promise<any> => t.run((ctx: any) => ctx.db.get(ctx.db.normalizeId("communityLessonFiles", fileId)));
  const bytes = (storageId: any) => t.run((ctx: any) => ctx.storage.get(storageId));
  return { t, f, asOwner, asMember, lesson, save, upload, download, fileRow, bytes };
}

test("a host's file reaches members only once saved with a published lesson, and only while they may read it", async () => {
  const { t, f, asMember, lesson, save, upload, download, fileRow, bytes } = await setup();
  const lessonId = await lesson(f.liveId, "Finding the bottleneck");
  const uploaded = await upload(lessonId);
  expect(uploaded.status).toBe(200);
  expect(uploaded.body.file).toMatchObject({ title: "workbook.pdf", name: "workbook.pdf", type: "PDF", size_bytes: PDF.length });
  expect(JSON.stringify(uploaded.body)).not.toMatch(/storage|url/i);
  const fileId = uploaded.body.file.id as string;

  // Uploaded but not saved: nobody is served it, and members don't see it.
  expect((await download(fileId, f.memberId)).status).toBe(404);
  expect(((await asMember.query(api.communityResources.listCommunityResources, { communityId: f.communityId })) as any[])[0].lesson_files).toEqual([]);

  await save(lessonId, { lesson_files: [{ id: fileId, title: "The workbook" }] });
  const seen = (await asMember.query(api.communityResources.listCommunityResources, { communityId: f.communityId })) as any[];
  expect(seen[0].lesson_files).toEqual([{ id: fileId, title: "The workbook", name: "workbook.pdf", type: "PDF", size_bytes: PDF.length }]);
  const { storageId } = await fileRow(fileId);
  expect(JSON.stringify(seen)).not.toContain(String(storageId));

  // A member downloads it: a download, never something the browser shows.
  const served = await download(fileId, f.memberId);
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("application/octet-stream");
  expect(served.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''workbook.pdf");
  expect(served.headers.get("x-content-type-options")).toBe("nosniff");
  expect(served.headers.get("cache-control")).toBe("private, no-store");
  expect(served.headers.get("location")).toBeNull();
  expect(await served.text()).toBe("workbook bytes");

  // Not someone outside the community, whatever link they hold.
  expect((await download(fileId, f.strangerId)).status).toBe(404);

  // The course back to draft: members stop at once; the host still can.
  await t.run((ctx: any) => ctx.db.patch(f.liveId, { status: "draft" }));
  expect((await download(fileId, f.memberId)).status).toBe(404);
  expect((await download(fileId, f.ownerId)).status).toBe(200);
  await t.run((ctx: any) => ctx.db.patch(f.liveId, { status: "live" }));
  expect((await download(fileId, f.memberId)).status).toBe(200);

  // A member who left stops at once.
  await t.run((ctx: any) => ctx.db.patch(f.membershipId, { state: "lapsed" }));
  expect((await download(fileId, f.memberId)).status).toBe(404);
  await t.run((ctx: any) => ctx.db.patch(f.membershipId, { state: "active" }));

  // Removed from the lesson: nobody gets it, and the bytes are gone.
  await save(lessonId, { lesson_files: [] });
  expect((await download(fileId, f.memberId)).status).toBe(404);
  expect((await download(fileId, f.ownerId)).status).toBe(404);
  expect(await bytes(storageId)).toBeNull();
  expect(await fileRow(fileId)).toBeNull();
});

test("a lesson in a draft course: its file is the host's, not a member's", async () => {
  const { f, lesson, save, upload, download } = await setup();
  const lessonId = await lesson(f.draftId, "Not yet");
  const fileId = (await upload(lessonId)).body.file.id;
  await save(lessonId, { lesson_files: [{ id: fileId, title: "Draft notes" }] });
  expect((await download(fileId, f.memberId)).status).toBe(404);
  expect((await download(fileId, f.ownerId)).status).toBe(200);
});

test("deleting a lesson, or a course, deletes its files' bytes; an upload never saved expires", async () => {
  const { t, f, asOwner, lesson, save, upload, fileRow, bytes } = await setup();
  const one = await lesson(f.liveId, "One");
  const fileOne = (await upload(one)).body.file.id;
  await save(one, { lesson_files: [{ id: fileOne, title: "One" }] });
  const storedOne = (await fileRow(fileOne)).storageId;
  await asOwner.mutation(api.communityResources.deleteCommunityResource, { resourceId: one });
  expect(await bytes(storedOne)).toBeNull();
  expect(await fileRow(fileOne)).toBeNull();

  const two = await lesson(f.draftId, "Two");
  const fileTwo = (await upload(two)).body.file.id;
  await save(two, { lesson_files: [{ id: fileTwo, title: "Two" }] });
  const unsaved = (await upload(two, "spare.zip", new Uint8Array([80, 75, 3, 4, 1]))).body.file.id;
  const storedTwo = (await fileRow(fileTwo)).storageId;
  const storedSpare = (await fileRow(unsaved)).storageId;
  await asOwner.mutation(api.communityResources.deleteCommunityResourceModule, { moduleId: f.draftId });
  expect(await bytes(storedTwo)).toBeNull();
  expect(await bytes(storedSpare)).toBeNull();

  // An upload left unsaved is deleted, bytes and all, once it expires.
  const three = await lesson(f.liveId, "Three");
  const left = (await upload(three, "left.zip", new Uint8Array([80, 75, 3, 4, 2]))).body.file.id;
  const storedLeft = (await fileRow(left)).storageId;
  await t.run((ctx: any) => ctx.db.patch(ctx.db.normalizeId("communityLessonFiles", left), { uploadExpiresAt: Date.now() - 1 }));
  await t.mutation((internal as any).communityLessonFiles.cleanupInternal, { fileId: left });
  expect(await bytes(storedLeft)).toBeNull();
  expect(await fileRow(left)).toBeNull();
});

test("a file over the limit and a 13th resource are refused; only course editors upload", async () => {
  const { f, lesson, save, upload } = await setup();
  const lessonId = await lesson(f.liveId, "Full");
  // Over the lesson limit, streamed (no length given): refused as too large.
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const big = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent > LESSON_FILE_MAX_BYTES) { controller.close(); return; }
      sent += chunk.length;
      controller.enqueue(chunk);
    },
  });
  const tooBig = await upload(lessonId, "huge.zip", big);
  expect(tooBig).toMatchObject({ status: 413, body: { code: "lesson_file_too_large" } });
  // A length that says so is refused before anything is stored.
  await expect(prepareCommunityAttachmentStream(new Request("https://example.com", {
    method: "POST", body: PDF, headers: { "content-length": String(LESSON_FILE_MAX_BYTES + 1) },
  }), { maxBytes: () => LESSON_FILE_MAX_BYTES, anyType: true })).rejects.toThrow("too_large");

  // A member can't upload one.
  expect((await upload(lessonId, "mine.pdf", PDF, f.memberId)).status).toBe(403);

  // Twelve resources, links and files together; the thirteenth is refused.
  const links = Array.from({ length: 11 }, (_, index) => ({ title: `L${index}`, url: `https://example.com/${index}` }));
  await save(lessonId, { lesson_links: links });
  const twelfth = (await upload(lessonId)).body.file.id;
  await save(lessonId, { lesson_files: [{ id: twelfth, title: "Twelfth" }] });
  expect(await upload(lessonId)).toMatchObject({ status: 409, body: { code: "lesson_resources_limit" } });
  await expect(save(lessonId, { lesson_links: [...links, { title: "One more", url: "https://example.com/more" }] }))
    .rejects.toThrow("lesson_resources_limit");
});

test("a course change through an AI sets links only: files stay, and it can't add one", async () => {
  const { t, f, lesson, save, upload, fileRow } = await setup();
  const lessonId = await lesson(f.liveId, "Week 1");
  const kept = (await upload(lessonId)).body.file.id;
  await save(lessonId, { lesson_files: [{ id: kept, title: "The workbook" }] });
  const pending = (await upload(lessonId, "sneaky.pdf")).body.file.id;
  const updatedAt = () => t.run(async (ctx: any) => (await ctx.db.get(ctx.db.normalizeId("communityResources", lessonId))).updatedAt);
  const batch = async (key: string, operation: Record<string, unknown>) => await t.mutation((internal as any).communityResources.runCommunityResourceBuilderBatchInternal, {
    userId: f.ownerId, communityId: f.communityId, summary: "Links.", idempotencyKey: key,
    operations: [{ op: "edit_page", resource_id: lessonId, expected_updated_at: await updatedAt(), ...operation }],
  });
  await batch("one", { lesson_links: [{ title: "The talk", url: "https://example.com/talk" }] });
  expect((await fileRow(kept)).status).toBe("attached");
  await batch("two", { lesson_links: [], lesson_files: [{ id: pending, title: "Forged" }] }).catch(() => undefined);
  expect((await fileRow(kept)).status).toBe("attached");
  expect((await fileRow(pending)).status).toBe("pending");
  // Links that would crowd out the files already there are refused.
  const twelve = Array.from({ length: 12 }, (_, index) => ({ title: `L${index}`, url: `https://example.com/${index}` }));
  await expect(batch("three", { lesson_links: twelve })).rejects.toThrow("lesson_resources_limit");
  expect((await fileRow(kept)).status).toBe("attached");
});

test("the lesson an AI reads lists its files by name, type and size, with no address or storage id", async () => {
  const { t, f, lesson, save, upload, fileRow } = await setup();
  const lessonId = await lesson(f.liveId, "Week 1", { lesson_links: [{ title: "The talk", url: "https://example.com/talk" }] });
  const fileId = (await upload(lessonId)).body.file.id;
  await save(lessonId, { lesson_files: [{ id: fileId, title: "The workbook" }] });
  const { storageId } = await fileRow(fileId);
  const memberRead = await t.query((internal as any).communityResources.readCommunityResourceDirectoryInternal, {
    userId: f.memberId, communityId: f.communityId, ref: `resource:${lessonId}`,
  });
  expect(memberRead.lesson_links).toEqual([{ title: "The talk", url: "https://example.com/talk" }]);
  expect(memberRead.lesson_files).toEqual([{ title: "The workbook", type: "PDF", size_bytes: PDF.length }]);
  const builderRead = await t.query((internal as any).communityResources.readCommunityResourceBuilderResourceInternal, {
    userId: f.ownerId, communityId: f.communityId, ref: lessonId,
  });
  expect(builderRead.resource.lesson_files).toEqual([{ title: "The workbook", type: "PDF", size_bytes: PDF.length }]);
  for (const read of [memberRead, builderRead]) {
    const text = JSON.stringify(read);
    expect(text).not.toContain(String(storageId));
    expect(text).not.toContain(fileId);
    expect(text).not.toContain("lesson_file_download");
  }
});
