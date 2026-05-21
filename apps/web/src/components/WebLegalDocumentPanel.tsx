import type { ReactNode } from "react";
import {
  DEFAULT_LEGAL_DOCUMENT_SLUG,
  findLegalDocumentEntryBySlug,
} from "../docs/legalDocumentsContent";

type WebLegalDocumentPanelProps = {
  activeSlug: string | null;
  renderMarkdown: (text: string) => ReactNode;
};

export function WebLegalDocumentPanel(props: WebLegalDocumentPanelProps) {
  const activeDocument =
    findLegalDocumentEntryBySlug(props.activeSlug) ??
    findLegalDocumentEntryBySlug(DEFAULT_LEGAL_DOCUMENT_SLUG);
  if (!activeDocument) {
    return null;
  }

  return (
    <div className="community-panel product-docs-panel">
      <div className="product-docs-shell">
        <header className="product-docs-header">
          <div>
            <p className="product-docs-kicker">Legal</p>
            <h1>{activeDocument.title}</h1>
            <p>
              Current agreement for the PolyNet Builder Partner Program.
            </p>
          </div>
          <div className="product-docs-header-meta" aria-label="Legal document metadata">
            <span>{activeDocument.version}</span>
            <span>Effective {activeDocument.effectiveDate}</span>
          </div>
        </header>

        <article className="product-docs-reader-shell">
          <div className="product-docs-reader message-text">
            {props.renderMarkdown(activeDocument.content)}
          </div>
        </article>
      </div>
    </div>
  );
}
