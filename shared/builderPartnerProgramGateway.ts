import type { AuthSessionLike } from "./authSession";
import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
  requireConvexUrl,
} from "./convexAuthenticatedClient";
import { getBusinessVisitorKey } from "./cloudBusinessAnalyticsGateway";
import { buildAttributionRouteLabel } from "./routePrivacy";

const BUILDER_PARTNER_REFERRAL_STORAGE_KEY = "polynet-builder-partner-referral";
const BUILDER_PARTNER_REFERRAL_STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type BuilderPartnerRequirementAction =
  | "complete_account_setup"
  | "create_community"
  | "finish_community_setup"
  | "accept_terms"
  | null;

export type BuilderPartnerProgramRequirement = {
  key:
    | "account_setup_complete"
    | "own_community"
    | "community_publish_ready"
    | "accept_terms"
    | "account_good_standing";
  label: string;
  met: boolean;
  action: BuilderPartnerRequirementAction;
};

export type BuilderPartnerProgramSnapshot = {
  programVersion: string;
  state: "signed_out" | "locked" | "ready_to_unlock" | "active" | "paused" | "disabled";
  isUnlocked: boolean;
  eligible: boolean;
  requirements: BuilderPartnerProgramRequirement[];
  partner: {
    code: string;
    status: "active" | "paused" | "disabled";
    partnerLink: string;
    acceptedTermsAt: number | null;
    acceptedTermsVersion: string | null;
    disabledReason: string | null;
    createdAt: number;
    updatedAt: number;
  } | null;
  payout: {
    ready: boolean;
    status: string;
    label: string;
  };
  commissionSummary: {
    pendingUsd: number;
    bufferedUsd: number;
    readyUsd: number;
    paidUsd: number;
    totalUsd: number;
    clawbackDebtUsd: number;
    pendingCount: number;
    bufferedCount: number;
    readyCount: number;
    paidCount: number;
    clawbackDebtCount: number;
  };
  attributionSummary: {
    activeCount: number;
    boundCount: number;
  };
  payoutHistory: {
    transfers: Array<{
      id: string;
      amountUsd: number;
      currency: string;
      status: string;
      createdAt: number;
      processedAt: number | null;
      failureReason: string | null;
    }>;
  };
};

type StoredBuilderPartnerReferral = {
  code: string;
  expiresAt: number;
};

function normalizeReferralCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function readCurrentPartnerCode(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return (
    normalizeReferralCode(params.get("partner")) ||
    normalizeReferralCode(params.get("ref")) ||
    null
  );
}

function readCurrentAttributionRouteLabel(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return buildAttributionRouteLabel({
    pathname: window.location.pathname,
    search: window.location.search,
  });
}

function readStoredPartnerReferral(): StoredBuilderPartnerReferral | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BUILDER_PARTNER_REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBuilderPartnerReferral>;
    const code = normalizeReferralCode(parsed.code);
    const expiresAt = Number(parsed.expiresAt ?? 0);
    if (!code || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(BUILDER_PARTNER_REFERRAL_STORAGE_KEY);
      return null;
    }
    return { code, expiresAt };
  } catch {
    return null;
  }
}

function storePartnerReferral(code: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  try {
    window.localStorage.setItem(
      BUILDER_PARTNER_REFERRAL_STORAGE_KEY,
      JSON.stringify({
        code: normalized,
        expiresAt: Date.now() + BUILDER_PARTNER_REFERRAL_STORAGE_TTL_MS,
      }),
    );
  } catch {
    // Attribution is best-effort and must not block the app shell.
  }
}

