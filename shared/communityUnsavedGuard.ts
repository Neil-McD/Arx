// Switching to another community while a change there hasn't saved yet (a
// save still running, or one that failed) needs a yes first. The asking is the
// app's own card (askInApp), never the browser's box (Neil, Nov 26).
export function needsLeaveCheck(input: {
  isCommunitySettingsDirty: boolean;
  isCommunityAgentConfigDirty: boolean;
  activeCommunityId: string | null;
  nextCommunityId: string | null;
}): boolean {
  if (!input.isCommunitySettingsDirty && !input.isCommunityAgentConfigDirty) return false;
  if (!input.activeCommunityId || !input.nextCommunityId) return false;
  return input.nextCommunityId !== input.activeCommunityId;
}
