/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { communityFormIssue, communityFormValidationIssue, type CommunityFormQuestion } from "../shared/communityForms";
const modules = import.meta.glob(["./communityForms.ts", "./_generated/**/*.*s"]);
const question: CommunityFormQuestion = { key: "q1", title: "What are you working on?", description: "", type: "short_text", required: true, options: [] };
async function fixture() {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { authSubject: "outsider", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    return ctx.db.insert("communities", { ownerId, name: "Forms", slug: "forms", visibility: "unlisted", lifecycleStatus: "active", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "owner" }), communityId };
}
test("draft retries and publication are idempotent; edits preserve published snapshot", async () => {
  const { t, owner, communityId } = await fixture();
  const args = { communityId, key: "form", expectedRevision: 0, name: "Intake", questions: [question] };
  expect((await owner.mutation(api.communityForms.saveBuilderForm, args)).revision).toBe(1);
  expect((await owner.mutation(api.communityForms.saveBuilderForm, args)).revision).toBe(1);
  const publish = { communityId, key: "form", expectedRevision: 1 };
  await owner.mutation(api.communityForms.publishBuilderForm, publish);
  await owner.mutation(api.communityForms.publishBuilderForm, publish);
  await owner.mutation(api.communityForms.saveBuilderForm, { ...args, expectedRevision: 1, name: "Changed" });
  await expect(owner.mutation(api.communityForms.saveBuilderForm, { ...args, expectedRevision: 1, name: "Stale" })).rejects.toThrow("form_revision_conflict");
  await expect(owner.mutation(api.communityForms.publishBuilderForm, publish)).rejects.toThrow("form_revision_conflict");
  const versions = await t.run(ctx => ctx.db.query("communityFormVersions").collect());
  expect(versions).toHaveLength(1);
  expect(versions[0].name).toBe("Intake");
  expect((await owner.query(api.communityForms.listBuilderForms, { communityId }))[0]).toMatchObject({ revision: 2, publishedRevision: 1 });
  await owner.mutation(api.communityForms.publishBuilderForm, { ...publish, expectedRevision: 2 });
  const republished = await t.run(ctx => ctx.db.query("communityFormVersions").collect());
  expect(republished).toHaveLength(2);
  expect(republished.find(v => v.revision === 1)?.name).toBe("Intake");
  expect(republished.find(v => v.revision === 2)?.name).toBe("Changed");
});
test("blank drafts save but cannot publish", async () => {
  const { owner, communityId } = await fixture();
  await owner.mutation(api.communityForms.saveBuilderForm, { communityId, key: "blank", expectedRevision: 0, name: "Untitled", questions: [{ ...question, title: "" }] });
  await expect(owner.mutation(api.communityForms.publishBuilderForm, { communityId, key: "blank", expectedRevision: 1 })).rejects.toThrow("title");
});
test("nonmanagers cannot read, save or publish", async () => {
  const { t, communityId } = await fixture();
  for (const client of [t, t.withIdentity({ subject: "outsider" })]) {
    await expect(client.query(api.communityForms.listBuilderForms, { communityId })).rejects.toThrow();
    await expect(client.mutation(api.communityForms.saveBuilderForm, { communityId, key: "x", expectedRevision: 0, name: "x", questions: [question] })).rejects.toThrow();
    await expect(client.mutation(api.communityForms.publishBuilderForm, { communityId, key: "x", expectedRevision: 1 })).rejects.toThrow();
  }
});
test("published choices need distinct answers and question keys are unique", () => {
  const form = { name: "Intake", questions: [{ ...question, type: "single_choice" as const, options: ["Yes", " yes "] }] };
  expect(communityFormIssue(form)).toBeNull();
  expect(communityFormIssue(form, true)).toContain("distinct");
  expect(communityFormIssue({ ...form, questions: [question, question] })).toContain("unique");
});

test("editor validation targets the same first failure as the publishing contract", () => {
  const form = { name: "Intake", questions: [question, { ...question, key: "q2", title: "" }] };
  expect(communityFormValidationIssue(form, true)).toEqual({ message: communityFormIssue(form, true), questionIndex: 1, field: "title" });
  expect(communityFormValidationIssue(form)).toBeNull();
  form.questions[1] = { ...question, key: "q2", type: "single_choice", options: ["Yes", "yes"] };
  expect(communityFormValidationIssue(form, true)).toMatchObject({ questionIndex: 1, field: "options" });
  expect(communityFormValidationIssue({ ...form, name: "" }, true)).toEqual({ message: "Give the form a name.", field: "name" });
});
