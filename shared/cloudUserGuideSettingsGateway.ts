import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type UserGlobalGuideSettingsView = {
  soul_md: string;
  soul_is_default: boolean;
  soul_updated_at: number | null;
  soul_max_chars: number;
  allow_post: boolean;
  allow_message: boolean;
  legacy_post_count?: number;
  legacy_message_count?: number;
  coach_muted: boolean;
};

export async function getCloudMyGlobalGuideSettings<SessionT>(params: {
  session: SessionT;
}): Promise<UserGlobalGuideSettingsView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query("userGuideSettings:getMyGlobalGuideSettings" as any, {
    authSubject,
  })) as UserGlobalGuideSettingsView;
}

export async function saveCloudMyGlobalGuideSettings<SessionT>(params: {
  session: SessionT;
  soulMd?: string | null;
  allowPost?: boolean;
  allowMessage?: boolean;
  coachMuted?: boolean;
}): Promise<UserGlobalGuideSettingsView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation("userGuideSettings:saveMyGlobalGuideSettings" as any, {
    authSubject,
    ...(params.soulMd !== undefined ? { soulMd: params.soulMd } : {}),
    ...(typeof params.allowPost === "boolean" ? { allowPost: params.allowPost } : {}),
    ...(typeof params.allowMessage === "boolean" ? { allowMessage: params.allowMessage } : {}),
    ...(typeof params.coachMuted === "boolean" ? { coachMuted: params.coachMuted } : {}),
  })) as UserGlobalGuideSettingsView;
}
