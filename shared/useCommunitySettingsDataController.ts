import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityPricingMode = "free" | "monthly" | "yearly" | "both";

type CommunityMemberSettingsRow = {
  muted: boolean;
};

type CommunityPricingRow = {
  billing_period: string;
  plan_id: string;
  amount_base_units: number | string;
  currency: string;
  currency_decimals: number;
};

type UseCommunitySettingsDataControllerArgs<SessionT extends SessionLike> = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;

  communitySettingsLoadedCommunityIdRef: MutableRefObject<string | null>;
  communityPricingDirtyRef: MutableRefObject<boolean>;

  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
  setIsLoadingCommunityMemberSettings: Dispatch<SetStateAction<boolean>>;
  setCommunityMemberSettingsError: Dispatch<SetStateAction<string | null>>;

  setCommunitySettingsMonthlyPlanId: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsYearlyPlanId: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsPricingMode: Dispatch<SetStateAction<CommunityPricingMode>>;
  setCommunitySettingsPriceUsdMonthly: Dispatch<SetStateAction<string>>;
  setCommunitySettingsPriceUsdYearly: Dispatch<SetStateAction<string>>;
};

function formatPlanAmount(row: CommunityPricingRow | null): string {
  if (!row) return "";
  const decimals = Number(row.currency_decimals ?? 2) || 2;
  const major = Number(row.amount_base_units ?? 0) / Math.pow(10, decimals);
  return Number.isFinite(major) ? major.toFixed(decimals).replace(/\.?0+$/, "") : "";
}

export function useCommunitySettingsDataController<SessionT extends SessionLike>(
  args: UseCommunitySettingsDataControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityMemberSettings = useCallback(async (params: { communityId: string; session: SessionT }) => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) {
      current.setCommunityMemberMuted(false);
      return;
    }

    current.setIsLoadingCommunityMemberSettings(true);
    current.setCommunityMemberSettingsError(null);
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/community_member_settings?select=community_id,user_id,muted,muted_until,created_at,updated_at&community_id=eq.${encodeURIComponent(
          params.communityId,
        )}&user_id=eq.${encodeURIComponent(params.session.user.id)}&limit=1`,
        { method: "GET" },
        params.session,
      );
      if (!response.ok) {
        current.setCommunityMemberMuted(false);
        return;
      }
      const rows = (await response.json()) as CommunityMemberSettingsRow[];
      const row = rows[0];
      current.setCommunityMemberMuted(Boolean(row?.muted));
    } catch {
      current.setCommunityMemberMuted(false);
    } finally {
      current.setIsLoadingCommunityMemberSettings(false);
    }
  }, []);

  const loadCommunityPricing = useCallback(
    async (params: { communityId: string; session: SessionT; shouldIgnore?: () => boolean }) => {
      const current = argsRef.current;
      const url = current.getSupabaseUrl();
      if (!url) return;

      try {
        const response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_community_pricing`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: params.communityId }),
          },
          params.session,
        );
        if (!response.ok) return;

        const rows = (await response.json()) as CommunityPricingRow[];
        if (params.shouldIgnore?.()) return;
        if (current.communitySettingsLoadedCommunityIdRef.current !== params.communityId) return;
        if (current.communityPricingDirtyRef.current) return;

        const monthly = rows.find((row) => row.billing_period === "monthly") ?? null;
        const yearly = rows.find((row) => row.billing_period === "yearly") ?? null;
        current.setCommunitySettingsMonthlyPlanId(monthly?.plan_id ?? null);
        current.setCommunitySettingsYearlyPlanId(yearly?.plan_id ?? null);
        current.setCommunitySettingsPriceUsdMonthly(formatPlanAmount(monthly));
        current.setCommunitySettingsPriceUsdYearly(formatPlanAmount(yearly));
        current.setCommunitySettingsPricingMode(monthly && yearly ? "both" : monthly ? "monthly" : yearly ? "yearly" : "free");
      } catch {
        // ignore
      }
    },
    [],
  );

  return {
    loadCommunityMemberSettings,
    loadCommunityPricing,
  };
}
