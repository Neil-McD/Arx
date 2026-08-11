import { WebCommunityNavSurface } from "./WebCommunityNavSurface";
import { WebCommunityRail } from "./WebCommunityRail";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileCommunityHomeProps = {
  communityShell: WebCommunityShellProps;
  hasCommunityRail: boolean;
};

export function WebMobileCommunityHome({
  communityShell,
  hasCommunityRail,
}: WebMobileCommunityHomeProps) {
  return (
    <main
      className={`mobile-community-home${hasCommunityRail ? " has-community-rail" : ""}`}
      aria-label="Community home"
    >
      {hasCommunityRail ? (
        <WebCommunityRail communityShell={communityShell} presentation="mobile-home" />
      ) : null}
      <section className="mobile-community-home-surface">
        <WebCommunityNavSurface
          communityShell={communityShell}
          presentation="mobile-home"
        />
      </section>
    </main>
  );
}
