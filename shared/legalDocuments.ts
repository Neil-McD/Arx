import { BUILDER_PARTNER_TERMS_VERSION } from "./builderPartnerProgram";

export type LegalDocumentKey = "builder_partner_terms";

export type LegalDocument = {
  key: LegalDocumentKey;
  version: string;
  slug: string;
  title: string;
  route: string;
  effectiveDate: string;
  sourcePath: string;
};

export const BUILDER_PARTNER_TERMS_DOCUMENT: LegalDocument = {
  key: "builder_partner_terms",
  version: BUILDER_PARTNER_TERMS_VERSION,
  slug: "builder-partner-terms",
  title: "Builder Partner Terms v1",
  route: "/legal/builder-partner-terms",
  effectiveDate: "2026-05-21",
  sourcePath: "docs/legal/builder-partner-terms-v1.md",
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  BUILDER_PARTNER_TERMS_DOCUMENT,
] as const;

export function findLegalDocumentBySlug(slug: string | null | undefined): LegalDocument | null {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return LEGAL_DOCUMENTS.find((document) => document.slug === normalized) ?? null;
}
