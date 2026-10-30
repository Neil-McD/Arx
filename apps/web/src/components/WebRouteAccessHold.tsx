import { useEffect, useState, type ComponentProps } from "react";

import { WebAppMainSurfaceFallback } from "./WebAppMainSurfaceFallback";
import { WebShellChromeHost } from "./WebShellChromeHost";
import { readCommunityBootLook } from "../controllers/communityBootLook";

type WebShellChromeHostProps = ComponentProps<typeof WebShellChromeHost>;

/**
 * Keeps route admission fail-closed without replacing the product frame.
 *
 * The shell projection is reduced to non-sensitive geometry before render,
 * and the whole frame stays inert until authorization has resolved. A delayed
 * status explains healthy work without flashing during fast loads;
 * a real verification failure exposes the explicit recovery action.
 */
export function WebRouteAccessHold(props: {
  shellChromeHostProps: Omit<
    WebShellChromeHostProps,
    "mainSurface" | "globalOverlays"
  >;
  mainSurfaceHostProps: ComponentProps<typeof WebAppMainSurfaceFallback>;
  error: string | null;
  errorMessage?: string;
  onRetry: () => void;
}) {
  const [showProgress, setShowProgress] = useState(false);
  // A community visited before opens in its own colours and name (index.html).
  const [bootLook] = useState(() => readCommunityBootLook());
  const shellChromeHostProps = props.shellChromeHostProps;
  const mobileTopBarProps = shellChromeHostProps.mobileTopBarProps;
  const communityShell = shellChromeHostProps.communityShell;

  useEffect(() => {
    if (props.error) {
      setShowProgress(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setShowProgress(true), 500);
    return () => window.clearTimeout(timeoutId);
  }, [props.error]);

  const heldShellChromeHostProps: Omit<
    WebShellChromeHostProps,
    "mainSurface" | "globalOverlays"
  > = {
    ...shellChromeHostProps,
    mobileOverlay: null,
    mobileTopBarProps: {
      ...mobileTopBarProps,
      activeCommunityId: null,
      activeCommunityVisualIdentity: null,
      activeCommunityName: null,
      activeCommunityAvatarUrl: null,
      activeCommunityAvatarFocusX: null,
      activeCommunityAvatarFocusY: null,
      activeCommunityAvatarZoom: null,
      activeCommunityAttentionCount: 0,
      canViewMembers: false,
      memberFaces: [],
      memberCount: null,
    },
    desktopHeader: {
      ...shellChromeHostProps.desktopHeader,
      hasBackTargetSnapshot: false,
      backTargetLabel: null,
      directMessagesButton: null,
    },
    communityShell: {
      ...communityShell,
      mobileOverlay: null,
      activeCommunity: null,
      communityTabIndicators: {},
      communityChannels: [],
      isLoadingCommunityChannels: true,
      communityChannelIndicators: {},
      canViewMembersActiveCommunity: false,
      activeCommunityMemberCount: null,
      canViewActiveCommunitySettings: false,
      canManageMembersActiveCommunity: false,
      canViewActiveCommunityAnalytics: false,
      isLoadingCommunityAccess: true,
      canOpenDirectMessages: false,
      directMessagesUnreadCount: 0,
      communities: [],
      railCommunities: [],
      communityRailAttentionById: {},
      isLoadingCommunities: true,
      selectedActiveCommunitySlug: null,
      canReorderCommunities: false,
      draggingCommunityId: null,
    },
  };

  return (
    <div className="web-route-access-hold" aria-busy={!props.error}>
      <div
        className="web-route-access-hold-frame"
        ref={(node) => {
          if (node) node.inert = true;
        }}
        aria-hidden="true"
      >
        <WebShellChromeHost
          {...heldShellChromeHostProps}
          mainSurface={(
            <WebAppMainSurfaceFallback
              {...props.mainSurfaceHostProps}
              quiet
            />
          )}
          globalOverlays={null}
        />
      </div>

      {props.error ? (
        <div className="web-route-access-hold-failure" role="alert">
          <p>{props.errorMessage ?? "Polynet could not finish verifying your session."}</p>
          <button type="button" onClick={props.onRetry}>
            Try again
          </button>
        </div>
      ) : showProgress ? (
        bootLook ? (
          <div className="web-route-access-hold-community" role="status" aria-live="polite">
            {bootLook.logo ? <img src={bootLook.logo} alt="" /> : null}
            <p>Opening {bootLook.name}…</p>
          </div>
        ) : (
          <p className="web-route-access-hold-progress" role="status" aria-live="polite">
            Opening Polynet…
          </p>
        )
      ) : null}
    </div>
  );
}
