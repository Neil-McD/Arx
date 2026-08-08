import { useEffect, useRef, useState } from "react";
import { Link2, Upload, X } from "lucide-react";

import type { CommunityResourcesActions } from "./communityResourcesContracts";

const SOURCE_INTAKE_MAX_ITEMS = 10;

function humanizeCommunitySourceError(raw: string): string {
  const message = String(raw ?? "").trim();
  if (!message) return "Some sources need attention. You can retry them here.";
  if (message.includes("pdf_ingestion_not_supported")) return "PDF reading is not supported yet.";
  if (message.includes("content_type_not_supported")) return "That file is not a supported readable text file.";
  if (message.includes("no_readable_content")) return "Polynet could not find readable text in that source.";
  if (message.includes("source_url") && message.includes("failed")) return "Polynet could not read that public link.";
  if (/^[a-z0-9_]+$/.test(message)) return "That source could not be read yet. You can retry it here.";
  return message;
}

export function WebCommunityKnowledgeSourceIntake(props: {
  communityId: string | null;
  communityName: string | null;
  failedSourceCount: number;
  readySources: Array<{ id: string; ingestedAt: string | null }>;
  onAddSources: CommunityResourcesActions["handleAddCommunitySources"];
  onBuildResources?: CommunityResourcesActions["handleBuildCommunityResources"];
  externalDisabled?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}) {
  const {
    communityId,
    communityName,
    failedSourceCount,
    readySources,
    onAddSources,
    onBuildResources,
    externalDisabled = false,
    onBusyChange,
  } = props;
  const [linkDraft, setLinkDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [phase, setPhase] = useState<"idle" | "saving" | "ingesting">("idle");
  const [isBuildingResources, setIsBuildingResources] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    setLinkDraft("");
    setFiles([]);
    setIsDragOver(false);
    setPhase("idle");
    setIsBuildingResources(false);
    setFeedback(null);
    submitInFlightRef.current = false;
  }, [communityId]);

  const appendFiles = (nextFiles: File[]) => {
    setFeedback(null);
    setFiles((current) => {
      const unique = new Map(current.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
      nextFiles.forEach((file) => unique.set(`${file.name}:${file.size}:${file.lastModified}`, file));
      const combined = Array.from(unique.values());
      if (combined.length > SOURCE_INTAKE_MAX_ITEMS) {
        setFeedback({ tone: "error", message: `Add up to ${SOURCE_INTAKE_MAX_ITEMS} sources at a time.` });
      }
      return combined.slice(0, SOURCE_INTAKE_MAX_ITEMS);
    });
  };

  const runIntake = async (retryExisting: boolean) => {
    if (externalDisabled || submitInFlightRef.current) return;
    const links = linkDraft.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!retryExisting && links.length === 0 && files.length === 0) {
      setFeedback({ tone: "error", message: "Add at least one link or file." });
      return;
    }
    submitInFlightRef.current = true;
    setFeedback(null);
    setPhase(retryExisting ? "ingesting" : "saving");
    try {
      const result = await onAddSources({
        links: retryExisting ? [] : links,
        files: retryExisting ? [] : files,
        retryExisting,
        onPhase: setPhase,
      });
      if (!result) {
        setFeedback({ tone: "error", message: "Could not start source intake. Try again." });
        return;
      }
      if (result.saved > 0) {
        setLinkDraft("");
        setFiles([]);
      }
      const readyCount = result.ingestion?.ready_sources ?? 0;
      const failedCount = result.ingestion?.failed ?? 0;
      if (result.errors.length > 0 || result.rejected > 0 || failedCount > 0) {
        const primaryError = humanizeCommunitySourceError(result.errors[0]
          ?? result.ingestion?.failures[0]?.message
          ?? "Some sources need attention. You can retry them here.");
        const savedCopy = result.saved > 0 ? `${result.saved} source${result.saved === 1 ? "" : "s"} saved. ` : "";
        setFeedback({ tone: "error", message: `${savedCopy}${primaryError}` });
      } else {
        const count = readyCount || result.saved;
        setFeedback({
          tone: "success",
          message: count > 0
            ? `${count} source${count === 1 ? " is" : "s are"} ready for your community.`
            : "Your sources are up to date.",
        });
      }
    } finally {
      setPhase("idle");
      submitInFlightRef.current = false;
    }
  };

  const isBusy = externalDisabled || phase !== "idle" || isBuildingResources;
  const linkCount = linkDraft.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).length;
  const sourceCount = linkCount + files.length;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  const buildResources = async () => {
    if (!communityId || readySources.length === 0 || isBuildingResources || !onBuildResources) return;
    setFeedback(null);
    setIsBuildingResources(true);
    try {
      const opened = await onBuildResources({ communityId, readySources });
      if (!opened) {
        setFeedback({
          tone: "error",
          message: "Your agent could not start this resource build. Try again.",
        });
      }
    } finally {
      setIsBuildingResources(false);
    }
  };

  return (
    <section className="knowledge-source-intake" aria-labelledby="knowledge-source-intake-title">
      <div className="knowledge-source-intake-heading">
        <div className="knowledge-source-intake-eyebrow">Start with what you already know</div>
        <h2 id="knowledge-source-intake-title">Seed your knowledge</h2>
        <p>
          Add the links and notes that best represent how you think. Polynet reads them into the knowledge for
          {` ${communityName ?? "your community"}.`}
        </p>
      </div>

      <div className="knowledge-source-intake-fields">
        <label className="knowledge-source-link-field">
          <span><Link2 aria-hidden="true" /> Links</span>
          <textarea
            value={linkDraft}
            onChange={(event) => {
              setLinkDraft(event.target.value);
              setFeedback(null);
            }}
            placeholder={"https://your-site.com/guide\nhttps://your-site.com/course-notes"}
            rows={3}
            disabled={isBusy}
          />
          <small>One public link per line.</small>
        </label>

        <label
          className={`knowledge-source-file-drop${isDragOver ? " is-drag-over" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isBusy) setIsDragOver(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            if (!isBusy) appendFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <Upload aria-hidden="true" />
          <strong>Drop text files here</strong>
          <span>or choose files</span>
          <small>TXT, Markdown, CSV, JSON, HTML, XML, YAML, TOML · 2.5 MB each</small>
          <input
            type="file"
            multiple
            accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.xml,.html,.htm,.yaml,.yml,.toml,.log,text/*,application/json,application/xml"
            disabled={isBusy}
            onChange={(event) => {
              appendFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {files.length > 0 ? (
        <div className="knowledge-source-file-list" aria-label="Selected files">
          {files.map((file) => (
            <div key={`${file.name}:${file.size}:${file.lastModified}`} className="knowledge-source-file-row">
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={isBusy}
                onClick={() => setFiles((current) => current.filter((candidate) => candidate !== file))}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <div className={`knowledge-source-intake-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.message}
        </div>
      ) : null}

      <div className="knowledge-source-intake-actions">
        <button
          className="knowledge-source-intake-primary"
          type="button"
          disabled={isBusy || sourceCount === 0 || sourceCount > SOURCE_INTAKE_MAX_ITEMS}
          onClick={() => void runIntake(false)}
        >
          {phase === "saving" ? "Saving sources…" : phase === "ingesting" ? "Reading sources…" : "Add and read sources"}
        </button>
        {failedSourceCount > 0 ? (
          <button
            className="knowledge-source-intake-retry"
            type="button"
            disabled={isBusy}
            onClick={() => void runIntake(true)}
          >
            Retry {failedSourceCount} failed source{failedSourceCount === 1 ? "" : "s"}
          </button>
        ) : null}
        <span>{sourceCount > 0 ? `${sourceCount} of ${SOURCE_INTAKE_MAX_ITEMS} selected` : "You can add more sources later."}</span>
      </div>
      {readySources.length > 0 && onBuildResources ? (
        <div className="knowledge-source-build-action">
          <div>
            <strong>{readySources.length} ready source{readySources.length === 1 ? "" : "s"}</strong>
            <span>Your agent will turn them into a draft structure for you to review.</span>
          </div>
          <button
            type="button"
            disabled={isBusy || isBuildingResources}
            onClick={() => void buildResources()}
          >
            {isBuildingResources ? "Opening your agent…" : "Build my resources"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
