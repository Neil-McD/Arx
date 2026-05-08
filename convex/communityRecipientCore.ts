type CommunityMembershipRow = {
  _id: any;
  communityId: any;
  userId: any;
  active?: boolean;
  revokedAt?: number;
  createdAt: number;
};

type CommunityMemberSettingsRow = {
  userId: any;
  muted: boolean;
  mutedUntil?: number;
};

export async function listActiveCommunityRecipientUserIds(ctx: any, params: {
  communityId: any;
  communityOwnerId: any;
  nowMs: number;
  limit: number;
}): Promise<any[]> {
  const memberships = (await ctx.db
    .query("communityMemberships" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", params.communityId))
    .collect()) as CommunityMembershipRow[];
  const settingsRows = (await ctx.db
    .query("communityMemberSettings" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", params.communityId))
    .collect()) as CommunityMemberSettingsRow[];
  const settingsByUserId = new Map<string, CommunityMemberSettingsRow>();
  for (const row of settingsRows) {
    settingsByUserId.set(String(row.userId), row);
  }

  const recipientUserIds: any[] = [];
  const addRecipient = (userId: any) => {
    if (recipientUserIds.length >= params.limit) return;
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) return;
    const settings = settingsByUserId.get(normalizedUserId);
    if (settings?.muted === true) return;
    if (typeof settings?.mutedUntil === "number" && settings.mutedUntil > params.nowMs) return;
    if (recipientUserIds.some((existing) => String(existing) === normalizedUserId)) return;
    recipientUserIds.push(userId);
  };

  addRecipient(params.communityOwnerId);
  for (const membership of memberships.sort((a, b) => a.createdAt - b.createdAt)) {
    if (membership.active === false || typeof membership.revokedAt === "number") continue;
    addRecipient(membership.userId);
    if (recipientUserIds.length >= params.limit) break;
  }
  return recipientUserIds.slice(0, params.limit);
}
