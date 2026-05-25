export const COMMUNITY_RESOURCES_MUTATED_EVENT = "polynet:community-resources-mutated";

export type CommunityResourcesMutatedEventDetail = {
  communityId: string;
  changesetId?: string | null;
  source?: string | null;
};

export function readCommunityResourcesMutatedEventDetail(
  event: Event,
): CommunityResourcesMutatedEventDetail | null {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const record = detail as Record<string, unknown>;
  const communityId = String(record.communityId ?? "").trim();
  if (!communityId) return null;
  const changesetId = String(record.changesetId ?? "").trim();
  const source = String(record.source ?? "").trim();
  return {
    communityId,
    changesetId: changesetId || null,
    source: source || null,
  };
}

export function dispatchCommunityResourcesMutated(
  detail: CommunityResourcesMutatedEventDetail,
): void {
  if (typeof window === "undefined") return;
  const communityId = String(detail.communityId ?? "").trim();
  if (!communityId) return;
  window.dispatchEvent(
    new CustomEvent(COMMUNITY_RESOURCES_MUTATED_EVENT, {
      detail: {
        communityId,
        changesetId: String(detail.changesetId ?? "").trim() || null,
        source: String(detail.source ?? "").trim() || null,
      },
    }),
  );
}
