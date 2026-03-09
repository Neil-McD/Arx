import { useEffect, useState } from "react";
import { copyTextToClipboard } from "../../../../shared/chatUi";

type WebMemoryImportModalProps = {
  isOpen: boolean;
  importPrompt: string;
  importText: string;
  parsedCount: number;
  duplicateCount: number;
  error: string | null;
  isImporting: boolean;
  onChangeImportText: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

export function WebMemoryImportModal(props: WebMemoryImportModalProps) {
  const {
    isOpen,
    importPrompt,
    importText,
    parsedCount,
    duplicateCount,
    error,
    isImporting,
    onChangeImportText,
    onClose,
    onImport,
  } = props;
  const [didCopyPrompt, setDidCopyPrompt] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDidCopyPrompt(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const uniqueCount = Math.max(0, parsedCount - duplicateCount);
  const summary =
    parsedCount === 0
      ? "Paste the export from your other AI provider. Each exported line becomes a separate personal memory."
      : duplicateCount > 0
        ? `${parsedCount} entries detected. ${uniqueCount} new, ${duplicateCount} already in memory.`
        : `${parsedCount} entries detected and ready to import.`;

  const handleCopyPrompt = async () => {
    await copyTextToClipboard(importPrompt);
    setDidCopyPrompt(true);
    window.setTimeout(() => setDidCopyPrompt(false), 1800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal memory-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Import memory from other AI providers</div>
          <button className="modal-close" type="button" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="memory-import-shell">
            <section className="memory-import-step">
              <div className="memory-import-step-index">1</div>
              <div className="memory-import-step-body">
                <div className="memory-import-step-title">Copy this prompt into your other AI provider</div>
                <div className="memory-import-step-hint">
                  Use this exact export prompt so the import lands cleanly as structured personal memory.
                </div>
                <div className="memory-import-prompt-shell">
                  <div className="memory-import-prompt-header">
                    <div className="memory-import-prompt-label">Export prompt</div>
                    <button
                      className={`memory-import-copy-button${didCopyPrompt ? " is-copied" : ""}`}
                      type="button"
                      onClick={() => void handleCopyPrompt()}
                    >
                      {didCopyPrompt ? "Copied" : "Copy prompt"}
                    </button>
                  </div>
                  <pre className="memory-import-prompt-text">{importPrompt}</pre>
                </div>
              </div>
            </section>

            <section className="memory-import-step">
              <div className="memory-import-step-index">2</div>
              <div className="memory-import-step-body">
                <div className="memory-import-step-title">Paste the provider output to save it as personal memory</div>
                <div className="memory-import-step-hint">{summary}</div>
                <textarea
                  className="memory-import-textarea"
                  value={importText}
                  onChange={(event) => onChangeImportText(event.target.value)}
                  placeholder="Paste the exported memory here"
                  rows={14}
                  disabled={isImporting}
                />
                {error ? <div className="auth-error">{error}</div> : null}
              </div>
            </section>
          </div>
        </div>
        <div className="modal-footer">
          <div className="memory-import-actions">
            <button className="create-community-secondary" type="button" onClick={onClose} disabled={isImporting}>
              Cancel
            </button>
            <button
              className="platform-save-button"
              type="button"
              onClick={onImport}
              disabled={isImporting || uniqueCount === 0}
            >
              {isImporting ? "Importing..." : "Add to memory"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
