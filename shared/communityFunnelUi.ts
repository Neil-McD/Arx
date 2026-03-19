import type { CSSProperties } from "react";

import { getCommunityBannerBackgroundStyle } from "./communityBannerUi";
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
};

export type CommunityFunnelUiMode = "join_free" | "join_approval" | "checkout" | "private";

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

export function buildCommunityHeroStyle(
  community: CommunityFunnelUiCommunityLike | null | undefined,
): CSSProperties | undefined {
  return getCommunityBannerBackgroundStyle({
    imageUrl: community?.banner_url,
    focusX: community?.banner_focus_x,
    focusY: community?.banner_focus_y,
    zoom: community?.banner_zoom,
  });
}

export function buildCommunityFunnelActionCardArtStyle(args: {
  community: CommunityFunnelUiCommunityLike | null | undefined;
  funnel: Pick<CommunityFunnelConfig, "hero_media_kind" | "hero_media_url"> | null | undefined;
  heroMediaUrlOverride?: string | null;
}): CSSProperties | undefined {
  const heroMediaUrl = args.heroMediaUrlOverride ?? args.funnel?.hero_media_url ?? null;
  if (args.funnel?.hero_media_kind === "image" && heroMediaUrl) {
    return {
      backgroundImage: `url(${heroMediaUrl})`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  }
  return buildCommunityHeroStyle(args.community);
}

export function buildCommunityFunnelCopy(mode: CommunityFunnelUiMode): {
  eyebrow: string;
  body: string;
} {
  if (mode === "checkout") {
    return { eyebrow: "Paid access", body: "Unlock access and continue into the community." };
  }
  if (mode === "join_approval") {
    return { eyebrow: "Approval required", body: "Join to enter the pending approvals queue." };
  }
  if (mode === "join_free") {
    return { eyebrow: "Open access", body: "Enter immediately and start participating." };
  }
  return { eyebrow: "Private community", body: "Reach out to the owner for access." };
}

export function filterOnlineAvatarFaces<TFace extends CommunityFunnelUiFaceLike>(
  faces: TFace[] | null | undefined,
  max = 4,
): TFace[] {
  return (faces ?? []).filter((face) => Boolean(face?.avatar_url)).slice(0, max);
}
