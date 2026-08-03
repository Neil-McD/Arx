import {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  mergeCommunityVisualIdentity,
  type CommunityVisualIdentity,
} from "./communityVisualIdentity";

export type CommunityVisualIdentityRegistry = {
  get: (communityId: string) => CommunityVisualIdentity | null;
  subscribe: (communityId: string, listener: () => void) => () => void;
  upsertMany: (identities: CommunityVisualIdentity[]) => void;
  clear: () => void;
};

const EMPTY_REGISTRY: CommunityVisualIdentityRegistry = {
  get: () => null,
  subscribe: () => () => {},
  upsertMany: () => {},
  clear: () => {},
};

const CommunityVisualIdentityRegistryContext =
  createContext<CommunityVisualIdentityRegistry>(EMPTY_REGISTRY);

export function createCommunityVisualIdentityRegistry(): CommunityVisualIdentityRegistry {
  const byCommunityId = new Map<string, CommunityVisualIdentity>();
  const listenersByCommunityId = new Map<string, Set<() => void>>();

  const notify = (communityIds: Iterable<string>) => {
    for (const communityId of communityIds) {
      for (const listener of listenersByCommunityId.get(communityId) ?? []) {
        listener();
      }
    }
  };

  return {
    get: (communityId) => byCommunityId.get(communityId) ?? null,
    subscribe: (communityId, listener) => {
      let listeners = listenersByCommunityId.get(communityId);
      if (!listeners) {
        listeners = new Set();
        listenersByCommunityId.set(communityId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) listenersByCommunityId.delete(communityId);
      };
    },
    upsertMany: (identities) => {
      const changedCommunityIds = new Set<string>();
      for (const incoming of identities) {
        const existing = byCommunityId.get(incoming.community_id);
        const merged = mergeCommunityVisualIdentity(existing, incoming);
        if (merged === existing) continue;
        byCommunityId.set(incoming.community_id, merged);
        changedCommunityIds.add(incoming.community_id);
      }
      notify(changedCommunityIds);
    },
    clear: () => {
      if (byCommunityId.size === 0) return;
      const clearedCommunityIds = [...byCommunityId.keys()];
      byCommunityId.clear();
      notify(clearedCommunityIds);
    },
  };
}

export function CommunityVisualIdentityRegistryProvider(props: {
  children: ReactNode;
}) {
  const registryRef = useRef<CommunityVisualIdentityRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = createCommunityVisualIdentityRegistry();
  }

  return (
    <CommunityVisualIdentityRegistryContext.Provider value={registryRef.current}>
      {props.children}
    </CommunityVisualIdentityRegistryContext.Provider>
  );
}

export function useCommunityVisualIdentityRegistryActions() {
  const registry = useContext(CommunityVisualIdentityRegistryContext);
  return {
    upsertCommunityVisualIdentities: registry.upsertMany,
    clearCommunityVisualIdentities: registry.clear,
  };
}

export function useCommunityVisualIdentity(
  communityId: string | null | undefined,
  fallback?: CommunityVisualIdentity | null,
): CommunityVisualIdentity | null {
  const registry = useContext(CommunityVisualIdentityRegistryContext);
  const normalizedId = String(communityId ?? fallback?.community_id ?? "").trim();
  const registered = useSyncExternalStore(
    (listener) => normalizedId
      ? registry.subscribe(normalizedId, listener)
      : () => {},
    () => normalizedId ? registry.get(normalizedId) : null,
    () => null,
  );
  if (!registered) return fallback ?? null;
  if (!fallback) return registered;
  return mergeCommunityVisualIdentity(registered, fallback);
}
