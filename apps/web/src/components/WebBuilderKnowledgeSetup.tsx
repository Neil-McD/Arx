import { useMemo, useRef, useState } from "react";

import { WebCommunityKnowledgeSourceIntake } from "./WebCommunityKnowledgeSourceIntake";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import type {
  CommunityResource,
  CommunityResourcesActions,
} from "./communityResourcesContracts";

type WebBuilderKnowledgeSetupProps = {
  community: {
    id: string;
    name: string;
  };
  isHydrating: boolean;
  resources: CommunityResource[];
  onAddSources: CommunityResourcesActions["handleAddCommunitySources"];
  onComplete: (mode: "skip" | "build") => Promise<boolean>;
};

export function WebBuilderKnowledgeSetup(props: WebBuilderKnowledgeSetupProps) {
  const [isIntakeBusy, setIsIntakeBusy] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionInFlightRef = useRef(false);
  const sourceResources = useMemo(
    () => props.resources.filter((resource) => resource.resource_role === "source"),
    [props.resources],
  );
  const readySources = useMemo(
    () => sourceResources
      .filter((resource) => resource.source_ingestion_status === "ready")
      .map((resource) => ({
        id: resource.id,
        ingestedAt: resource.source_ingested_at ?? null,
      })),
    [sourceResources],
  );
  const failedSourceCount = sourceResources.filter(
    (resource) => resource.source_ingestion_status === "failed",
  ).length;
  const hasPendingSources = sourceResources.some((resource) => (
    resource.source_ingestion_status !== "ready"
    && resource.source_ingestion_status !== "failed"
  ));
  const controlsDisabled = props.isHydrating || isIntakeBusy || isCompleting;
  const canContinue = readySources.length > 0 && !hasPendingSources && !props.isHydrating;

  const complete = async (mode: "skip" | "build") => {
    if (controlsDisabled || completionInFlightRef.current) return;
    completionInFlightRef.current = true;
    setCompletionError(null);
    setIsCompleting(true);
    try {
      const completed = await props.onComplete(mode);
      if (!completed) {
        setCompletionError("Polynet could not finish setup. Try again.");
      }
    } catch (error) {
      setCompletionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Polynet could not finish setup. Try again.",
      );
    } finally {
      completionInFlightRef.current = false;
      setIsCompleting(false);
    }
  };

  return (
    <WebBlockingSetupModal
      titleId="builder-knowledge-setup-title"
      descriptionId="builder-knowledge-setup-description"
      busy={controlsDisabled}
      size="wide"
      className="builder-knowledge-setup-modal"
    >
      <section className="builder-knowledge-setup-card">
        <div className="builder-knowledge-setup-step">Community setup · 2 of 2</div>
        <h1 id="builder-knowledge-setup-title">Add your community knowledge.</h1>
        <p id="builder-knowledge-setup-description" className="builder-knowledge-setup-intro">
          Add links or files now, or skip for now.
        </p>

        <WebCommunityKnowledgeSourceIntake
          communityId={props.community.id}
          communityName={props.community.name}
          failedSourceCount={failedSourceCount}
          onAddSources={props.onAddSources}
          externalDisabled={props.isHydrating || isCompleting}
          onBusyChange={setIsIntakeBusy}
        />

        {props.isHydrating ? (
          <div className="builder-knowledge-setup-status" role="status">
            Loading your community knowledge…
          </div>
        ) : readySources.length > 0 ? (
          <div className="builder-knowledge-setup-status is-ready" role="status">
            {readySources.length} source{readySources.length === 1 ? " is" : "s are"} ready.
          </div>
        ) : null}
        {completionError ? (
          <div className="builder-knowledge-setup-error" role="alert">{completionError}</div>
        ) : null}

        <div className="builder-knowledge-setup-actions">
          <button
            type="button"
            className="builder-knowledge-setup-skip"
            disabled={controlsDisabled}
            onClick={() => void complete("skip")}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="builder-knowledge-setup-next"
            disabled={controlsDisabled || !canContinue}
            onClick={() => void complete("build")}
          >
            {isCompleting ? "Building your resources…" : "Next"}
          </button>
        </div>
      </section>
    </WebBlockingSetupModal>
  );
}
