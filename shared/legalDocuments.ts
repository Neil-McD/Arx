export const TERMS_OF_SERVICE_VERSION = "terms_of_service_v4";
export const PREVIOUS_TERMS_OF_SERVICE_VERSION = "terms_of_service_v3";
export const HISTORICAL_TERMS_OF_SERVICE_VERSION = "terms_of_service_v2";
export const LEGACY_TERMS_OF_SERVICE_VERSION = "terms_of_service_v1";
export const PRIVACY_AI_DATA_POLICY_VERSION = "privacy_ai_data_policy_v1";

export type LegalDocumentKey =
  | "terms_of_service"
  | "privacy_ai_data_policy";

export type LegalDocument = {
  key: LegalDocumentKey;
  version: string;
  title: string;
  effectiveDate: string;
  sourcePath: string;
};

// Where anyone can read a document before agreeing to it: its canonical text
// in Polynet's public repository.
export const LEGAL_DOCUMENT_PUBLIC_BASE_URL = "https://github.com/Neil-McD/Arx/blob/main/";
export function legalDocumentPublicUrl(document: LegalDocument): string {
  return `${LEGAL_DOCUMENT_PUBLIC_BASE_URL}${document.sourcePath}`;
}

export const TERMS_OF_SERVICE_DOCUMENT: LegalDocument = {
  key: "terms_of_service",
  version: TERMS_OF_SERVICE_VERSION,
  title: "Polynet Terms of Service v4",
  effectiveDate: "2026-11-03",
  sourcePath: "docs/legal/terms-of-service-v4.md",
};

export const PREVIOUS_TERMS_OF_SERVICE_DOCUMENT: LegalDocument = {
  key: "terms_of_service",
  version: PREVIOUS_TERMS_OF_SERVICE_VERSION,
  title: "Polynet Terms of Service v3",
  effectiveDate: "2026-08-06",
  sourcePath: "docs/legal/terms-of-service-v3.md",
};

export const HISTORICAL_TERMS_OF_SERVICE_DOCUMENT: LegalDocument = {
  key: "terms_of_service",
  version: HISTORICAL_TERMS_OF_SERVICE_VERSION,
  title: "Polynet Terms of Service v2",
  effectiveDate: "2026-08-02",
  sourcePath: "docs/legal/terms-of-service-v2.md",
};

export const LEGACY_TERMS_OF_SERVICE_DOCUMENT: LegalDocument = {
  key: "terms_of_service",
  version: LEGACY_TERMS_OF_SERVICE_VERSION,
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

export const PLATFORM_LEGAL_DOCUMENTS = [
  TERMS_OF_SERVICE_DOCUMENT,
  PRIVACY_AI_DATA_POLICY_DOCUMENT,
] as const;
