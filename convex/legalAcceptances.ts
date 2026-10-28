import {
  PLATFORM_LEGAL_DOCUMENTS,
  PRIVACY_AI_DATA_POLICY_DOCUMENT,
  TERMS_OF_SERVICE_DOCUMENT,
} from "../shared/legalDocuments";
import { ConvexError } from "convex/values";

type LegalAcceptanceRow = {
  documentKey?: string;
  documentVersion?: string;
};

type PlatformLegalAcceptanceErrorCode =
  | "terms_of_service_version_stale"
  | "privacy_policy_version_stale";

function throwPlatformLegalAcceptanceError(code: PlatformLegalAcceptanceErrorCode): never {
  throw new ConvexError({ code, reason: code });
}

function hasLegalAcceptance(
  rows: LegalAcceptanceRow[],
  document: (typeof PLATFORM_LEGAL_DOCUMENTS)[number],
): boolean {
  return rows.some((row) =>
    row.documentKey === document.key &&
    row.documentVersion === document.version
  );
}

export function hasAcceptedCurrentPlatformLegalFromRows(rows: LegalAcceptanceRow[]): boolean {
  return PLATFORM_LEGAL_DOCUMENTS.every((document) => hasLegalAcceptance(rows, document));
}

async function listLegalAcceptancesForUser(ctx: any, userId: any): Promise<LegalAcceptanceRow[]> {
  return await ctx.db
    .query("legalAcceptances")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
}

async function recordLegalAcceptanceIfMissing(ctx: any, args: {
  userId: any;
  documentKey: string;
  documentVersion: string;
  source: string;
  acceptedAt: number;
}) {
  const existing = await ctx.db
    .query("legalAcceptances")
    .withIndex("by_user_document_version", (q: any) =>
      q
        .eq("userId", args.userId)
        .eq("documentKey", args.documentKey)
        .eq("documentVersion", args.documentVersion),
    )
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("legalAcceptances", {
    userId: args.userId,
    documentKey: args.documentKey,
    documentVersion: args.documentVersion,
    acceptedAt: args.acceptedAt,
    source: args.source,
    createdAt: args.acceptedAt,
  });
}

export async function listPlatformLegalAcceptancesForUser(ctx: any, userId: any): Promise<LegalAcceptanceRow[]> {
  return await listLegalAcceptancesForUser(ctx, userId);
}

export async function recordCurrentPlatformLegalAcceptance(ctx: any, args: {
  userId: any;
  termsVersion: string;
  privacyPolicyVersion: string;
  source: string;
  acceptedAt: number;
}) {
  if (args.termsVersion !== TERMS_OF_SERVICE_DOCUMENT.version) {
    throwPlatformLegalAcceptanceError("terms_of_service_version_stale");
  }
  if (args.privacyPolicyVersion !== PRIVACY_AI_DATA_POLICY_DOCUMENT.version) {
    throwPlatformLegalAcceptanceError("privacy_policy_version_stale");
  }
  await recordLegalAcceptanceIfMissing(ctx, {
    userId: args.userId,
    documentKey: TERMS_OF_SERVICE_DOCUMENT.key,
    documentVersion: TERMS_OF_SERVICE_DOCUMENT.version,
    source: args.source,
    acceptedAt: args.acceptedAt,
  });
  await recordLegalAcceptanceIfMissing(ctx, {
    userId: args.userId,
    documentKey: PRIVACY_AI_DATA_POLICY_DOCUMENT.key,
    documentVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: args.source,
    acceptedAt: args.acceptedAt,
  });
}