function normalizeProgramSnapshot(row: BuilderPartnerProgramSnapshot): BuilderPartnerProgramSnapshot {
  return {
    ...row,
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    partner: row.partner
      ? {
          ...row.partner,
          code: normalizeReferralCode(row.partner.code),
          partnerLink: String(row.partner.partnerLink ?? "").trim(),
          acceptedTermsAt:
            typeof row.partner.acceptedTermsAt === "number" && Number.isFinite(row.partner.acceptedTermsAt)
              ? row.partner.acceptedTermsAt
              : null,
          acceptedTermsVersion:
            typeof row.partner.acceptedTermsVersion === "string" && row.partner.acceptedTermsVersion.trim()
              ? row.partner.acceptedTermsVersion.trim()
              : null,
          disabledReason:
            typeof row.partner.disabledReason === "string" && row.partner.disabledReason.trim()
              ? row.partner.disabledReason.trim()
              : null,
        }
      : null,
    commissionSummary: {
      pendingUsd: Number(row.commissionSummary?.pendingUsd ?? 0),
      bufferedUsd: Number(row.commissionSummary?.bufferedUsd ?? 0),
      readyUsd: Number(row.commissionSummary?.readyUsd ?? 0),
      paidUsd: Number(row.commissionSummary?.paidUsd ?? 0),
      totalUsd: Number(row.commissionSummary?.totalUsd ?? 0),
      clawbackDebtUsd: Number(row.commissionSummary?.clawbackDebtUsd ?? 0),
      pendingCount: Number(row.commissionSummary?.pendingCount ?? 0),
      bufferedCount: Number(row.commissionSummary?.bufferedCount ?? 0),
      readyCount: Number(row.commissionSummary?.readyCount ?? 0),
      paidCount: Number(row.commissionSummary?.paidCount ?? 0),
      clawbackDebtCount: Number(row.commissionSummary?.clawbackDebtCount ?? 0),
    },
    attributionSummary: {
      activeCount: Number(row.attributionSummary?.activeCount ?? 0),
      boundCount: Number(row.attributionSummary?.boundCount ?? 0),
    },
    payoutHistory: {
      transfers: Array.isArray(row.payoutHistory?.transfers)
        ? row.payoutHistory.transfers.map((transfer) => ({
            id: String(transfer.id ?? ""),
            amountUsd: Number(transfer.amountUsd ?? 0),
            currency: String(transfer.currency ?? "usd"),
            status: String(transfer.status ?? "draft"),
            createdAt: Number(transfer.createdAt ?? 0),
            processedAt:
              typeof transfer.processedAt === "number" && Number.isFinite(transfer.processedAt)
                ? transfer.processedAt
                : null,
            failureReason:
              typeof transfer.failureReason === "string" && transfer.failureReason.trim()
                ? transfer.failureReason.trim()
                : null,
          }))
        : [],
    },
  };
}

export async function loadBuilderPartnerProgramCanonical(params: {
  session: AuthSessionLike;
}): Promise<BuilderPartnerProgramSnapshot> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const row = (await client.query("builderPartners:getMyBuilderPartnerProgram" as any, {
    authSubject,
  })) as BuilderPartnerProgramSnapshot;
  return normalizeProgramSnapshot(row);
}

export async function acceptBuilderPartnerTermsCanonical(params: {
  session: AuthSessionLike;
}): Promise<BuilderPartnerProgramSnapshot> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const row = (await client.mutation("builderPartners:acceptBuilderPartnerTermsAndEnsure" as any, {
    authSubject,
  })) as BuilderPartnerProgramSnapshot;
  return normalizeProgramSnapshot(row);
}

export async function recordBuilderPartnerAttributionCanonical(params: {
  session?: AuthSessionLike | null;
  referralCode: string;
}): Promise<void> {
  requireConvexUrl();
  const referralCode = normalizeReferralCode(params.referralCode);
  if (!referralCode) return;
  const visitorKey = getBusinessVisitorKey();
  const currentUrl = readCurrentAttributionRouteLabel();

  if (params.session) {
    const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
    await client.mutation("builderPartners:recordBuilderPartnerAttribution" as any, {
      referralCode,
      visitorKey: visitorKey ?? undefined,
      authSubject,
      currentUrl,
    });
    return;
  }

  const client = createConvexClient();
  await client.mutation("builderPartners:recordBuilderPartnerAttribution" as any, {
    referralCode,
    visitorKey: visitorKey ?? undefined,
    currentUrl,
  });
}

export async function captureBuilderPartnerAttributionFromCurrentUrl(params: {
  session?: AuthSessionLike | null;
}): Promise<void> {
  const urlCode = readCurrentPartnerCode();
  const stored = readStoredPartnerReferral();
  const code = urlCode ?? stored?.code ?? null;
  if (!code) return;
  if (urlCode) storePartnerReferral(urlCode);
  await recordBuilderPartnerAttributionCanonical({
    session: params.session ?? null,
    referralCode: code,
  });
}
