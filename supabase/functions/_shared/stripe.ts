import { requireEnv } from "./env.ts";

type StripeConfig = { secretKey: string };

export function getStripeConfig(): StripeConfig {
  return { secretKey: requireEnv("STRIPE_SECRET_KEY") };
}

function encodeForm(data: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        params.set(`${key}[${index}]`, String(item));
      });
    } else if (typeof value === "object") {
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (subValue === undefined || subValue === null) continue;
        params.set(`${key}[${subKey}]`, String(subValue));
      }
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

export async function stripeRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { secretKey } = getStripeConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };
  let payload: BodyInit | undefined;
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = encodeForm(body);
  }

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Stripe error ${res.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

export type StripeCheckoutSession = {
  id: string;
  url?: string | null;
  mode: "payment" | "subscription";
  status?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  currency?: string | null;
  amount_total?: number | null;
  customer?: string | null;
  subscription?: string | null;
  payment_intent?: string | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
};

export type StripeSubscription = {
  id: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  customer: string | null;
  metadata?: Record<string, string> | null;
  items?: {
    data?: Array<{
      price?: { id?: string | null } | null;
    }>;
  } | null;
};

export async function retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

export async function retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}
