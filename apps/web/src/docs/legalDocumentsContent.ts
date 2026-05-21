import builderPartnerTermsV1 from "../../../../docs/legal/builder-partner-terms-v1.md?raw";
import {
  BUILDER_PARTNER_TERMS_DOCUMENT,
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
  content: stripMarkdownFrontmatter(builderPartnerTermsV1),
};
