// Chat posts written before Oct 18, 2026 store this retired actor type. They read as
// the community agent acting for that member; the rows are rewritten in the
// table-drop release.
export const RETIRED_PERSONAL_AGENT_ACTOR_TYPE = "personal_agent" as const;
export type StoredInteractionActorType = "human" | typeof RETIRED_PERSONAL_AGENT_ACTOR_TYPE | "community_agent" | "system";

export function presentInteractionActorType(actorType: StoredInteractionActorType): "human" | "community_agent" | "system" {
  return actorType === RETIRED_PERSONAL_AGENT_ACTOR_TYPE ? "community_agent" : actorType;
}
