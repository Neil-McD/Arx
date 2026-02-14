type MutableRef<T> = { current: T };

type DesktopSessionResetDeps = {
  clearPersistedSupabaseSession: () => Promise<void>;
  setSupabaseSession: (value: null) => void;
  setCommunities: (value: any[]) => void;
  setActiveCommunityId: (value: null) => void;
  navStackRef: MutableRef<any[]>;
};

export async function resetDesktopSessionStateAfterSignOut(deps: DesktopSessionResetDeps): Promise<void> {
  await deps.clearPersistedSupabaseSession();
  deps.setSupabaseSession(null);
  deps.setCommunities([]);
  deps.setActiveCommunityId(null);
  deps.navStackRef.current = [];
}
