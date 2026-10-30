import { useEffect, useMemo, useState } from "react";
import { renderMarkdown } from "../../../../shared/markdownUi";
import type { CommunityResourceVersion } from "./communityResourcesContracts";

type WebLessonVersionHistoryProps = {
  resourceTitle: string;
  load: () => Promise<CommunityResourceVersion[]>;
  onRestore: (version: CommunityResourceVersion) => Promise<boolean>;
  onClose: () => void;
};

function versionTime(iso: string | null): string {
  if (!iso) return "Earlier";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? `Today, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Earlier versions of a lesson, newest first, Google Docs style: pick one on
// the left, read it on the right, and put it back. The version it replaces is
// kept too, so a restore can be undone from here as well.
export function WebLessonVersionHistory(props: WebLessonVersionHistoryProps) {
  const { load, onRestore, onClose } = props;
  const [versions, setVersions] = useState<CommunityResourceVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((rows) => {
        if (!live) return;
        setVersions(rows);
        setSelectedId(rows[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "Couldn't load earlier versions.");
      });
    return () => {
      live = false;
    };
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRestoring) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRestoring, onClose]);

  const selected = versions?.find((version) => version.id === selectedId) ?? null;
  const preview = useMemo(
    () => (selected ? renderMarkdown(selected.body_md, { embedStandaloneMedia: true, headingLevelOffset: 1 }) : null),
    [selected],
  );

  const restore = async () => {
    if (!selected) return;
    setIsRestoring(true);
    setError(null);
    const ok = await onRestore(selected);
    setIsRestoring(false);
    if (ok) onClose();
    else setError("Couldn't restore that version. Try again.");
  };

  return (
    <div className="modal-overlay" onClick={() => !isRestoring && onClose()}>
      <div
        className="modal resource-modal lesson-history-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="resource-viewer-eyebrow">Version history</div>
            <h2 className="lesson-history-title">{props.resourceTitle || "Untitled lesson"}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} title="Close" disabled={isRestoring}>
            x
          </button>
        </div>
        <div className="lesson-history-body">
          {versions === null && !error ? <p className="lesson-history-empty">Loading earlier versions…</p> : null}
          {versions && versions.length === 0 ? (
            <p className="lesson-history-empty">
              No earlier versions yet. Each time you come back and edit this lesson, the version before your edits is kept here.
            </p>
          ) : null}
          {versions && versions.length > 0 ? (
            <>
              <ol className="lesson-history-list" aria-label="Earlier versions">
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      className={`lesson-history-item${version.id === selectedId ? " is-selected" : ""}`}
                      aria-pressed={version.id === selectedId}
                      onClick={() => setSelectedId(version.id)}
                    >
                      <strong>{versionTime(version.saved_at)}</strong>
                      <span>{version.title || "Untitled"} · {version.body_chars.toLocaleString()} characters</span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="lesson-history-preview resource-viewer-prose">{preview}</div>
            </>
          ) : null}
        </div>
        <div className="lesson-history-footer">
          {error ? <span className="auth-error" role="alert">{error}</span> : <span>Restoring keeps the current version in this list.</span>}
          <button
            type="button"
            className="settings-primary-action"
            onClick={() => void restore()}
            disabled={!selected || isRestoring}
          >
            {isRestoring ? "Restoring…" : "Restore this version"}
          </button>
        </div>
      </div>
    </div>
  );
}
