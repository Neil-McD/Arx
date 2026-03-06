type MutableRef<T> = { current: T };

type DesktopSessionResetDeps = {
  clearPersistedCloudSession: () => Promise<void>;
  setCloudSession: (value: null) => void;
  setCommunities: (value: any[]) => void;
  setActiveCommunityId: (value: null) => void;
  navStackRef: MutableRef<any[]>;
};

export async function resetDesktopSessionStateAfterSignOut(deps: DesktopSessionResetDeps): Promise<void> {
  await deps.clearPersistedCloudSession();
  deps.setCloudSession(null);
  deps.setCommunities([]);
  deps.setActiveCommunityId(null);
  deps.navStackRef.current = [];
}
