export type CommunityFunnelUiFaceLike = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

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
