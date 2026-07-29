import { useCallback } from "react";

import {
  clearAuthResumeState,
  readAuthResumeState,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import { routePendingAuthIntent } from "../../../../shared/authResumeRouter";
import type {
  CreateCommunityIntentDraft,
} from "../../../../shared/createCommunityIntent";
import type { AuthSession } from "../auth";

export function persistWebCreateCommunityIntent(
  draft: CreateCommunityIntentDraft,
): void {
  storeAuthResumeState({
    intent: {
      reason: "create_community",
      payload: { draft },
    },
  });
}

export function useWebPendingAuthIntentController(params: {
  session: AuthSession | null;
  resolveAndEnterMemberDestination: (options: {
    replace: true;
  }) => Promise<boolean>;
  navigateTo: (
    path: string,
    options?: { replace?: boolean },
  ) => void;
  connectChatgpt: () => void;
  openAccountSettings: () => void;
  showToast: (message: string) => void;
  openCreateCommunity: (
    draft: CreateCommunityIntentDraft | null,
  ) => void;
  redeemPurchaseClaim: (token: string) => Promise<unknown>;
  joinPublicCommunity: (value: {
    communityId?: string;
    communitySlug?: string;
  }) => Promise<unknown>;
  redeemPendingPurchases: (value: {
    navigate: boolean;
    silentNoop: boolean;
  }) => Promise<unknown>;
  routeTryPolynetFree: (session: AuthSession) => unknown;
}) {
  const resumePendingAuthIntent = useCallback((): void => {
    if (!params.session) return;
    const intent = readAuthResumeState()?.intent;
    if (!intent) return;
    clearAuthResumeState();
    routePendingAuthIntent(intent, {
      select_model: () => undefined,
      open_workspace_draft: () => {
        void params
          .resolveAndEnterMemberDestination({ replace: true })
          .then((entered) => {
            if (!entered) {
              params.navigateTo("/discover", { replace: true });
            }
          });
      },
      connect_provider: (payload) => {
        if (payload.provider === "chatgpt") {
          params.connectChatgpt();
          return;
        }
        if (payload.provider === "openai") {
          params.openAccountSettings();
          params.showToast(
            "Paste your OpenAI API key in Account settings.",
          );
          return;
        }
        params.showToast("Provider connection is not available.");
      },
      create_community: (payload) => {
        params.openCreateCommunity(payload.draft);
      },
      redeem_purchase_claim: (payload) => {
        void params.redeemPurchaseClaim(payload.token);
      },
      join_public_community: (payload) => {
        void params.joinPublicCommunity({
          communityId: payload.community_id ?? undefined,
          communitySlug: payload.community_slug ?? undefined,
        });
      },
      redeem_pending_purchases: (payload) => {
        void params.redeemPendingPurchases({
          navigate: payload.navigate,
          silentNoop: payload.silent_noop,
        });
      },
      try_polynet_free: () => {
        void params.routeTryPolynetFree(params.session as AuthSession);
      },
    });
  }, [
    params.connectChatgpt,
    params.joinPublicCommunity,
    params.navigateTo,
    params.openAccountSettings,
    params.openCreateCommunity,
    params.redeemPendingPurchases,
    params.redeemPurchaseClaim,
    params.resolveAndEnterMemberDestination,
    params.routeTryPolynetFree,
    params.session,
    params.showToast,
  ]);

  return { resumePendingAuthIntent };
}
