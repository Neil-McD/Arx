export type ConfirmDiscardUnsavedCommunityChangesInput = {
  hasUnsavedSettings: boolean;
  hasUnsavedAgentConfig?: boolean;
  hasUnsavedFunnelConfig?: boolean;
  activeCommunityId: string | null;
  nextCommunityId: string | null;
  confirmDiscard: (message: string) => boolean;
  message?: string;
};

export function confirmDiscardUnsavedCommunityChanges(
  input: ConfirmDiscardUnsavedCommunityChangesInput,
): boolean {
  const hasUnsavedChanges =
    input.hasUnsavedSettings
    || Boolean(input.hasUnsavedAgentConfig)
    || Boolean(input.hasUnsavedFunnelConfig);
  if (!hasUnsavedChanges) return true;

  const currentId = input.activeCommunityId;
  if (!currentId) return true;
  if (!input.nextCommunityId || input.nextCommunityId === currentId) return true;

  return input.confirmDiscard(input.message ?? "You have unsaved changes. Discard changes?");
}

export type ConfirmDiscardUnsavedCommunitySettingsWebInput = {
  isCommunitySettingsDirty: boolean;
  isCommunityAgentConfigDirty: boolean;
  isCommunityFunnelDirty: boolean;
  activeCommunityId: string | null;
  nextCommunityId: string | null;
  confirmDiscard: (message: string) => boolean;
};

export function confirmDiscardUnsavedCommunitySettingsWeb(
  input: ConfirmDiscardUnsavedCommunitySettingsWebInput,
): boolean {
  return confirmDiscardUnsavedCommunityChanges({
    hasUnsavedSettings: input.isCommunitySettingsDirty,
    hasUnsavedAgentConfig: input.isCommunityAgentConfigDirty,
    hasUnsavedFunnelConfig: input.isCommunityFunnelDirty,
    activeCommunityId: input.activeCommunityId,
    nextCommunityId: input.nextCommunityId,
    confirmDiscard: input.confirmDiscard,
    message: "You have unsaved changes. Discard changes?",
  });
}
