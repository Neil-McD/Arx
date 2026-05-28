import type { ChangeEvent } from "react";

type WebCreateProjectModalProps = {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  projectName: string;
  projectDescription: string;
  importFileName?: string | null;
  importHint?: string;
  showImportSection?: boolean;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onImportFilesChange: (files: FileList | null) => void;
  onSubmit: () => void | Promise<void>;
};

export function WebCreateProjectModal(props: WebCreateProjectModalProps) {
  const {
    isOpen,
    title = "New computer",
    subtitle = "Create a fresh workspace computer. Imports are staged here next.",
    submitLabel = "Create computer",
    projectName,
    projectDescription,
    importFileName = null,
    importHint = "Upload a .zip of an existing repo or workspace folder.",
    showImportSection = true,
    isSubmitting,
    error,
    onClose,
    onChangeName,
    onChangeDescription,
    onImportFilesChange,
    onSubmit,
  } = props;

  if (!isOpen) return null;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onImportFilesChange(event.target.files);
    event.target.value = "";
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-project-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="create-project-heading">
            <div className="modal-title">{title}</div>
            <div className="create-project-subtitle">{subtitle}</div>
          </div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="create-project-form">
            <label className="create-project-field">
              <span>Computer name</span>
              <input
                type="text"
                placeholder="Computer name"
                value={projectName}
                onChange={(event) => onChangeName(event.target.value)}
                maxLength={120}
              />
            </label>
            <label className="create-project-field">
              <span>Computer description</span>
              <textarea
                placeholder="A short description of what this computer is for"
                rows={4}
                value={projectDescription}
                onChange={(event) => onChangeDescription(event.target.value)}
                maxLength={600}
              />
            </label>
            {showImportSection ? (
              <div className="create-project-field">
                <span>Import files</span>
                <label className="create-project-upload">
                  <input type="file" accept=".zip,application/zip" onChange={handleFileChange} />
                  <span>{importFileName ? importFileName : "Choose .zip"}</span>
                </label>
                <div className="create-project-hint">{importHint}</div>
              </div>
            ) : null}
            {error ? <div className="auth-error">{error}</div> : null}
          </div>
        </div>
        <div className="modal-footer create-project-footer">
          <button type="button" className="create-project-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="create-project-primary" onClick={() => void onSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
