export type CommunityFunnelUiFaceLike = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type CommunityFunnelUiMode = "enter" | "join" | "request_access" | "checkout" | "private";

export type CommunityFunnelPrimaryActionView = {
  label: string;
  hasValidPaidPlan: boolean;
};

export function deriveCommunityFunnelUiMode(params: {
  canEnterCommunity: boolean;
  canJoinWithCheckout: boolean;
  canJoinWithApproval: boolean;
  canJoinForFree: boolean;
}): CommunityFunnelUiMode {
  if (params.canEnterCommunity) return "enter";
  if (params.canJoinWithCheckout) return "checkout";
  if (params.canJoinWithApproval) return "request_access";
  if (params.canJoinForFree) return "join";
  return "private";
}

function formatPublicPlanJoinPrice(plan: import("./communityTypes").PublicPlanSummary | null | undefined) {
  if (!plan) return null;
  const amount = Number(plan.amount_base_units);
  const decimals = Number(plan.currency_decimals);
  const currency = String(plan.currency ?? "").trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 6 || !/^[A-Z]{3}$/.test(currency)) return null;
  try {
    const value = amount / Math.pow(10, decimals);
    const price = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(decimals, 2),
      maximumFractionDigits: Math.min(decimals, 2),
    }).format(value);
    return `${price}/${plan.billing_period === "annual" ? "year" : "month"}`;
  } catch {
    return null;
  }
}

export function buildCommunityFunnelPrimaryActionView(params: {
  mode: CommunityFunnelUiMode;
  plan?: import("./communityTypes").PublicPlanSummary | null;
  isBusy?: boolean;
  approvalPending?: boolean;
  approvalDenied?: boolean;
  canRequestAgain?: boolean;
}): CommunityFunnelPrimaryActionView {
  const paidPrice = formatPublicPlanJoinPrice(params.plan);
  if (params.mode === "enter") return { label: "Enter community", hasValidPaidPlan: Boolean(paidPrice) };
  if (params.isBusy) return { label: "Joining…", hasValidPaidPlan: Boolean(paidPrice) };
  if (params.mode === "request_access") {
    if (params.approvalPending) return { label: "Request pending", hasValidPaidPlan: Boolean(paidPrice) };
    if (params.approvalDenied) return { label: params.canRequestAgain ? "Request again" : "Request denied", hasValidPaidPlan: Boolean(paidPrice) };
  }
  if (params.mode === "checkout") return { label: paidPrice ? `Join ${paidPrice}` : "Join unavailable", hasValidPaidPlan: Boolean(paidPrice) };
  if (params.mode === "private") return { label: "Private community", hasValidPaidPlan: Boolean(paidPrice) };
  return { label: "Join free", hasValidPaidPlan: Boolean(paidPrice) };
}

export type CommunityFunnelRenderPillar = {
  title: string;
  body: string;
};

export type CommunityFunnelRenderModel = {
  mode: "default" | "custom";
  headline: string;
  subheadline: string | null;
  pillars: CommunityFunnelRenderPillar[];
  longFormMarkdown: string | null;
  vslUrl: string | null;
};

type CommunityFunnelRenderInput = {
  communityName: string;
  oneLiner?: string | null;
  about?: string | null;
  funnel?: {
    hero_media_url?: string | null;
    hero_media_kind?: "image" | "video" | null;
    live_mode?: "default" | "custom" | null;
    published_vsl_url?: string | null;
    published_content_v2?: {
      version: 2;
      headline: string;
      subheadline: string;
      pillars: readonly CommunityFunnelRenderPillar[];
      long_form_markdown: string;
    } | null;
  } | null;
};

function cleanOptionalCopy(value: string | null | undefined): string | null {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || null;
}

/**
 * One public render decision. Draft state never enters this projection: the
 * public route receives only the explicitly published snapshot from Convex.
 */
export function buildCommunityFunnelRenderModel(
  input: CommunityFunnelRenderInput,
): CommunityFunnelRenderModel {
  const published = input.funnel?.published_content_v2 ?? null;
  const isCustom = input.funnel?.live_mode === "custom" && published?.version === 2;
  if (isCustom && published) {
    return {
      mode: "custom",
      headline: published.headline.trim(),
      subheadline: cleanOptionalCopy(published.subheadline),
      pillars: published.pillars.slice(0, 3).map((pillar) => ({
        title: pillar.title.trim(),
        body: pillar.body.trim(),
      })),
      longFormMarkdown: cleanOptionalCopy(published.long_form_markdown),
      vslUrl:
        cleanOptionalCopy(input.funnel?.published_vsl_url) ??
        (input.funnel?.hero_media_kind === "video"
          ? cleanOptionalCopy(input.funnel?.hero_media_url)
          : null),
    };
  }

  return {
    mode: "default",
    headline: cleanOptionalCopy(input.oneLiner) ?? input.communityName.trim(),
    subheadline: null,
    pillars: [],
    longFormMarkdown: cleanOptionalCopy(input.about),
    vslUrl:
      input.funnel?.hero_media_kind === "video"
        ? cleanOptionalCopy(input.funnel?.hero_media_url)
        : null,
  };
}

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

export type CommunityFunnelMemberProofView<TFace> = {
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
  if (typeof params.memberCount !== "number" || !Number.isFinite(params.memberCount)) return null;
  const memberCount = Math.max(0, Math.floor(params.memberCount));
  if (memberCount === 0) return null;
  const seen = new Set<string>();
  const faceLimit = Math.min(
    memberCount,
    Math.max(0, Math.floor(params.maxFaces ?? 5)),
  );
  const faces = (params.faces ?? []).filter((face) => {
    const id = String(face.user_id ?? "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, faceLimit);
  return {
    memberCount,
    faces,
    hiddenFaceCount: Math.max(0, memberCount - faces.length),
    label: memberCount === 1 ? "1 member" : `${memberCount.toLocaleString()} members and growing`,
    ariaLabel: `${memberCount.toLocaleString()} community ${memberCount === 1 ? "member" : "members"}`,
  };
}
