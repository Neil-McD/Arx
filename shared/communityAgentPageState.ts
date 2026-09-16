/** Session identity excludes navigation tabs: drafts survive within one community. */
export function communityAgentSessionKey(userId: string | null | undefined, communityId: string | null | undefined): string {
  return JSON.stringify([userId ?? null, communityId ?? null]);
}

export function showCommunityAgentWorkspace(state: {
  pageMode?: boolean;
  pageActive?: boolean;
  isVisible: boolean;
  isSuppressed?: boolean;
}): boolean {
  return Boolean(state.pageMode && state.pageActive && state.isVisible && !state.isSuppressed);
}
