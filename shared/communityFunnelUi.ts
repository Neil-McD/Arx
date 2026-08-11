import type {
  CommunityFunnelSectionV1,
  CommunityPublicFace,
} from "./communityTypes";

export type CommunityFunnelUiFaceLike = CommunityPublicFace;

export type CommunityFunnelUiMode = "enter" | "join" | "request_access" | "checkout" | "private";

export function formatCompactStat(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
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
  return { eyebrow: "Private community", body: "Reach out to the owner for access." };
}

export function filterOnlineAvatarFaces<TFace extends CommunityFunnelUiFaceLike>(
  faces: TFace[] | null | undefined,
  max = 4,
): TFace[] {
  return (faces ?? []).filter((face) => Boolean(face?.avatar_url)).slice(0, max);
}

export type CommunityFunnelMemberProofView<TFace extends CommunityFunnelUiFaceLike> = {
  memberCount: number;
  faces: TFace[];
  hiddenFaceCount: number;
  label: string;
  ariaLabel: string;
};

export function buildCommunityFunnelMemberProofView<
  TFace extends CommunityFunnelUiFaceLike,
>(params: {
  memberCount: number | null | undefined;
  faces: TFace[] | null | undefined;
  maxFaces?: number;
}): CommunityFunnelMemberProofView<TFace> | null {
  if (
    typeof params.memberCount !== "number" ||
    !Number.isFinite(params.memberCount)
  ) {
    return null;
  }
  const memberCount = Math.max(0, Math.floor(params.memberCount));
  if (memberCount === 0) return null;

  const maxFaces = Math.max(0, Math.floor(params.maxFaces ?? 5));
  const seenUserIds = new Set<string>();
  const faces = (params.faces ?? [])
    .filter((face) => {
      if (!face?.avatar_url) return false;
      const userId = String(face.user_id ?? "").trim();
      if (!userId || seenUserIds.has(userId)) return false;
      seenUserIds.add(userId);
      return true;
    })
    .slice(0, Math.min(maxFaces, memberCount));
  const noun = memberCount === 1 ? "member" : "members";

  return {
    memberCount,
    faces,
    hiddenFaceCount: Math.max(0, memberCount - faces.length),
    label:
      memberCount === 1
        ? "1 member"
        : `${memberCount.toLocaleString()} members and growing`,
    ariaLabel: `${memberCount.toLocaleString()} community ${noun}`,
  };
}

export function resolveCommunityFunnelMemberProofInsertIndex(
  sections: CommunityFunnelSectionV1[],
): number | null {
  if (sections.some((section) => section.type === "social_proof")) return null;
  const benefitsIndex = sections.findIndex(
    (section) => section.type === "benefits",
  );
  if (benefitsIndex >= 0) return benefitsIndex + 1;
  const ctaIndex = sections.findIndex((section) => section.type === "cta");
  return ctaIndex >= 0 ? ctaIndex : sections.length;
}
