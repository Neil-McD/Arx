import type { CloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import { formatPrice } from "../../../../shared/communityMemberRecords";

// When something happened, in the Members page's words: "Now", "12 min ago",
// "3 h ago", "Tuesday", then "Oct 31". Its own small file, so the profile can
// use it without loading the whole Members page.
export function memberTimeFor(iso: string | null, now: number): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 5) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  const date = new Date(at);
  if (minutes < 7 * 24 * 60) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "Jun 27", with the year only when it isn't this one.
export function shortDay(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

type PaymentEvent = CloudCommunityMemberBillingHistory["events"][number];

// One line of the payment history, in plain words.
export function paymentText(event: PaymentEvent): string {
  const amount = typeof event.amount_base_units === "number" && event.currency
    ? `${formatPrice(event.amount_base_units, event.currency, event.currency_decimals ?? 2)}${event.billing_period === "annual" ? " a year" : event.billing_period === "monthly" ? " a month" : ""}`
    : "";
  const status = String(event.status ?? "").toLowerCase();
  const what = status.includes("past_due") || status.includes("failed") ? "Payment failed"
    : status.includes("cancel_at_period_end") || status.includes("cancel_requested") ? "Asked to stop renewing"
      : status.includes("ended") || status.includes("canceled") ? "Subscription ended"
        : status.includes("refund") ? "Refunded"
          : status.includes("dispute") ? "Disputed"
            : event.kind === "checkout" ? "Paid to join"
              : "Subscription active";
  return amount ? `${what} · ${amount}` : what;
}
