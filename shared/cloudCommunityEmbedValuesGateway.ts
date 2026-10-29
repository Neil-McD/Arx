import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityEmbedStorage } from "./communityEmbed";

/**
 * Widget answers kept per member on the server, so they follow the member
 * across devices. The fallback is this member's own copy in this browser (scope
 * it by member, never only by community). A save the server didn't take is kept
 * there, marked unsent, and sent the next time the widget loads.
 */
export function createServerCommunityEmbedStorage<SessionT>(params: {
  communityId: string;
  ensureSession: () => Promise<SessionT | null>;
  fallback: CommunityEmbedStorage;
}): CommunityEmbedStorage {
  const client = async () => {
    const session = await params.ensureSession();
    if (!session) throw new Error("auth_session_required");
    return bootstrapConvexAuthenticatedClient(session);
  };
  const communityId = params.communityId as Id<"communities">;
  const { fallback } = params;
  // Widget keys are short names; this suffix can't be one of them.
  const unsent = (key: string) => `${key}\u0000unsent`;
  return {
    async load(key) {
      try {
        const { client: convex, authSubject } = await client();
        const local = await fallback.load(key);
        if (local !== null && (await fallback.load(unsent(key))) === "1") {
          await convex.mutation(api.communityEmbedValues.saveOwnEmbedValue, { authSubject, communityId, key, value: local });
          await fallback.save(unsent(key), "0");
          return local;
        }
        const value = await convex.query(api.communityEmbedValues.getOwnEmbedValue, { authSubject, communityId, key });
        if (value !== null) {
          if (value !== local) await fallback.save(key, value);
          return value;
        }
        if (local !== null) await convex.mutation(api.communityEmbedValues.saveOwnEmbedValue, { authSubject, communityId, key, value: local }).catch(() => null);
        return local;
      } catch {
        return fallback.load(key);
      }
    },
    async save(key, value) {
      const kept = await fallback.save(key, value);
      try {
        const { client: convex, authSubject } = await client();
        await convex.mutation(api.communityEmbedValues.saveOwnEmbedValue, { authSubject, communityId, key, value });
        await fallback.save(unsent(key), "0");
        return true;
      } catch {
        if (kept) await fallback.save(unsent(key), "1");
        return kept;
      }
    },
  };
}
