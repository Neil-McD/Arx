type MentionNotifyState = "pending" | "sent" | "suppressed" | "read";

export async function settleMentionRowInternal(args: {
  ctx: any;
  mentionId: any;
  toState: Exclude<MentionNotifyState, "pending">;
  nowMs: number;
}): Promise<{ ok: true; settled: boolean }> {
  const row = (await args.ctx.db.get(args.mentionId)) as Record<string, any> | null;
  if (!row || row.notifyState !== "pending") return { ok: true, settled: false };
  await args.ctx.db.patch(args.mentionId, {
    notifyState: args.toState,
    updatedAt: args.nowMs,
  });
  return { ok: true, settled: true };
}

