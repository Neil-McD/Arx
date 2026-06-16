import type { ChangeEvent } from "react";

import {
  PROJECT_CONTEXT_LINKS_MAX,
  PROJECT_CONTEXT_LINK_URL_MAX_CHARS,
  PROJECT_INSTRUCTIONS_MAX_CHARS,
} from "../../../../shared/projectContext";

type WebCreateProjectModalProps = {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  projectName: string;
  projectDescription: string;
  projectInstructions: string;
  projectLinksText: string;
  importFileName?: string | null;
  importHint?: string;
  showImportSection?: boolean;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeInstructions: (value: string) => void;
  onChangeLinksText: (value: string) => void;
  onImportFilesChange: (files: FileList | null) => void;
  onSubmit: () => void | Promise<void>;
};

export function WebCreateProjectModal(props: WebCreateProjectModalProps) {
  const {
    isOpen,
    title = "New project",
    subtitle = "Create a durable project workspace. Imports are staged here next.",
    submitLabel = "Create project",
    projectName,
    projectDescription,
    projectInstructions,
    projectLinksText,
    importFileName = null,
    importHint = "Upload a .zip of an existing repo or workspace folder.",
    showImportSection = true,
    isSubmitting,
    error,
    onClose,
    onChangeName,
    onChangeDescription,
    onChangeInstructions,
    onChangeLinksText,
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
              <span>Project name</span>
              <input
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(event) => onChangeName(event.target.value)}
                maxLength={120}
              />
            </label>
            <label className="create-project-field">
              <span>Project description</span>
              <textarea
                placeholder="A short description of what this project is for"
                rows={4}
                value={projectDescription}
                onChange={(event) => onChangeDescription(event.target.value)}
                maxLength={600}
              />
            </label>
            <label className="create-project-field">
              <span>Project instructions</span>
              <textarea
                placeholder="Persistent context and working preferences for threads in this project"
                rows={5}
                value={projectInstructions}
                onChange={(event) => onChangeInstructions(event.target.value)}
                maxLength={PROJECT_INSTRUCTIONS_MAX_CHARS}
              />
            </label>
            <label className="create-project-field">
              <span>Project links</span>
              <textarea
                placeholder={`https://example.com\nDocs - https://example.com/docs`}
                rows={4}
                value={projectLinksText}
                onChange={(event) => onChangeLinksText(event.target.value)}
                maxLength={(PROJECT_CONTEXT_LINK_URL_MAX_CHARS + 130) * PROJECT_CONTEXT_LINKS_MAX}
              />
              <div className="create-project-hint">One link per line. Use a bare URL or Title - URL.</div>
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
