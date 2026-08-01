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

function readStripeSecretKey(): string {
  const secretKey = readEnv("STRIPE_SECRET_KEY", "ARX_STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("stripe_secret_key_missing");
  return secretKey;
}

export function stripeSecretKeyExpectsLiveMode(secretKey: unknown): boolean | null {
  const normalized = String(secretKey ?? "").trim();
  if (/^(sk|rk)_live_/.test(normalized)) return true;
  if (/^(sk|rk)_test_/.test(normalized)) return false;
  return null;
}

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = readStripeSecretKey();
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function readStripeWebhookSecret(): string {
  const secret = readEnv("STRIPE_WEBHOOK_SECRET", "ARX_STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("stripe_webhook_secret_missing");
  return secret;
}

export function readStripeConnectWebhookSecretOptional(): string | null {
  return readEnv("STRIPE_CONNECT_WEBHOOK_SECRET") || null;
}

export function requireStripeConnectWebhookConfiguration(): void {
  if (!readStripeConnectWebhookSecretOptional()) {
    throw new Error("stripe_connect_webhook_secret_missing");
  }
}

export type StripeWebhookScope = "account" | "connect";

export function stripeWebhookScopeMatchesEvent(
  scope: StripeWebhookScope,
  event: Pick<Stripe.Event, "account">,
): boolean {
  const isConnectedAccountEvent = Boolean(String(event.account ?? "").trim());
  return scope === "connect" ? isConnectedAccountEvent : !isConnectedAccountEvent;
}

export async function verifyStripeWebhookSignature(args: {
  payload: string;
  signature: string;
}): Promise<{ event: Stripe.Event; scope: StripeWebhookScope }> {
  const candidates = [
    { scope: "account" as const, secret: readStripeWebhookSecret() },
    {
      scope: "connect" as const,
      secret: readStripeConnectWebhookSecretOptional(),
    },
  ].filter(
    (candidate): candidate is { scope: StripeWebhookScope; secret: string } =>
      Boolean(candidate.secret),
  );
  let lastError: unknown = null;
  const expectsLiveMode = stripeSecretKeyExpectsLiveMode(readStripeSecretKey());
  if (expectsLiveMode === null) throw new Error("stripe_secret_key_mode_invalid");
  for (const candidate of candidates) {
    try {
      const event = await getStripeClient().webhooks.constructEventAsync(
        args.payload,
        args.signature,
        candidate.secret,
      );
      if (!stripeWebhookScopeMatchesEvent(candidate.scope, event)) {
        lastError = new Error("stripe_webhook_scope_mismatch");
        continue;
      }
      if (event.livemode !== expectsLiveMode) {
        lastError = new Error("stripe_webhook_livemode_mismatch");
        continue;
      }
      return { event, scope: candidate.scope };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("stripe_webhook_signature_invalid");
}
