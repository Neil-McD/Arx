import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  clearBuilderBillingQueryParams,
  parseBuilderBillingReturn,
  type BuilderBillingReturn,
} from "../../../../shared/builderBilling";

type PublicRouteLike = {
  kind: string;
};

export function useWebRouteHashLifecycle<
  PublicRouteT extends PublicRouteLike,
  PageT extends string,
  ViewT extends string,
  SettingsPageT extends string,
  CommunityTabT extends string,
>(params: {
  publicRouteKind: PublicRouteT["kind"];
  activePage: PageT;
  activeView: ViewT;
  settingsPage: SettingsPageT;
  activeCommunityId: string | null;
  communityTab: CommunityTabT;
  activeThreadId: string | null;
  workspaceWantsNewChat: boolean;
  threadsHydratedRef: MutableRefObject<boolean>;
  setPublicRoute: Dispatch<SetStateAction<PublicRouteT>>;
  setBuilderBillingReturn: Dispatch<SetStateAction<BuilderBillingReturn | null>>;
  setFinalizeCreateCommunityError: Dispatch<SetStateAction<string | null>>;
  readPublicRouteFromLocation: () => PublicRouteT;
  buildAppRouteHash: (state: {
    page: PageT;
    view: ViewT;
    settingsPage: SettingsPageT;
    communityId: string | null;
    communityTab: CommunityTabT;
    threadToken?: string | null;
  }) => string;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const billingReturn = parseBuilderBillingReturn(url.searchParams);
    if (!billingReturn) return;

    params.setFinalizeCreateCommunityError(null);
    params.setBuilderBillingReturn(billingReturn);

    clearBuilderBillingQueryParams(url.searchParams);
    url.searchParams.delete("draft_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    params.setPublicRoute(params.readPublicRouteFromLocation());
  }, []);

  useEffect(() => {
    const handlePopState = () => params.setPublicRoute(params.readPublicRouteFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (params.publicRouteKind !== "app") return;

    const url = new URL(window.location.href);
    const threadToken =
      params.activeThreadId ?? (params.workspaceWantsNewChat || params.threadsHydratedRef.current ? "new" : null);
    const nextHash = params.buildAppRouteHash({
      page: params.activePage,
      view: params.activeView,
      settingsPage: params.settingsPage,
      communityId: params.activeCommunityId,
      communityTab: params.communityTab,
      threadToken,
    });

    if (url.hash === nextHash) return;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${nextHash}`);
  }, [
    params.publicRouteKind,
    params.activePage,
    params.activeView,
    params.settingsPage,
    params.activeCommunityId,
    params.communityTab,
    params.activeThreadId,
    params.workspaceWantsNewChat,
  ]);
}
