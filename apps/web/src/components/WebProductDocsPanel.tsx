import { useMemo, type ReactNode } from "react";

import {
  PRODUCT_DOCS,
  PRODUCT_DOCS_DEFAULT_SLUG,
  findProductDocBySlug,
  groupProductDocsBySection,
  type ProductDocEntry,
} from "../docs/productDocsContent";
import "./WebProductDocsPanel.css";

type WebProductDocsPanelProps = {
  activeSlug: string | null;
  onSelectSlug: (slug: string) => void;
  renderMarkdown: (text: string) => ReactNode;
};

function getActiveDoc(activeSlug: string | null): ProductDocEntry {
  const activeDoc =
    findProductDocBySlug(activeSlug) ??
    findProductDocBySlug(PRODUCT_DOCS_DEFAULT_SLUG) ??
    PRODUCT_DOCS[0];
  if (!activeDoc) {
    throw new Error("Product docs manifest is empty");
  }
  return activeDoc;
}

export function WebProductDocsPanel(props: WebProductDocsPanelProps) {
  const sections = useMemo(() => groupProductDocsBySection(), []);
  const activeDoc = getActiveDoc(props.activeSlug);

  return (
    <div className="community-panel product-docs-panel">
      <div className="product-docs-shell">
        <header className="product-docs-header">
          <div>
            <p className="product-docs-kicker">Product documentation</p>
            <h1>Polynet Docs</h1>
            <p>
              Source-of-truth docs for builders, members, and agents. These
              pages are concise Markdown files designed to be readable by people
              and easy for LLMs to ingest.
            </p>
          </div>
          <div className="product-docs-header-meta" aria-label="Docs metadata">
            <span>Alpha current</span>
            <span>LLM ingestible</span>
          </div>
        </header>

        <div className="product-docs-layout">
          <nav className="product-docs-nav" aria-label="Product docs">
            {sections.map((section) => (
              <div className="product-docs-nav-section" key={section.section}>
                <h2>{section.section}</h2>
                <div className="product-docs-nav-list">
                  {section.docs.map((doc) => (
                    <button
                      key={doc.id}
                      className={`product-docs-nav-item${
                        doc.slug === activeDoc.slug ? " active" : ""
                      }`}
                      type="button"
                      onClick={() => props.onSelectSlug(doc.slug)}
                    >
                      <span>{doc.title}</span>
                      <small>{doc.summary}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <article className="product-docs-reader-shell">
            <div className="product-docs-reader-topline">
              <div>
                <span className="product-docs-reader-section">{activeDoc.section}</span>
                <h2>{activeDoc.title}</h2>
              </div>
              <div className="product-docs-audience">
                {activeDoc.audience.map((audience) => (
                  <span key={audience}>{audience}</span>
                ))}
              </div>
            </div>
            <div className="product-docs-reader message-text">
              {props.renderMarkdown(activeDoc.content)}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
