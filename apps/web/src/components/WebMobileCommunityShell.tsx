import { Settings } from "lucide-react";
import { CommunitySwitcherMenu } from "../../../../shared/CommunitySwitcherMenu";
import { WebMobileBottomRail } from "./WebMobileBottomRail";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileCommunityShellProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileCommunityShell(props: WebMobileCommunityShellProps) {
  const { communityShell } = props;

  if (!communityShell.showMobileShell) return null;

  return (
    <>
      {communityShell.mobileOverlay === "community_selector" ? (
        <div className="mobile-community-menu-shell" aria-hidden={false}>
          <button
            type="button"
            className="mobile-community-menu-backdrop"
            aria-label="Close communities menu"
            onClick={() => communityShell.setMobileOverlay(null)}
          />
          <div className="mobile-community-menu">
            <CommunitySwitcherMenu
              presentation="mobile"
              communities={communityShell.railCommunities}
              selectedCommunitySlug={communityShell.selectedActiveCommunitySlug}
              attentionByCommunityId={communityShell.communityRailAttentionById}
              isLoading={communityShell.isLoadingCommunities}
              onOpenDiscover={communityShell.onOpenDiscover}
              onOpenCreate={communityShell.onOpenMobileCreateCommunity}
              onSelectCommunity={(community) => {
                const selected =
                  communityShell.onSelectActiveCommunity(community);
                if (!selected) return false;
                const nextCommunitySlug = String(community.slug ?? "").trim();
                if (nextCommunitySlug) {
                  communityShell.onOpenCommunityHome(nextCommunitySlug);
                }
                return true;
              }}
              onDismiss={() => communityShell.setMobileOverlay(null)}
              supplementalActions={[
                {
                  id: "settings",
                  label: "Settings",
                  icon: <Settings size={18} strokeWidth={1.8} />,
                  onSelect: communityShell.onOpenGlobalSettings,
                },
              ]}
            />
          </div>
        </div>
      ) : null}

      <WebMobileBottomRail communityShell={communityShell} />
    </>
  );
}
