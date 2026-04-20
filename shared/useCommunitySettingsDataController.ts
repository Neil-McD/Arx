import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import {
  fetchCloudCommunityMemberSettingsRow,
  listCloudCommunityPricePointRows,
} from "./cloudCommunityAdminGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityPricingMode = "free" | "monthly" | "annual";

type CommunityMemberSettingsRow = {
  muted: boolean;
};

type CommunityPricingRow = {
  billing_period: string;
  amount_base_units: number | string;
  currency: string;
  currency_decimals: number;
};

type UseCommunitySettingsDataControllerArgs<SessionT extends SessionLike> = {
  ensureSession?: EnsureSessionFn<SessionT>;
  communitySettingsLoadedCommunityIdRef: MutableRefObject<string | null>;
  communityPricingDirtyRef: MutableRefObject<boolean>;

  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
  setIsLoadingCommunityMemberSettings: Dispatch<SetStateAction<boolean>>;
  setCommunityMemberSettingsError: Dispatch<SetStateAction<string | null>>;

  setCommunitySettingsPricingMode: Dispatch<SetStateAction<CommunityPricingMode>>;
  setCommunitySettingsPriceUsdMonthly: Dispatch<SetStateAction<string>>;
  setCommunitySettingsPriceUsdAnnual: Dispatch<SetStateAction<string>>;
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
    const usableSession = await resolveUsableSession(params.session, current.ensureSession);
    if (!usableSession) return;
    current.setIsLoadingCommunityMemberSettings(true);
    current.setCommunityMemberSettingsError(null);
    try {
      const row = await fetchCloudCommunityMemberSettingsRow<SessionT, CommunityMemberSettingsRow>({
        session: usableSession,
        communityId: params.communityId,
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
      const usableSession = await resolveUsableSession(params.session, current.ensureSession);
      if (!usableSession) return;
      try {
        const rows = await listCloudCommunityPricePointRows<SessionT, CommunityPricingRow>({
          session: usableSession,
          communityId: params.communityId,
        });
        if (params.shouldIgnore?.()) return;
        if (current.communitySettingsLoadedCommunityIdRef.current !== params.communityId) return;
        if (current.communityPricingDirtyRef.current) return;

        const monthly = rows.find((row) => row.billing_period === "monthly") ?? null;
        const annual = rows.find((row) => row.billing_period === "annual") ?? null;
        current.setCommunitySettingsPriceUsdMonthly(formatPlanAmount(monthly));
        current.setCommunitySettingsPriceUsdAnnual(formatPlanAmount(annual));
        current.setCommunitySettingsPricingMode(monthly ? "monthly" : annual ? "annual" : "free");
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
