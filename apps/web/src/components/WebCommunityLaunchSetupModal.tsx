import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Check,
  Circle,
  FileText,
  Globe2,
  Image,
  LockKeyhole,
  PlugZap,
  X,
} from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import type {
  CommunityLaunchSetupMissing,
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../../shared/communityLaunchSetup";

type CommunityLaunchSetupCommunity = {
  name: string;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WebCommunityLaunchSetupModalProps = {
  isOpen: boolean;
  community: CommunityLaunchSetupCommunity | null;
  status: CommunityLaunchSetupStatus | null;
  onClose: () => void;
  onOpenStep: (step: CommunityLaunchSetupStep) => void;
};

const STEP_ORDER: CommunityLaunchSetupStep[] = [
  "profile",
  "about",
  "knowledge",
  "agent",
  "workflows",
  "access",
  "publish",
];

const STEP_META: Record<
  CommunityLaunchSetupStep,
  {
    label: string;
    title: string;
    body: string;
    action: string;
    icon: ReactNode;
  }
> = {
  profile: {
    label: "Profile",
    title: "Shape the public identity.",
    body: "Name, one-liner, avatar, and banner make the community recognizable across Discover and the public funnel.",
    action: "Open profile",
    icon: <Image size={15} strokeWidth={2} aria-hidden="true" />,
  },
  about: {
    label: "About",
    title: "Explain who this is for.",
    body: "Add the longer public description, promise, tone, and basic context members should see before joining.",
    action: "Open about",
    icon: <FileText size={15} strokeWidth={2} aria-hidden="true" />,
  },
  knowledge: {
    label: "Knowledge",
    title: "Stage and publish knowledge.",
    body: "Add source material first, then publish one usable resource so members and agents have shared context.",
    action: "Open resources",
    icon: <BookOpen size={15} strokeWidth={2} aria-hidden="true" />,
  },
  agent: {
    label: "Agent",
    title: "Configure the community agent.",
    body: "Set the community-wide instructions and starter prompts for the selected workspace lens.",
    action: "Open agent",
    icon: <Bot size={15} strokeWidth={2} aria-hidden="true" />,
  },
  workflows: {
    label: "Workflows",
    title: "Connect useful tools.",
    body: "Attach a skill, app, GitHub workflow, or imported agent workflow when the community needs one.",
    action: "Open workflows",
    icon: <PlugZap size={15} strokeWidth={2} aria-hidden="true" />,
  },
  access: {
    label: "Access",
    title: "Choose how members enter.",
    body: "Keep the community open, approval-based, or paid depending on the operating model.",
    action: "Open access",
    icon: <LockKeyhole size={15} strokeWidth={2} aria-hidden="true" />,
  },
  publish: {
    label: "Publish",
    title: "Review and publish.",
    body: "Preview the public surface, publish to Discover when ready, and share the community link.",
    action: "Open publish",
    icon: <Globe2 size={15} strokeWidth={2} aria-hidden="true" />,
  },
};

type StepChecklistItem = {
  missing: CommunityLaunchSetupMissing;
  label: string;
};

const STEP_CHECKLIST: Record<CommunityLaunchSetupStep, StepChecklistItem[]> = {
  profile: [
    { missing: "community_name", label: "Add community name" },
    { missing: "community_one_liner", label: "Add one-liner" },
    { missing: "community_avatar", label: "Add avatar" },
    { missing: "community_banner", label: "Add banner" },
  ],
  about: [
    { missing: "community_about", label: "Write about page" },
  ],
  knowledge: [
    { missing: "community_knowledge_material", label: "Add source material" },
    { missing: "community_knowledge_published", label: "Publish one usable resource" },
  ],
  agent: [
    { missing: "community_agent", label: "Configure community agent" },
  ],
  workflows: [
    { missing: "community_workflow", label: "Connect one workflow" },
  ],
  access: [
    { missing: "community_access", label: "Configure access" },
  ],
  publish: [
    { missing: "community_publish", label: "Publish community" },
  ],
};

function isStepComplete(
  status: CommunityLaunchSetupStatus,
  step: CommunityLaunchSetupStep,
): boolean {
  return Boolean(status.steps.find((item) => item.step === step)?.completed);
}

function normalizeActiveStep(
  status: CommunityLaunchSetupStatus | null,
): CommunityLaunchSetupStep {
  const current = status?.current_step;
  if (current && current !== "complete") return current;
  return "profile";
}

export function WebCommunityLaunchSetupModal(
  props: WebCommunityLaunchSetupModalProps,
) {
  const { isOpen, community, status, onClose, onOpenStep } = props;
  const [activeStep, setActiveStep] = useState<CommunityLaunchSetupStep>(() =>
    normalizeActiveStep(status),
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveStep(normalizeActiveStep(status));
  }, [isOpen, status?.current_step]);

  const progress = Math.max(0, Math.min(100, status?.percent ?? 0));
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset =
    progressCircumference - (progress / 100) * progressCircumference;
  const activeMeta = STEP_META[activeStep];
  const activeStatus = status?.steps.find((step) => step.step === activeStep) ?? null;
  const activeComplete = Boolean(activeStatus?.completed);
  const missingCount = activeStatus?.missing.length ?? 0;
  const activeChecklistItems = STEP_CHECKLIST[activeStep];
  const stepSummary = useMemo(() => {
    if (!activeStatus) return "Not loaded yet.";
    if (activeStatus.completed) return "Complete";
    if (missingCount === 1) return "1 item left";
    return `${missingCount} items left`;
  }, [activeStatus, missingCount]);

  if (!isOpen || !community || !status) return null;

  return (
    <div className="polynet-onboarding-modal-backdrop" role="presentation">
      <div
        className="polynet-onboarding-modal community-launch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-launch-title"
      >
        <section className="polynet-onboarding-panel">
          <div className="polynet-onboarding-topbar">
            <div className="polynet-onboarding-brand">
              <CommunityAvatar
                className="community-launch-brand-avatar"
                imageUrl={community.avatar_url}
                focusX={community.avatar_focus_x}
                focusY={community.avatar_focus_y}
                zoom={community.avatar_zoom}
                name={community.name}
                fallbackClassName="community-launch-brand-avatar-fallback"
                imageClassName="community-launch-brand-avatar-image"
                aria-hidden
              />
              <span>{community.name}</span>
            </div>
            <button
              className="polynet-onboarding-close"
              type="button"
              onClick={onClose}
              aria-label="Close community launch setup"
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="polynet-onboarding-header">
            <div className="polynet-onboarding-progress-ring" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <circle className="track" cx="20" cy="20" r="17" />
                <circle
                  className="value"
                  cx="20"
                  cy="20"
                  r="17"
                  strokeDasharray={progressCircumference}
                  strokeDashoffset={progressDashOffset}
                />
              </svg>
              <span>{progress}%</span>
            </div>
            <div>
              <p className="polynet-landing-kicker">Community launch</p>
              <h1 id="community-launch-title">Set up {community.name}</h1>
              <p>{progress}% complete</p>
            </div>
          </div>

          <div className="polynet-onboarding-shell">
            <nav className="polynet-onboarding-steps" aria-label="Community launch steps">
              {STEP_ORDER.map((step) => {
                const active = step === activeStep;
                const complete = isStepComplete(status, step);
                return (
                  <button
                    key={step}
                    type="button"
                    className={`${active ? "active" : ""}${complete ? " complete" : ""}`}
                    onClick={() => setActiveStep(step)}
                  >
                    <span className="polynet-onboarding-step-icon">
                      {complete ? (
                        <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                      ) : (
                        STEP_META[step].icon
                      )}
                    </span>
                    <span>{STEP_META[step].label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="polynet-onboarding-step-body">
              <div className="community-launch-step-card">
                <div className="community-launch-step-heading">
                  <span className="polynet-onboarding-step-icon">
                    {activeComplete ? (
                      <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                    ) : (
                      activeMeta.icon
                    )}
                  </span>
                  <div>
                    <p className="polynet-landing-kicker">{activeMeta.label}</p>
                    <h2>{activeMeta.title}</h2>
                  </div>
                </div>
                <p>{activeMeta.body}</p>
                <div className="community-launch-checklist" aria-label={`${activeMeta.label} checklist`}>
                  {activeChecklistItems.map((item) => {
                    const itemComplete = activeStatus ? !activeStatus.missing.includes(item.missing) : false;
                    return (
                      <div
                        key={item.missing}
                        className={`community-launch-checklist-item${itemComplete ? " complete" : ""}`}
                      >
                        <span className="community-launch-checklist-icon">
                          {itemComplete ? (
                            <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                          ) : (
                            <Circle size={9} strokeWidth={2.4} aria-hidden="true" />
                          )}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="community-launch-step-summary">
                  <span
                    className={`community-launch-status-chip${activeComplete ? " complete" : ""}`}
                  >
                    {activeComplete ? (
                      <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                    ) : (
                      <Circle size={10} strokeWidth={2.4} aria-hidden="true" />
                    )}
                    {stepSummary}
                  </span>
                  <span>
                    {activeStatus?.completed_items ?? 0}/{activeStatus?.total_items ?? 0}
                  </span>
                </div>
                <div className="community-launch-step-actions">
                  <button
                    type="button"
                    className="polynet-onboarding-next"
                    onClick={() => onOpenStep(activeStep)}
                  >
                    {activeComplete ? `Review ${activeMeta.label}` : activeMeta.action}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button className="polynet-onboarding-finish-later" type="button" onClick={onClose}>
            Finish later
          </button>
        </section>
      </div>
    </div>
  );
}
