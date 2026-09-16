import { describe, expect, it, vi } from "vitest";
import { searchCommunityDirectoryBatch } from "../shared/communityDirectorySearch";

it("automatic continuation obeys its remaining page budget", async () => {
  let calls = 0;
  const result = await searchCommunityDirectoryBatch({ query: "absent", cursor: null, maxPages: 2, isCurrent: () => true,
    loadPage: async () => ({ rows: [], isDone: false, continueCursor: String(++calls) }) });
  expect(calls).toBe(2);
  expect(result).toEqual({ rows: [], cursor: "2", pagesRead: 2 });
});
import type { CommunityDirectoryMember } from "../shared/communityTypes";

const member = (id: string, name: string): CommunityDirectoryMember => ({ id, user_id: id, community_id: "community", display_name: name, role: "member", created_at: "", last_active_at: "" });
describe("authorized directory search batches", () => {
  it("finds names beyond the first page and includes the viewer", async () => {
    const loadPage = vi.fn().mockResolvedValueOnce({ rows: [member("1", "Other")], continueCursor: "next", isDone: false }).mockResolvedValueOnce({ rows: [member("viewer", "Neil")], continueCursor: null, isDone: true });
    expect(await searchCommunityDirectoryBatch({ query: " nEiL ", cursor: null, isCurrent: () => true, loadPage })).toEqual({ rows: [member("viewer", "Neil")], cursor: null, pagesRead: 2 });
  });
  it("bounds work and retains the continuation even when no matches are found", async () => {
    let count = 0;
    const loadPage = vi.fn(async () => ({ rows: [], continueCursor: String(++count), isDone: false }));
    expect(await searchCommunityDirectoryBatch({ query: "none", cursor: null, isCurrent: () => true, loadPage })).toEqual({ rows: [], cursor: "10", pagesRead: 10 });
    expect(loadPage).toHaveBeenCalledTimes(10);
  });
  it("discards stale responses", async () => {
    let current = true;
    const result = await searchCommunityDirectoryBatch({ query: "Neil", cursor: null, isCurrent: () => current, loadPage: async () => { current = false; return { rows: [member("1", "Neil")], continueCursor: null, isDone: true }; } });
    expect(result).toBeNull();
  });
  it("fails on a stalled cursor instead of repeatedly reading it", async () => {
    await expect(searchCommunityDirectoryBatch({ query: "Neil", cursor: "same", isCurrent: () => true, loadPage: async () => ({ rows: [], continueCursor: "same", isDone: false }) })).rejects.toThrow("could not continue");
  });
  it("deduplicates matches and propagates authorization errors", async () => {
    expect(await searchCommunityDirectoryBatch({ query: "Neil", cursor: null, isCurrent: () => true, loadPage: async () => ({ rows: [member("1", "Neil"), member("1", "Neil")], continueCursor: null, isDone: true }) })).toEqual({ rows: [member("1", "Neil")], cursor: null, pagesRead: 1 });
    await expect(searchCommunityDirectoryBatch({ query: "Neil", cursor: null, isCurrent: () => true, loadPage: async () => { throw new Error("Forbidden"); } })).rejects.toThrow("Forbidden");
  });
});
