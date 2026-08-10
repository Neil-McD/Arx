import { useEffect, useMemo, useRef, useState } from "react";

import { WebCommunityKnowledgeSourceIntake } from "./WebCommunityKnowledgeSourceIntake";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import {
  RuntimeResourceChangesetApprovalCards,
  type ResourceChangesetCardModel,
} from "./RuntimeResourceChangesetApprovalCards";
import type { AuthSessionLike } from "../../../../shared/authSession";
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
  session: AuthSessionLike;
  onAddSources: CommunityResourcesActions["handleAddCommunitySources"];
  onBuildResources: CommunityResourcesActions["handleBuildCommunityResources"];
  changesetCards: ResourceChangesetCardModel[];
  changesetRecoveryError: string | null;
  onComplete: () => Promise<boolean>;
};

export function WebBuilderKnowledgeSetup(props: WebBuilderKnowledgeSetupProps) {
  const [isIntakeBusy, setIsIntakeBusy] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isStartingBuild, setIsStartingBuild] = useState(false);
  const [buildRequested, setBuildRequested] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionInFlightRef = useRef(false);
  const buildInFlightRef = useRef(false);
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
  const baseBusy = props.isHydrating || isIntakeBusy || isCompleting;
  const hasChangeset = props.changesetCards.length > 0;
  const controlsDisabled = baseBusy || isStartingBuild || buildRequested || hasChangeset;
  const canContinue = readySources.length > 0 && !hasPendingSources && !props.isHydrating;

  useEffect(() => {
    if (props.changesetCards.length === 0) return;
    setBuildRequested(false);
    setCompletionError(null);
  }, [props.changesetCards.length]);

  useEffect(() => {
    if (!buildRequested || hasChangeset) return;
    const timeoutId = window.setTimeout(() => {
      setBuildRequested(false);
      setCompletionError(
        "Your agent is taking longer than expected. Try again, or skip and add knowledge later.",
      );
    }, 90_000);
    return () => window.clearTimeout(timeoutId);
  }, [buildRequested, hasChangeset]);

  const complete = async () => {
    if (baseBusy || completionInFlightRef.current) return;
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

  const buildResources = async () => {
    if (
      !canContinue
      || controlsDisabled
      || buildInFlightRef.current
    ) return;
    buildInFlightRef.current = true;
    setCompletionError(null);
    setIsStartingBuild(true);
    try {
      const opened = await props.onBuildResources({
        communityId: props.community.id,
        readySources,
      });
      if (!opened) {
        setCompletionError(
          "Your agent could not start the resource draft. Finish its current message, then try again.",
        );
        return;
      }
      setBuildRequested(true);
    } catch (error) {
      setCompletionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Your agent could not start the resource draft.",
      );
    } finally {
      buildInFlightRef.current = false;
      setIsStartingBuild(false);
    }
  };

  return (
    <WebBlockingSetupModal
      titleId="builder-knowledge-setup-title"
      descriptionId="builder-knowledge-setup-description"
      busy={controlsDisabled}
      size="wide"
      className="builder-knowledge-setup"
    >
      <section className="builder-knowledge-setup-card">
        <div className="builder-knowledge-setup-step">Community setup · 2 of 2</div>
        <h1 id="builder-knowledge-setup-title">Add your community knowledge.</h1>
        <p id="builder-knowledge-setup-description" className="builder-knowledge-setup-intro">
          Add links or files now, or skip and do this later from Resources.
        </p>

        {hasChangeset ? (
          <RuntimeResourceChangesetApprovalCards
            cards={props.changesetCards}
            session={props.session}
            onInitialResourcesApplied={() => {
              void complete();
            }}
            disableInitialResourcesAction={isCompleting}
          />
        ) : (
          <WebCommunityKnowledgeSourceIntake
            communityId={props.community.id}
            communityName={props.community.name}
            failedSourceCount={failedSourceCount}
            readySources={readySources}
            onAddSources={props.onAddSources}
            externalDisabled={props.isHydrating || isCompleting || buildRequested}
            onBusyChange={setIsIntakeBusy}
          />
        )}

        {props.isHydrating ? (
          <div className="builder-knowledge-setup-status" role="status">
            Loading your community knowledge…
          </div>
        ) : buildRequested ? (
          <div className="builder-knowledge-setup-status is-ready" role="status">
            Your agent is building the first resource draft…
          </div>
        ) : hasChangeset ? null : readySources.length > 0 ? (
          <div className="builder-knowledge-setup-status is-ready" role="status">
            {readySources.length} source{readySources.length === 1 ? " is" : "s are"} ready.
          </div>
        ) : null}
        {completionError || props.changesetRecoveryError ? (
          <div className="builder-knowledge-setup-error" role="alert">
            {completionError ?? props.changesetRecoveryError}
          </div>
        ) : null}

        {!hasChangeset ? <div className="builder-knowledge-setup-actions">
          <button
            type="button"
            className="builder-knowledge-setup-skip"
            disabled={baseBusy || isStartingBuild || buildRequested}
            onClick={() => void complete()}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="builder-knowledge-setup-next"
            disabled={controlsDisabled || !canContinue}
            onClick={() => void buildResources()}
          >
            {isStartingBuild ? "Starting…" : "Next"}
          </button>
        </div> : null}
      </section>
    </WebBlockingSetupModal>
  );
}
