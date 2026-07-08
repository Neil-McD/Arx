/* The platform legal document reader — one overlay shared by every surface
   that asks for Terms/Privacy consent (onboarding modal, bridge card). */
import { renderMarkdown } from "../../../../shared/markdownUi";
import type { LegalDocumentEntry } from "../docs/legalDocumentsContent";

export function WebPlatformLegalReaderModal(props: {
  document: LegalDocumentEntry;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay polynet-onboarding-legal-overlay" onClick={props.onClose}>
      <div
        className="modal polynet-onboarding-legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="polynet-onboarding-legal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title" id="polynet-onboarding-legal-title">
              {props.document.title}
            </div>
            <div className="polynet-onboarding-legal-meta">
              {props.document.version} - Effective {props.document.effectiveDate}
            </div>
          </div>
          <button className="modal-close" type="button" onClick={props.onClose} title="Close">
            x
          </button>
        </div>
        <div className="modal-body polynet-onboarding-legal-body">
          <div className="polynet-onboarding-legal-reader message-text">
            {renderMarkdown(props.document.content)}
          </div>
        </div>
      </div>
    </div>
  );
}
