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
    // Pressing it sends a request for approval, so it says so.
    return { label: "Ask to join", hasValidPaidPlan: Boolean(paidPrice) };
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

export function formatMemberCount(value: number): string {
  return `${new Intl.NumberFormat().format(value)} members`;
}

export type CommunityFunnelMemberProofView<TFace> = {
  memberCount: number;
  faces: TFace[];
  hiddenFaceCount: number;
  label: string;
  ariaLabel: string;
};

