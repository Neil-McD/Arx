// Polynet's Terms and Privacy & AI Data Policy as plain public pages
// (/terms, /privacy): what Join's "By joining you agree…" links to. The same
// text people accept; no sign-in and none of the app loads for it.
import { renderMarkdown } from "../../../../shared/markdownUi";
import { stripShellVariantFromPathname } from "../../../../shared/webAppRouteState";
import { LEGAL_DOCUMENT_PATHS, type LegalDocumentKey } from "../../../../shared/legalDocuments";
import { PRIVACY_AI_DATA_POLICY_ENTRY, TERMS_OF_SERVICE_ENTRY } from "../docs/legalDocumentsContent";
import "./LegalDocumentPage.css";

export function legalDocumentKeyForPathname(pathname: string): LegalDocumentKey | null {
  const path = stripShellVariantFromPathname(pathname || "/").replace(/\/+$/, "") || "/";
  const match = (Object.keys(LEGAL_DOCUMENT_PATHS) as LegalDocumentKey[]).find((key) => LEGAL_DOCUMENT_PATHS[key] === path);
  return match ?? null;
}

export function LegalDocumentPage(props: { documentKey: LegalDocumentKey }) {
  const document = props.documentKey === "terms_of_service" ? TERMS_OF_SERVICE_ENTRY : PRIVACY_AI_DATA_POLICY_ENTRY;
  return (
    <main className="legal-page">
      <article className="legal-page-document">
        <a className="legal-page-home" href="/">Polynet</a>
        <h1 className="legal-page-title">{document.title}</h1>
        <p className="legal-page-meta">Effective {document.effectiveDate}</p>
        <div className="polynet-onboarding-legal-reader message-text">{renderMarkdown(document.content)}</div>
      </article>
    </main>
  );
}
