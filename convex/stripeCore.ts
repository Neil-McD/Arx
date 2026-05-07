import Stripe from "stripe";

function readEnv(...names: string[]): string {
  for (const name of names) {
    try {
      const value = (globalThis as any)?.process?.env?.[name];
      if (typeof value === "string" && value.trim()) return value.trim();
    } catch {
      // ignore
    }
  }
  return "";
}

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = readEnv("STRIPE_SECRET_KEY", "ARX_STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("stripe_secret_key_missing");
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function readStripeWorkspaceCreditTopupPriceId(): string {
  const priceId = readEnv(
    "STRIPE_WORKSPACE_CREDIT_TOPUP_PRICE_ID",
    "ARX_STRIPE_WORKSPACE_CREDIT_TOPUP_PRICE_ID",
    "WORKSPACE_CREDIT_TOPUP_STRIPE_PRICE_ID",
  );
  if (!priceId) throw new Error("stripe_workspace_credit_topup_price_id_missing");
  return priceId;
}

export function readStripeWebhookSecret(): string {
  const secret = readEnv("STRIPE_WEBHOOK_SECRET", "ARX_STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("stripe_webhook_secret_missing");
  return secret;
}

export async function verifyStripeWebhookSignature(args: {
  payload: string;
  signature: string;
}): Promise<Stripe.Event> {
  return await getStripeClient().webhooks.constructEventAsync(
    args.payload,
    args.signature,
    readStripeWebhookSecret(),
  );
}
