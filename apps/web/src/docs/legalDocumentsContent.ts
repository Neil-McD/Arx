import builderPartnerTermsV1 from "../../../../docs/legal/builder-partner-terms-v1.md?raw";
import {
  BUILDER_PARTNER_TERMS_DOCUMENT,
  type LegalDocument,
  findLegalDocumentBySlug,
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

export const LEGAL_DOCUMENT_ENTRIES: readonly LegalDocumentEntry[] = [
  {
    ...BUILDER_PARTNER_TERMS_DOCUMENT,
    content: stripMarkdownFrontmatter(builderPartnerTermsV1),
  },
] as const;

export const DEFAULT_LEGAL_DOCUMENT_SLUG = BUILDER_PARTNER_TERMS_DOCUMENT.slug;

export function findLegalDocumentEntryBySlug(slug: string | null | undefined): LegalDocumentEntry | null {
  const document = findLegalDocumentBySlug(slug) ?? BUILDER_PARTNER_TERMS_DOCUMENT;
  return LEGAL_DOCUMENT_ENTRIES.find((entry) => entry.key === document.key && entry.version === document.version) ?? null;
}
