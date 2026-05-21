import builderPartnerTermsV2 from "../../../../docs/legal/builder-partner-terms-v2.md?raw";
import privacyAiDataPolicyV1 from "../../../../docs/legal/privacy-ai-data-policy-v1.md?raw";
import termsOfServiceV1 from "../../../../docs/legal/terms-of-service-v1.md?raw";
import {
  BUILDER_PARTNER_TERMS_DOCUMENT,
  PRIVACY_AI_DATA_POLICY_DOCUMENT,
  TERMS_OF_SERVICE_DOCUMENT,
  type LegalDocument,
} from "../../../../shared/legalDocuments";

export type LegalDocumentEntry = LegalDocument & {
  content: string;
};

const FRONTMATTER_DELIMITER = "---";

function stripMarkdownFrontmatter(source: string): string {
  const normalized = String(source ?? "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    return normalized.trimStart();
  }
  const closingDelimiterIndex = normalized.indexOf(
    `\n${FRONTMATTER_DELIMITER}\n`,
    FRONTMATTER_DELIMITER.length + 1,
  );
  if (closingDelimiterIndex < 0) {
    return normalized.trimStart();
  }
  return normalized
    .slice(closingDelimiterIndex + FRONTMATTER_DELIMITER.length + 2)
    .trimStart();
}

export const BUILDER_PARTNER_TERMS_ENTRY: LegalDocumentEntry = {
  ...BUILDER_PARTNER_TERMS_DOCUMENT,
  content: stripMarkdownFrontmatter(builderPartnerTermsV2),
};

export const TERMS_OF_SERVICE_ENTRY: LegalDocumentEntry = {
  ...TERMS_OF_SERVICE_DOCUMENT,
  content: stripMarkdownFrontmatter(termsOfServiceV1),
};

export const PRIVACY_AI_DATA_POLICY_ENTRY: LegalDocumentEntry = {
  ...PRIVACY_AI_DATA_POLICY_DOCUMENT,
  content: stripMarkdownFrontmatter(privacyAiDataPolicyV1),
};
