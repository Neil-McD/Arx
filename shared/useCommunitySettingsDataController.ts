import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  fetchCloudCommunityMemberSettingsRow,
  listCloudCommunityPricingRows,
} from "./cloudCommunityAdminGateway";

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

type UseCommunitySettingsDataControllerArgs = {
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
  args: UseCommunitySettingsDataControllerArgs,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityMemberSettings = useCallback(async (params: { communityId: string; session: SessionT }) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityMemberSettings(true);
    current.setCommunityMemberSettingsError(null);
    try {
      const row = await fetchCloudCommunityMemberSettingsRow<SessionT, CommunityMemberSettingsRow>({
        session: params.session,
        communityId: params.communityId,
        userId: params.session.user.id,
      });
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
      try {
        const rows = await listCloudCommunityPricingRows<SessionT, CommunityPricingRow>({
          session: params.session,
          communityId: params.communityId,
        });
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
