import type { CSSProperties } from "react";

import { getCommunityBannerImageStyle } from "./communityBannerUi";
import type { CommunityFunnelConfig } from "./communityTypes";

export type CommunityFunnelUiCommunityLike = {
  slug?: string | null;
  name: string;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
};

export type CommunityFunnelUiFaceLike = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type CommunityFunnelUiMode =
  | "enter"
  | "join"
  | "request_access"
  | "checkout"
  | "private"
  | "verifying"
  | "blocked"
  | "unavailable";

export function getCommunityInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PN"
  );
}

export function formatMemberCount(value: number): string {
  return `${new Intl.NumberFormat().format(value)} members`;
}

export function formatCompactStat(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatCommunityLink(slug: string): string {
  return `polynet.com/c/${slug}`;
}

export function buildCommunityFunnelActionCardArt(args: {
  community: CommunityFunnelUiCommunityLike | null | undefined;
  funnel: Pick<CommunityFunnelConfig, "hero_media_kind" | "hero_media_url"> | null | undefined;
  heroMediaUrlOverride?: string | null;
}): { imageUrl: string | null; imageStyle?: CSSProperties } {
  const heroMediaUrl = args.heroMediaUrlOverride ?? args.funnel?.hero_media_url ?? null;
  if (args.funnel?.hero_media_kind === "image" && heroMediaUrl) {
    return {
      imageUrl: heroMediaUrl,
      imageStyle: {
        objectPosition: "center center",
      },
    };
  }
  return {
    imageUrl: args.community?.banner_url ?? null,
    imageStyle: getCommunityBannerImageStyle({
      focusX: args.community?.banner_focus_x,
      focusY: args.community?.banner_focus_y,
      zoom: args.community?.banner_zoom,
    }),
  };
}

export function buildCommunityFunnelCopy(mode: CommunityFunnelUiMode): {
  eyebrow: string;
  body: string;
} {
  if (mode === "enter") {
    return { eyebrow: "Member access", body: "You already have access. Enter the community to continue." };
  }
  if (mode === "checkout") {
    return { eyebrow: "Paid access", body: "Unlock access and continue into the community." };
  }
  if (mode === "request_access") {
    return { eyebrow: "Approval required", body: "Join to enter the pending approvals queue." };
  }
  if (mode === "join") {
    return { eyebrow: "Open access", body: "Enter immediately and start participating." };
  }
  if (mode === "verifying") {
    return { eyebrow: "Checking access", body: "Confirming your community access." };
  }
  if (mode === "blocked") {
    return { eyebrow: "Access unavailable", body: "This account cannot access this community." };
  }
  if (mode === "unavailable") {
    return { eyebrow: "Access unavailable", body: "Polynet could not verify your access. Refresh and try again." };
  }
  return { eyebrow: "Private community", body: "Reach out to the owner for access." };
}

export function filterOnlineAvatarFaces<TFace extends CommunityFunnelUiFaceLike>(
  faces: TFace[] | null | undefined,
  max = 4,
): TFace[] {
  return (faces ?? []).filter((face) => Boolean(face?.avatar_url)).slice(0, max);
}
