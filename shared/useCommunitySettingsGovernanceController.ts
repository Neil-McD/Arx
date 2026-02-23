import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunitySettingsSaveRow = {
  community_id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  updated_at: string;
  monthly_plan_id: string | null;
  yearly_plan_id: string | null;
};
type UseCommunitySettingsGovernanceControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  supabaseSession: SessionT | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  confirmAction: (message: string) => boolean;
  loadCommunities: (session: SessionT) => Promise<void>;
  onLeaveCommunityLocalState: (leavingCommunityId: string) => void;

  setCommunityMemberSettingsError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingCommunityMemberSettings: Dispatch<SetStateAction<boolean>>;
  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
  setIsLeavingCommunity: Dispatch<SetStateAction<boolean>>;

  communitySettingsName: string;
  communitySettingsSlug: string;
  communitySettingsDescription: string;
  communitySettingsVisibility: string;
  communitySettingsAvatarUrl: string | null;
  communitySettingsBannerUrl: string | null;
  communitySettingsPricingMode: string;
  communitySettingsPriceUsdMonthly: string;
  communitySettingsPriceUsdYearly: string;
  isValidCommunitySlug: (slug: string) => boolean;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setIsSavingCommunitySettings: Dispatch<SetStateAction<boolean>>;
  onSaveCommunitySettingsSuccess: (result: CommunitySettingsSaveRow) => void;
};

function parsePriceBaseUnits(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Prices must be positive numbers.");
  }
  return Math.round(parsed * 100);
}

export function useCommunitySettingsGovernanceController<SessionT extends SessionLike>(
  args: UseCommunitySettingsGovernanceControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const handleToggleCommunityMute = useCallback(async (nextMuted: boolean) => {
    const current = argsRef.current;
    const session = current.supabaseSession;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    const url = current.getSupabaseUrl();
    if (!url) return;

    current.setCommunityMemberSettingsError(null);
    current.setIsLoadingCommunityMemberSettings(true);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_member_settings?on_conflict=community_id,user_id`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify({
            community_id: communityId,
            user_id: session.user.id,
            muted: nextMuted,
            muted_until: null,
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      current.setCommunityMemberMuted(nextMuted);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update settings.";
      current.setCommunityMemberSettingsError(message);
    } finally {
      current.setIsLoadingCommunityMemberSettings(false);
    }
  }, []);

  const handleLeaveCommunity = useCallback(async () => {
    const current = argsRef.current;
    const session = current.supabaseSession;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    const confirmed = current.confirmAction("Leave this community? You will lose access immediately.");
    if (!confirmed) return;

    const url = current.getSupabaseUrl();
    if (!url) return;

    current.setCommunityMemberSettingsError(null);
    current.setIsLeavingCommunity(true);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/leave_community`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: communityId }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      current.onLeaveCommunityLocalState(communityId);
      await current.loadCommunities(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to leave community.";
      current.setCommunityMemberSettingsError(message);
    } finally {
      current.setIsLeavingCommunity(false);
    }
  }, []);

  const handleSaveCommunitySettings = useCallback(async () => {
    const current = argsRef.current;
    const session = current.supabaseSession;
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    current.setCommunitySettingsError(null);
    current.setIsSavingCommunitySettings(true);

    const url = current.getSupabaseUrl();
    if (!url) {
      current.setCommunitySettingsError("Missing Supabase URL.");
      current.setIsSavingCommunitySettings(false);
      return;
    }

    const name = current.communitySettingsName.trim();
    const slug = current.communitySettingsSlug.trim().toLowerCase();
    if (!name || !slug) {
      current.setCommunitySettingsError("Name and slug are required.");
      current.setIsSavingCommunitySettings(false);
      return;
    }
    if (!current.isValidCommunitySlug(slug)) {
      current.setCommunitySettingsError("Slug must be 3–32 characters (letters, numbers, hyphens).");
      current.setIsSavingCommunitySettings(false);
      return;
    }

    const rawVisibility = String(current.communitySettingsVisibility ?? "")
      .trim()
      .toLowerCase();
    if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) {
      current.setCommunitySettingsError("Visibility must be published or unlisted.");
      current.setIsSavingCommunitySettings(false);
      return;
    }
    const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");

    try {
      const monthlyEnabled =
        current.communitySettingsPricingMode === "monthly" || current.communitySettingsPricingMode === "both";
      const yearlyEnabled =
        current.communitySettingsPricingMode === "yearly" || current.communitySettingsPricingMode === "both";
      const monthlyAmount = monthlyEnabled ? parsePriceBaseUnits(current.communitySettingsPriceUsdMonthly) : null;
      const yearlyAmount = yearlyEnabled ? parsePriceBaseUnits(current.communitySettingsPriceUsdYearly) : null;
      if (monthlyEnabled && monthlyAmount == null) throw new Error("Enter a monthly price.");
      if (yearlyEnabled && yearlyAmount == null) throw new Error("Enter an annual price.");

      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/save_community_settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: communityId,
            p_name: name,
            p_slug: slug,
            p_description: current.communitySettingsDescription.trim() || null,
            p_avatar_url: current.communitySettingsAvatarUrl?.trim() || null,
            p_banner_url: current.communitySettingsBannerUrl?.trim() || null,
            p_visibility: visibility,
            p_monthly_amount_base_units: monthlyAmount,
            p_yearly_amount_base_units: yearlyAmount,
            p_currency: "usd",
            p_currency_decimals: 2,
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));

      const rows = (await response.json()) as CommunitySettingsSaveRow[];
      const result = rows[0];
      if (result?.community_id) {
        current.onSaveCommunitySettingsSuccess({
          ...result,
          visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
        });
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save settings.";
      current.setCommunitySettingsError(message);
    } finally {
      current.setIsSavingCommunitySettings(false);
    }
  }, []);

  return {
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
  };
}
