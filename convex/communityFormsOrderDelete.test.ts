/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { CommunityFormQuestion } from "../shared/communityForms";

const modules = import.meta.glob(["./communityForms.ts", "./communityMemberWorkflows.ts", "./_generated/**/*.*s"]);
const question: CommunityFormQuestion = { key: "q1", title: "What are you working on?", description: "", type: "short_text", required: true, options: [] };

async function fixture() {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    return ctx.db.insert("communities", { ownerId, name: "Forms", slug: "forms", visibility: "unlisted", lifecycleStatus: "active", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
  });
  const owner = t.withIdentity({ subject: "owner" });
  for (const key of ["a", "b", "c"]) {
    await owner.mutation(api.communityForms.saveBuilderForm, { communityId, key, expectedRevision: 0, name: key.toUpperCase(), questions: [question] });
    await owner.mutation(api.communityForms.publishBuilderForm, { communityId, key, expectedRevision: 1 });
  }
  const keys = async () => (await owner.query(api.communityForms.listBuilderForms, { communityId })).map((form: any) => form.key);
  return { t, owner, communityId, keys };
}

test("forms keep the order they're dragged into", async () => {
  const f = await fixture();
  expect(await f.keys()).toEqual(["a", "b", "c"]);
  await f.owner.mutation(api.communityForms.reorderBuilderForms, { communityId: f.communityId, keys: ["c", "a"] });
  expect(await f.keys()).toEqual(["c", "a", "b"]);
  await f.owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "d", expectedRevision: 0, name: "D", questions: [question] });
  expect(await f.keys()).toEqual(["c", "a", "b", "d"]);
  await expect(f.owner.mutation(api.communityForms.reorderBuilderForms, { communityId: f.communityId, keys: ["nope"] })).rejects.toThrow("form_not_found");
});

test("a form used by an automation can't be deleted; an unused one can, and comes back on restore", async () => {
  const f = await fixture();
  const stage = await f.owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Start" });
  await f.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1, milestoneKey: stage.milestone.key, name: "Start",
    automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "request_form", formKey: "a" } }] });
  const forms = await f.owner.query(api.communityForms.listBuilderForms, { communityId: f.communityId });
  expect(forms.find((form: any) => form.key === "a")?.usedIn).toEqual([expect.objectContaining({ kind: "automation", stageName: "Start", role: "sends", paused: false })]);
  expect(forms.find((form: any) => form.key === "b")?.usedIn).toEqual([]);
  await expect(f.owner.mutation(api.communityForms.deleteBuilderForm, { communityId: f.communityId, key: "a" })).rejects.toThrow("form_in_use");

  await f.owner.mutation(api.communityForms.deleteBuilderForm, { communityId: f.communityId, key: "b" });
  expect(await f.keys()).toEqual(["a", "c"]);
  expect((await f.owner.query(api.communityForms.listDeletedBuilderForms, { communityId: f.communityId })).map((form: any) => form.key)).toEqual(["b"]);
  // A deleted form can't be put back into an automation, edited or published.
  await expect(f.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 2, milestoneKey: stage.milestone.key, name: "Start",
    automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "request_form", formKey: "b" } }] })).rejects.toThrow("form_not_published");
  await expect(f.owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "b", expectedRevision: 1, name: "B2", questions: [question] })).rejects.toThrow("form_deleted");

  await f.owner.mutation(api.communityForms.restoreBuilderForm, { communityId: f.communityId, key: "b" });
  expect(await f.keys()).toEqual(["a", "b", "c"]);
});
