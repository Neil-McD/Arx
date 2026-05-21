import { BUILDER_PARTNER_TERMS_VERSION } from "./builderPartnerProgram";

export type LegalDocumentKey = "builder_partner_terms";

export type LegalDocument = {
  key: LegalDocumentKey;
  version: string;
  title: string;
  effectiveDate: string;
  sourcePath: string;
};

export const BUILDER_PARTNER_TERMS_DOCUMENT: LegalDocument = {
  key: "builder_partner_terms",
  version: BUILDER_PARTNER_TERMS_VERSION,
  title: "Builder Partner Terms v2",
  effectiveDate: "2026-05-21",
  sourcePath: "docs/legal/builder-partner-terms-v2.md",
};
