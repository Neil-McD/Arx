import { WebCommunityNavSurface } from "./WebCommunityNavSurface";
import type { WebCommunityShellProps } from "./webShellChromeShared";

type WebMobileCommunityHomeProps = {
  communityShell: WebCommunityShellProps;
};

export function WebMobileCommunityHome({
  communityShell,
}: WebMobileCommunityHomeProps) {
  return (
    <main className="mobile-community-home" aria-label="Community home">
      <WebCommunityNavSurface
        communityShell={communityShell}
        presentation="mobile-home"
      />
    </main>
  );
}
