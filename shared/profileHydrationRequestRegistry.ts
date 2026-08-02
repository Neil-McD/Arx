export type ProfileHydrationRequest = {
  generation: number;
  userIds: string[];
};

export type ProfileHydrationRequestRegistry = {
  nextGeneration: number;
  hydratedUserIds: Set<string>;
  latestGenerationByUserId: Map<string, number>;
  inFlightGenerationByUserId: Map<string, number>;
};

export function createProfileHydrationRequestRegistry(): ProfileHydrationRequestRegistry {
  return {
    nextGeneration: 0,
    hydratedUserIds: new Set(),
    latestGenerationByUserId: new Map(),
    inFlightGenerationByUserId: new Map(),
  };
}

export function beginProfileHydrationRequest(
  registry: ProfileHydrationRequestRegistry,
  rawUserIds: readonly string[],
  options: { force?: boolean } = {},
): ProfileHydrationRequest | null {
  const uniqueUserIds = Array.from(new Set(
    rawUserIds.map((userId) => userId.trim()).filter(Boolean),
  ));
  const userIds = options.force
    ? uniqueUserIds
    : uniqueUserIds.filter((userId) => (
        !registry.hydratedUserIds.has(userId) &&
        !registry.inFlightGenerationByUserId.has(userId)
      ));
  if (userIds.length === 0) return null;

  const generation = (registry.nextGeneration += 1);
  for (const userId of userIds) {
    registry.latestGenerationByUserId.set(userId, generation);
    registry.inFlightGenerationByUserId.set(userId, generation);
  }
  return { generation, userIds };
}

export function finishProfileHydrationRequest(
  registry: ProfileHydrationRequestRegistry,
  request: ProfileHydrationRequest,
  options: { successful: boolean },
): Set<string> {
  const currentUserIds = new Set<string>();
  for (const userId of request.userIds) {
    if (registry.latestGenerationByUserId.get(userId) !== request.generation) continue;
    currentUserIds.add(userId);
    if (registry.inFlightGenerationByUserId.get(userId) === request.generation) {
      registry.inFlightGenerationByUserId.delete(userId);
    }
    if (options.successful) registry.hydratedUserIds.add(userId);
  }
  return currentUserIds;
}
