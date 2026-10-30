import { createContext, useContext } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { DEFAULT_COMMUNITY_LAYOUT, type CommunityLayoutV1 } from "../../../../shared/communityLayout";
import type { CommunityShellCommunity } from "../../../../shared/communityTypes";
import type { AppTheme } from "../../../../shared/theme";
import type { WebCommunityLayoutChoice } from "./useWebCommunityLayout";
import type { WebCommunityPodsFrame } from "../components/WebCommunityPods";

// What the community's own area knows about the frame around it: the active
// layout plus the community and actions the layout's blocks (community card,
// upcoming events, About page) need. Provided by WebShellChromeHost.
export type WebCommunityFrame = {
  layout: CommunityLayoutV1;
  community: (CommunityShellCommunity & { one_liner?: string | null; about?: string | null }) | null;
  memberCount: number | null;
  session: unknown | null;
  canInvite: boolean;
  // Owners and admins: the sales page shows an "Edit page" link to Funnels.
  canEditSalesPage: boolean;
  onSelectTab: (tab: CommunityTab) => void;
  onCopyJoinLink: ((joinUrl: string) => Promise<void> | void) | null;
  // Words typed in the top bar's search; the posts feed shows only matches.
  postSearch: string;
  onPostSearch: (query: string) => void;
  // The member's own Classroom/Channels pick, for the Display menu. Null when
  // the owner offers no choice.
  layoutChoice: WebCommunityLayoutChoice | null;
  // The member's Light/Dark, for the Display menu. Null where the community's
  // look has one scheme only, so the choice would change nothing.
  displayMode: { current: AppTheme; onChoose: (theme: AppTheme) => void } | null;
  // Classroom's pods (the member's invite-only channels) and where they sit.
  // Null outside Classroom, where they stay in the channel list.
  pods: WebCommunityPodsFrame | null;
};

export const WebCommunityFrameContext = createContext<WebCommunityFrame>({
  layout: DEFAULT_COMMUNITY_LAYOUT,
  community: null,
  memberCount: null,
  session: null,
  canInvite: false,
  canEditSalesPage: false,
  onSelectTab: () => {},
  onCopyJoinLink: null,
  postSearch: "",
  onPostSearch: () => {},
  layoutChoice: null,
  displayMode: null,
  pods: null,
});

export function useWebCommunityFrame(): WebCommunityFrame {
  return useContext(WebCommunityFrameContext);
}

export function communityJoinUrl(slug: string | null | undefined): string | null {
  const value = String(slug ?? "").trim();
  if (!value) return null;
  const path = `/c/${encodeURIComponent(value)}`;
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}
