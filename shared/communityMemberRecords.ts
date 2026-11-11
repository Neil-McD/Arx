// Members, the host's side (docs/design/members-invariants.md): how a
// membership reads on the row and in the record. Pure, so the page and the
// server say the same thing, and so every case is tested.

export type MemberPlanKind = "owner" | "paid" | "comped" | "free";
export type MemberPlan = { kind: MemberPlanKind; label: string; price_point_id: string | null };
export type MemberMoney = { kind: "on_hold" | "cancelling"; label: string; since_at: string | null; ends_at: string | null } | null;
export type MemberOutReason = "left" | "removed" | "lapsed" | "blocked" | "declined";

export function formatPrice(amountBaseUnits: number, currency: string, decimals: number): string {
  const amount = amountBaseUnits / Math.pow(10, Math.max(0, decimals));
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : Math.max(0, decimals),
      maximumFractionDigits: whole ? 0 : Math.max(0, decimals),
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

// "Founding · $7", "Member · $27", "Yearly · $270 a year". A price that is no
// longer offered still names the people on it.
export function planFor(args: {
  isOwner: boolean;
  accessSource: string | null | undefined;
  pricePoint: { id: string; name: string; amountBaseUnits: number; currency: string; currencyDecimals: number; billingPeriod: string } | null;
}): MemberPlan {
  if (args.isOwner) return { kind: "owner", label: "Owner", price_point_id: null };
  if (args.accessSource === "manual_grant") return { kind: "comped", label: "Comped", price_point_id: null };
  const point = args.pricePoint;
  if (point) {
    const price = formatPrice(point.amountBaseUnits, point.currency, point.currencyDecimals);
    const yearly = point.billingPeriod === "annual" || point.billingPeriod === "yearly";
    const name = point.name.trim() || "Paid";
    return { kind: "paid", label: `${name} · ${price}${yearly ? " a year" : ""}`, price_point_id: point.id };
  }
  if (args.accessSource === "paid_subscription") return { kind: "paid", label: "Paid", price_point_id: null };
  return { kind: "free", label: "Free", price_point_id: null };
}

const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

// The money state that needs the host: a failed card, or a member leaving at
// the end of what they paid for.
export function moneyFor(args: {
  membershipState: string;
  subscription: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEndAt?: number | null; updatedAt: number } | null;
}): MemberMoney {
  const sub = args.subscription;
  if (args.membershipState === "payment_hold" || sub?.status === "past_due") {
    return { kind: "on_hold", label: "on hold", since_at: iso(sub?.updatedAt), ends_at: iso(sub?.currentPeriodEndAt) };
  }
  if (sub && sub.status !== "ended" && (sub.status === "cancel_at_period_end" || sub.cancelAtPeriodEnd)) {
    return { kind: "cancelling", label: "cancelling", since_at: null, ends_at: iso(sub.currentPeriodEndAt) };
  }
  return null;
}

export function outReasonFor(state: string, blocked: boolean): MemberOutReason | null {
  if (blocked) return "blocked";
  if (state === "left" || state === "removed" || state === "lapsed") return state;
  return null;
}

export const OUT_REASON_TEXT: Record<MemberOutReason, string> = {
  left: "Left on their own",
  removed: "Removed by a host",
  lapsed: "Payment lapsed",
  blocked: "Blocked",
  declined: "Asked to join, declined",
};

// What a member has told us, in the record's words.
export const FACT_LABELS: Record<string, string> = {
  goal: "Working on",
  situation: "About",
  skill: "Can help with",
  interest: "Interested in",
  availability: "Available",
  preference: "Prefers",
  link: "Links",
};

export const FACT_ORDER = ["goal", "situation", "skill", "interest", "preference", "availability", "link"];

// Where it came from, as the record says it.
export const FACT_SOURCES: Record<string, string> = {
  stated_bridge: "Said when joining",
  stated_interview: "Said to the guide",
  form_answer: "Answers when joining",
  social_enrichment: "From their public profile",
  inferred_agent: "Your guide's guess",
  observed_behavior: "Seen in the community",
};

// The host sees only what the member has approved. A guess waits for the
// member, and what is only observed stays with the agent (fail closed).
export function factVisibleToHost(fact: { consentState: string }): boolean {
  return fact.consentState === "approved";
}
