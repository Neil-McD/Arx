import type {
  CommunityFunnelSectionV1,
  CommunityPublicFace,
  PublicPlanSummary,
} from "./communityTypes";

export type CommunityFunnelUiFaceLike = CommunityPublicFace;

export type CommunityFunnelUiMode =
  | "enter"
  | "join"
  | "request_access"
  | "checkout"
  | "private";

export type CommunityFunnelPrimaryActionView = {
  label: string;
  hasValidPaidPlan: boolean;
};

function formatPublicPlanJoinPrice(
  plan: PublicPlanSummary | null | undefined,
): string | null {
  if (!plan) return null;
  const rawAmount = String(plan.amount_base_units ?? "").trim();
  const amount = Number(rawAmount);
  const decimals = Number(plan.currency_decimals);
  const currency = String(plan.currency ?? "")
    .trim()
    .toUpperCase();
  if (
    rawAmount.length === 0 ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 6 ||
    !/^[A-Z]{3}$/.test(currency) ||
    (plan.billing_period !== "monthly" && plan.billing_period !== "annual")
  ) {
    return null;
  }
  const value = amount / Math.pow(10, decimals);
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value)
        ? 0
        : Math.min(decimals, 2),
      maximumFractionDigits: Math.min(decimals, 2),
    }).format(value);
    return `${formatted}/${plan.billing_period === "monthly" ? "month" : "year"}`;
  } catch {
    return null;
  }
}

export function buildCommunityFunnelPrimaryActionView(params: {
  mode: CommunityFunnelUiMode;
  plan?: PublicPlanSummary | null;
  isBusy?: boolean;
  approvalPending?: boolean;
  approvalDenied?: boolean;
  canRequestAgain?: boolean;
}): CommunityFunnelPrimaryActionView {
  const formattedPaidPrice = formatPublicPlanJoinPrice(params.plan);
  const hasValidPaidPlan = Boolean(formattedPaidPrice);
  if (params.mode === "enter") {
    return { label: "Enter community", hasValidPaidPlan };
  }
  if (params.isBusy) {
    return { label: "Joining…", hasValidPaidPlan };
  }
  if (params.mode === "request_access") {
    if (params.approvalPending) {
      return { label: "Request pending", hasValidPaidPlan };
    }
    if (params.approvalDenied) {
      return {
        label: params.canRequestAgain ? "Request again" : "Request denied",
        hasValidPaidPlan,
      };
    }
    return { label: "Join free", hasValidPaidPlan };
  }
  if (params.mode === "join") {
    return { label: "Join free", hasValidPaidPlan };
  }
  if (params.mode === "checkout") {
    return {
      label: formattedPaidPrice
        ? `Join ${formattedPaidPrice}`
        : "Join unavailable",
      hasValidPaidPlan,
    };
  }
  return { label: "Private community", hasValidPaidPlan };
}

export function formatCompactStat(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function filterOnlineAvatarFaces<
  TFace extends CommunityFunnelUiFaceLike,
>(faces: TFace[] | null | undefined, max = 4): TFace[] {
  return (faces ?? [])
    .filter((face) => Boolean(face?.avatar_url))
    .slice(0, max);
}

export type CommunityFunnelMemberProofView<
  TFace extends CommunityFunnelUiFaceLike,
> = {
  memberCount: number;
  faces: TFace[];
  hiddenFaceCount: number;
  headline: string;
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
    headline:
      memberCount === 1
        ? "Join the community"
        : `Join ${formatCompactStat(memberCount)}+ members`,
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
