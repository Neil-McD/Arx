type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebAccountDataExportSectionProps = {
  session: SessionLike;
  error: string | null;
  isExporting: boolean;
  exportThreadsCsv: () => Promise<void> | void;
  exportMessagesCsv: () => Promise<void> | void;
  exportMemoryCsv: () => Promise<void> | void;
};

export function WebAccountDataExportSection(
  props: WebAccountDataExportSectionProps,
) {
  const {
    session,
    error,
    isExporting,
    exportThreadsCsv,
    exportMessagesCsv,
    exportMemoryCsv,
  } = props;

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <svg viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Data and privacy
      </div>
      <div className="settings-section-desc">
        Download your threads, messages, and personal memory as CSV.
      </div>
      {error ? <div className="auth-error">{error}</div> : null}
      <div className="export-actions">
        <button
          className="secondary"
          type="button"
          onClick={() => void exportThreadsCsv()}
          disabled={!session || isExporting}
        >
          Threads CSV
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => void exportMessagesCsv()}
          disabled={!session || isExporting}
        >
          Messages CSV
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => void exportMemoryCsv()}
          disabled={!session || isExporting}
        >
          Memory CSV
        </button>
      </div>
    </div>
  );
}
