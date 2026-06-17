import { bootstrapGatewayAuthContext } from "./cloudGateway";
import {
  buildDefaultWorkspaceAutoRechargeSettings,
  type WorkspaceAutoRechargeStatus,
} from "./workspaceAutoRecharge";

type CloudAccountCommerceGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudWorkspaceCardOnFileStatus = {
  ok?: unknown;
  has_card_on_file?: unknown;
  payment_method_status?: unknown;
  card_brand?: unknown;
  card_last4?: unknown;
  checked_at?: unknown;
};

export type CloudWorkspaceAutoRechargeSettings = {
  configured: boolean;
  blocked: boolean;
  blockedReason: string | null;
  enabled: boolean;
  status: WorkspaceAutoRechargeStatus;
  thresholdCredits: number;
  restoreToCredits: number;
  monthlyLimitCredits: number | null;
  currency: "usd";
  lastTriggeredAt: number | null;
  lastSucceededAt: number | null;
  lastFailureAt: number | null;
  failureReason: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

// Gateway class: authenticated query/mutation bridge, caller-hardened session, fail-closed.

function normalizeGatewayNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGatewayNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWorkspaceAutoRechargeStatus(value: unknown): WorkspaceAutoRechargeStatus {
  if (value === "active" || value === "paused_payment_failed" || value === "disabled") {
    return value;
  }
  return "disabled";
}

function normalizeCloudWorkspaceAutoRechargeSettings(
  row: unknown,
): CloudWorkspaceAutoRechargeSettings {
  const value = row && typeof row === "object" && !Array.isArray(row)
    ? row as Record<string, unknown>
    : {};
  const defaults = buildDefaultWorkspaceAutoRechargeSettings();
  const monthlyLimitCredits =
    value.monthlyLimitCredits === null
      ? null
      : normalizeGatewayNullableNumber(value.monthlyLimitCredits) ?? defaults.monthlyLimitCredits;
  return {
    configured: value.configured === true,
    blocked: value.blocked === true,
    blockedReason: typeof value.blockedReason === "string" ? value.blockedReason : null,
    enabled: value.enabled === true,
    status: normalizeWorkspaceAutoRechargeStatus(value.status),
    thresholdCredits: normalizeGatewayNumber(value.thresholdCredits, defaults.thresholdCredits),
    restoreToCredits: normalizeGatewayNumber(value.restoreToCredits, defaults.restoreToCredits),
    monthlyLimitCredits,
    currency: "usd",
    lastTriggeredAt: normalizeGatewayNullableNumber(value.lastTriggeredAt),
    lastSucceededAt: normalizeGatewayNullableNumber(value.lastSucceededAt),
    lastFailureAt: normalizeGatewayNullableNumber(value.lastFailureAt),
    failureReason: typeof value.failureReason === "string" ? value.failureReason : null,
    createdAt: normalizeGatewayNullableNumber(value.createdAt),
    updatedAt: normalizeGatewayNullableNumber(value.updatedAt),
  };
}

export async function startCloudWorkspaceCreditTopupCheckout<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    successUrl: string;
    cancelUrl: string;
    packId?: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startWorkspaceCreditTopupCheckout" as any, {
    authSubject,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    packId: params.packId,
  })) as {
    checkout_url?: unknown;
  };
}

export async function startCloudWorkspaceCardSetupCheckout<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ checkout_url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startWorkspaceCardSetupCheckout" as any, {
    authSubject,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  })) as {
    checkout_url?: unknown;
  };
}

export async function refreshCloudWorkspaceCardOnFileStatus<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<CloudWorkspaceCardOnFileStatus> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:refreshWorkspaceCardOnFileStatus" as any, {
    authSubject,
  })) as CloudWorkspaceCardOnFileStatus;
}

export async function loadCloudWorkspaceCardOnFileStatus<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<CloudWorkspaceCardOnFileStatus> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.query("stripeCustomers:getWorkspaceCardOnFileStatus" as any, {
    authSubject,
  })) as CloudWorkspaceCardOnFileStatus;
}

export async function loadCloudWorkspaceAutoRechargeSettings<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<CloudWorkspaceAutoRechargeSettings> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const row = await client.query("workspaceAutoRecharge:getWorkspaceAutoRechargeSettings" as any, {
    authSubject,
  });
  return normalizeCloudWorkspaceAutoRechargeSettings(row);
}

export async function saveCloudWorkspaceAutoRechargeSettings<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    enabled: boolean;
    thresholdCredits?: number;
    restoreToCredits?: number;
    monthlyLimitCredits?: number | null;
  },
): Promise<CloudWorkspaceAutoRechargeSettings> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const row = await client.mutation("workspaceAutoRecharge:saveWorkspaceAutoRechargeSettings" as any, {
    authSubject,
    enabled: params.enabled,
    thresholdCredits: params.thresholdCredits,
    restoreToCredits: params.restoreToCredits,
    monthlyLimitCredits: params.monthlyLimitCredits ?? null,
  });
  return normalizeCloudWorkspaceAutoRechargeSettings(row);
}

export async function disableCloudWorkspaceAutoRechargeSettings<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT>,
): Promise<CloudWorkspaceAutoRechargeSettings> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const row = await client.mutation("workspaceAutoRecharge:disableWorkspaceAutoRechargeSettings" as any, {
    authSubject,
  });
  return normalizeCloudWorkspaceAutoRechargeSettings(row);
}

export async function startCloudConnectOnboarding<SessionT>(
  params: CloudAccountCommerceGatewayParams<SessionT> & {
    context: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
  },
): Promise<{ url?: unknown }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  return (await client.action("billing:startConnectOnboarding" as any, {
    authSubject,
    context: params.context,
    communitySlug: params.communitySlug ?? undefined,
    country: params.country ?? undefined,
  })) as {
    url?: unknown;
  };
}
