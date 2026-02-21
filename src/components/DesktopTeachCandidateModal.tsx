import type { CommunityEvidenceItem } from "../../shared/communityEvidence";
import { CommunityEvidenceCitations } from "../../shared/CommunityEvidenceCitations";

type TeachCandidateDraftView = {
  evidenceItems: CommunityEvidenceItem[];
};

type DesktopTeachCandidateModalProps = {
  draft: TeachCandidateDraftView | null;
  titleInput: string;
  memoryInput: string;
  submitError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
  onChangeTitle: (value: string) => void;
  onChangeMemory: (value: string) => void;
};

export function DesktopTeachCandidateModal(props: DesktopTeachCandidateModalProps) {
  const {
    draft,
    titleInput,
    memoryInput,
    submitError,
    isSubmitting,
    onClose,
    onSubmit,
    onChangeTitle,
    onChangeMemory,
  } = props;

  if (!draft) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Teach community</div>
          <button
            className="modal-close"
            onClick={onClose}
            title="Close"
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="resource-form">
            <input
              type="text"
              placeholder="Memory title (optional)"
              value={titleInput}
              onChange={(event) => onChangeTitle(event.target.value)}
              disabled={isSubmitting}
            />
            <textarea
              placeholder="Memory text"
              value={memoryInput}
              onChange={(event) => onChangeMemory(event.target.value)}
              disabled={isSubmitting}
            />
            <div className="resource-meta">
              <span>Evidence items</span>
              <span>{draft.evidenceItems.length}</span>
            </div>
            {draft.evidenceItems.length > 0 ? (
              <CommunityEvidenceCitations items={draft.evidenceItems.slice(0, 6)} />
            ) : (
              <div className="create-community-hint">
                No evidence captured on this turn. This candidate will go to community review.
              </div>
            )}
            {submitError && <div className="auth-error">{submitError}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <div className="resource-modal-actions">
            <button
              onClick={() => void onSubmit()}
              disabled={isSubmitting || memoryInput.trim().length === 0}
            >
              {isSubmitting ? "Teaching..." : "Teach community"}
            </button>
            <button className="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
