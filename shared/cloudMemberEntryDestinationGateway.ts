import { type AuthSessionLike } from "./authSession";
import {
  APP_ADMISSION_TIMEOUT_MS,
  withAsyncDeadline,
} from "./asyncDeadline";
import {
  bootstrapGatewayAuthContextIfAvailable,
  readGatewayConvexIdMaybe,
} from "./cloudGateway";

export type CloudMemberEntryDestination =
  | {
      page: "community";
      reason: string;
      community_id: string;
      community_slug: string;
      community_name: string | null;
    }
  | {
      page: "discover";
      reason: string;
      community_id: null;
      community_slug: null;
      community_name: null;
    };

export async function resolveCloudMemberEntryDestination<SessionT extends AuthSessionLike>(params: {
  session: SessionT;
  communityId?: string | null;
  communitySlug?: string | null;
}): Promise<CloudMemberEntryDestination | null> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const communityId = readGatewayConvexIdMaybe(params.communityId);
  const communitySlug = String(params.communitySlug ?? "").trim();
  return (await withAsyncDeadline(
    client.action("memberEntryDestination:resolveMemberEntryDestination" as any, {
      authSubject,
      ...(communityId ? { communityId } : {}),
      ...(communitySlug ? { communitySlug } : {}),
    }),
    {
      timeoutMs: APP_ADMISSION_TIMEOUT_MS,
      code: "member_entry_destination_timeout",
    },
  )) as CloudMemberEntryDestination;
}
