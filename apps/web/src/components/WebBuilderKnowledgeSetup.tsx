import { useMemo, useRef, useState } from "react";

import { WebCommunityKnowledgeSourceIntake } from "./WebCommunityKnowledgeSourceIntake";
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
  onComplete: () => Promise<boolean>;
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

  const complete = async () => {
    if (controlsDisabled || completionInFlightRef.current) return;
    completionInFlightRef.current = true;
    setCompletionError(null);
    setIsCompleting(true);
    try {
      const completed = await props.onComplete();
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
    <main className="builder-knowledge-setup" aria-busy={controlsDisabled}>
      <div className="builder-knowledge-setup-brand" aria-label="Polynet">
        <img src="/landing-polynet/logo.png" alt="" />
        <strong>Polynet<span>.</span></strong>
      </div>
      <section className="builder-knowledge-setup-card" aria-labelledby="builder-knowledge-setup-title">
        <div className="builder-knowledge-setup-step">Community setup · 2 of 2</div>
        <h1 id="builder-knowledge-setup-title">Add your community knowledge.</h1>
        <p className="builder-knowledge-setup-intro">
          Add links or files now, or skip and do this later from Resources.
        </p>

        <WebCommunityKnowledgeSourceIntake
          communityId={props.community.id}
          communityName={props.community.name}
          failedSourceCount={failedSourceCount}
          readySources={readySources}
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
            onClick={() => void complete()}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="builder-knowledge-setup-next"
            disabled={controlsDisabled || !canContinue}
            onClick={() => void complete()}
          >
            {isCompleting ? "Finishing…" : "Next"}
          </button>
        </div>
      </section>
    </main>
  );
}
