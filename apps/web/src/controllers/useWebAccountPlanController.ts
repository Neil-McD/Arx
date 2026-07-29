import { useCallback, useMemo, useState } from "react";

import type { AuthSession } from "../auth";
import {
  formatWorkspaceBillingCheckoutError,
} from "../../../../shared/appErrorMappings";
import {
  type AccountCommerceStatus,
  setDevAccountTierCanonical,
} from "../../../../shared/accountCommerceStatusGateway";
import { startCloudPremiumSubscriptionCheckout } from "../../../../shared/cloudAccountCommerceGateway";
import { resolveUserAccessPolicy } from "../../../../shared/capabilities";
import { canUseCreatorDevTierOverride } from "../../../../shared/devTierOverride";
import { captureProductAnalyticsEvent } from "../posthogAnalytics";
import { buildPremiumSubscriptionReturnUrl } from "../webAppRuntime";

type UseWebAccountPlanControllerParams = {
  session: AuthSession | null;
  accountCommerceStatus: AccountCommerceStatus | null;
  ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  requireSignIn: () => void;
  loadAccountCommerceStatus: (session: AuthSession) => Promise<unknown>;
  setIsSettingDevAccountTier: (value: boolean) => void;
  setDevAccountTierError: (value: string | null) => void;
};

export function useWebAccountPlanController(
  params: UseWebAccountPlanControllerParams,
) {
  const [isFreeAccountInfoOpen, setIsFreeAccountInfoOpen] = useState(false);

  const canUseDevTierOverride = useMemo(
    () =>
      canUseCreatorDevTierOverride({
        email: params.session?.user?.email ?? null,
        isDev: import.meta.env.DEV,
        featureFlag: import.meta.env.VITE_ENABLE_DEV_TIER_OVERRIDE,
      }),
    [params.session?.user?.email],
  );

  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: params.session ? "authenticated" : "anonymous",
        accountTier: params.accountCommerceStatus?.account_tier ?? null,
        userEmail: params.session?.user?.email ?? null,
      }),
    [
      params.accountCommerceStatus?.account_tier,
      params.session,
    ],
  );

  const setDevAccountTier = useCallback(
    async (tier: "free" | "architect"): Promise<void> => {
      const session = await params.ensureSession();
      if (!session || !canUseDevTierOverride) return;
      params.setIsSettingDevAccountTier(true);
      params.setDevAccountTierError(null);
      try {
        await setDevAccountTierCanonical({ session, tier });
        await params.loadAccountCommerceStatus(session);
      } catch (error) {
        params.setDevAccountTierError(
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to set dev account tier.",
        );
      } finally {
        params.setIsSettingDevAccountTier(false);
      }
    },
    [
      canUseDevTierOverride,
      params.ensureSession,
      params.loadAccountCommerceStatus,
      params.setDevAccountTierError,
      params.setIsSettingDevAccountTier,
    ],
  );

  const startPremiumSubscriptionCheckout = useCallback(
    async (): Promise<void> => {
      const session = await params.ensureSession();
      if (!session) {
        params.requireSignIn();
        return;
      }
      try {
        const returnUrl = buildPremiumSubscriptionReturnUrl();
        const data = await startCloudPremiumSubscriptionCheckout({
          session,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
        });
        const checkoutUrl =
          data &&
          typeof data === "object" &&
          typeof (data as { checkout_url?: unknown }).checkout_url === "string"
            ? String(
                (data as { checkout_url?: unknown }).checkout_url,
              ).trim()
            : "";
        if (!checkoutUrl) throw new Error("Missing checkout_url.");
        captureProductAnalyticsEvent(
          "premium subscription checkout started",
          { surface: "settings_billing" },
        );
        window.location.assign(checkoutUrl);
      } catch (error) {
        throw new Error(
          formatWorkspaceBillingCheckoutError(error, {
            kind: "premium_subscription",
          }),
        );
      }
    },
    [params.ensureSession, params.requireSignIn],
  );

  return {
    isFreeAccountInfoOpen,
    setIsFreeAccountInfoOpen,
    openFreeAccountInfo: () => setIsFreeAccountInfoOpen(true),
    canUseDevTierOverride,
    userAccessPolicy,
    setDevAccountTier,
    startPremiumSubscriptionCheckout,
  };
}
