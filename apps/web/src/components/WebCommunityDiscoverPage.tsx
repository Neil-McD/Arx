import type { DiscoverCommunitySnapshot } from "../../../../shared/communityTypes";
import { KitDiscover, type DiscoverJoined } from "../v1/KitDiscover";
import { CommunityPageHeader } from "./CommunityPageHeader";

export type WebCommunityDiscoverPageProps = {
  joined: DiscoverJoined[];
  onOpenCommunity: (community: DiscoverCommunitySnapshot) => void;
  onOpenJoined: (slug: string) => void;
  onStartCommunity: () => void;
};

// Discover as a page (docs/specs/discover-v1.md): inside the community you
// are in (/c/:slug/discover), in that community's frame, or on its own for
// someone in no community yet. No right panel. Search, when there is enough
// to search, sits in the page's header.
export function WebCommunityDiscoverPage(props: WebCommunityDiscoverPageProps) {
  return (
    <div className="community-panel community-discover-panel">
      <KitDiscover
        {...props}
        renderHeader={(search) => (
          <CommunityPageHeader title="Discover" actions={search}>
            <div className="resources-header">Discover</div>
          </CommunityPageHeader>
        )}
      />
    </div>
  );
}
