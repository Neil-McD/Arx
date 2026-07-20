import { BUILDER_PARTNER_TERMS_VERSION } from "./builderPartnerProgram";

export const TERMS_OF_SERVICE_VERSION = "terms_of_service_v1";
export const PRIVACY_AI_DATA_POLICY_VERSION = "privacy_ai_data_policy_v1";

export type LegalDocumentKey =
  | "terms_of_service"
  | "privacy_ai_data_policy"
  | "builder_partner_terms";

export type LegalDocument = {
  key: LegalDocumentKey;
  version: string;
  title: string;
  effectiveDate: string;
  sourcePath: string;
};

export const TERMS_OF_SERVICE_DOCUMENT: LegalDocument = {
  key: "terms_of_service",
  version: TERMS_OF_SERVICE_VERSION,
  title: "Polynet Terms of Service v1",
  effectiveDate: "2026-05-21",
  sourcePath: "docs/legal/terms-of-service-v1.md",
};

export const PRIVACY_AI_DATA_POLICY_DOCUMENT: LegalDocument = {
  key: "privacy_ai_data_policy",
  version: PRIVACY_AI_DATA_POLICY_VERSION,
  title: "Polynet Privacy & AI Data Policy v1",
  effectiveDate: "2026-05-21",
  sourcePath: "docs/legal/privacy-ai-data-policy-v1.md",
};

export const BUILDER_PARTNER_TERMS_DOCUMENT: LegalDocument = {
  key: "builder_partner_terms",
  version: BUILDER_PARTNER_TERMS_VERSION,
  title: "Builder Partner Terms v3",
  effectiveDate: "2026-07-20",
  sourcePath: "docs/legal/builder-partner-terms-v3.md",
};

export const PLATFORM_LEGAL_DOCUMENTS = [
  TERMS_OF_SERVICE_DOCUMENT,
  PRIVACY_AI_DATA_POLICY_DOCUMENT,
] as const;
