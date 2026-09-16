import { describe, expect, it, vi } from "vitest";
import { createMemberFormSave } from "../apps/web/src/components/memberFormSave";

describe("member form save serialization", () => {
  it("preserves newer edits while one background save is in flight", async () => {
    let finish!: (value: { revision: number; submitted: boolean }) => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ revision: 2, submitted: false });
    const saver = createMemberFormSave({ answers: {}, revision: 0 }, write);
    const answers = { q: "first" };
    const pending = saver.run("autosave", answers);
    answers.q = "newer";
    expect(await saver.run("autosave", answers)).toBeNull();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].answers).toEqual({ q: "first" });
    finish({ revision: 1, submitted: false });
    await pending;
    expect(saver.dirty(answers)).toBe(true);
    await saver.run("autosave", answers);
    expect(write.mock.calls[1][0]).toMatchObject({ answers, revision: 1 });
    expect(saver.dirty(answers)).toBe(false);
  });

  it("retries the exact failed submit rather than saving a draft", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ revision: 4, submitted: true });
    const saver = createMemberFormSave({ answers: { q: "yes" }, revision: 3 }, write);
    await expect(saver.run("submit", { q: "yes" })).rejects.toThrow("lost response");
    await expect(saver.run("autosave", { q: "changed" })).rejects.toThrow("form_retry_required");
    const result = await saver.run("submit", { q: "changed" }, true);
    expect(write.mock.calls[1][0]).toEqual(write.mock.calls[0][0]);
    expect(result).toMatchObject({ intent: "submit", submitted: true });
  });

  it("recovers an uncertain draft before writing newer answers", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ revision: 1, submitted: false })
      .mockResolvedValueOnce({ revision: 2, submitted: false });
    const saver = createMemberFormSave({ answers: {}, revision: 0 }, write);
    await expect(saver.run("autosave", { q: "old" })).rejects.toThrow();
    await saver.run("autosave", { q: "new" }, true);
    expect(write.mock.calls[1][0].answers).toEqual({ q: "old" });
    expect(saver.dirty({ q: "new" })).toBe(true);
    await saver.run("autosave", { q: "new" });
    expect(write.mock.calls[2][0].revision).toBe(1);
  });

  it.each(["continue", "close"] as const)("retains %s intent through retry", async intent => {
    const write = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ revision: 1, submitted: false });
    const saver = createMemberFormSave({ answers: {}, revision: 0 }, write);
    await expect(saver.run(intent, { q: "yes" })).rejects.toThrow();
    expect(await saver.run(intent, { q: "yes" }, true)).toMatchObject({ intent });
  });

  it("skips unchanged drafts but never skips submission", async () => {
    const write = vi.fn().mockResolvedValue({ revision: 2, submitted: true });
    const saver = createMemberFormSave({ answers: { q: "yes" }, revision: 1 }, write);
    expect(await saver.run("close", { q: "yes" })).toMatchObject({ intent: "close" });
    expect(write).not.toHaveBeenCalled();
    await saver.run("submit", { q: "yes" });
    expect(write).toHaveBeenCalledOnce();
  });
});
