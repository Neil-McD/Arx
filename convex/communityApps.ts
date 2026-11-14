// Whether a community's agent answers, as its landing page and the agent show
// it. (This module held community sites' sign-in, sessions and identity; those
// went with the sites, Nov 13.)
import { readCanonicalCommunityAgentContext } from "./communityAgentContext";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";

// Its owner hasn't turned it off, and an Agent plan (or the operator) pays for it.
export async function communityAgentIsOn(ctx: any, communityId: any): Promise<boolean> {
  const agent = await readCanonicalCommunityAgentContext(ctx, communityId);
  if (!agent?.agentEnabled) return false;
  return (await resolveCommunityInferenceFundingAdmission(ctx, communityId)).ok;
}
