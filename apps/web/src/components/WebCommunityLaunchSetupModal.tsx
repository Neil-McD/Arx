import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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

type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";

type CommunityLaunchSetupCommunity = {
  id: string;
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: CommunityEntryPolicy | null;
  agent_system_prompt?: string | null;
  agent_starter_prompts?: string[] | null;
};

export type CommunityLaunchProfileSaveDraft = {
  name: string;
  slug: string;
  oneLiner: string;
  avatarUrl: string;
  bannerUrl: string;
};

export type CommunityLaunchAboutSaveDraft = {
  about: string;
};

export type CommunityLaunchKnowledgeSaveDraft = {
  title: string;
  bodyMd: string;
  url: string;
};

export type CommunityLaunchAgentSaveDraft = {
  systemPrompt: string;
  starterPrompts: string[];
};

export type CommunityLaunchAccessSaveDraft = {
  entryPolicy: "open" | "approval";
};

export type CommunityLaunchPublishSaveDraft = {
  visibility: "published" | "unlisted";
};

type WebCommunityLaunchSetupModalProps = {
  isOpen: boolean;
  community: CommunityLaunchSetupCommunity | null;
  status: CommunityLaunchSetupStatus | null;
  onClose: () => void;
  onOpenStep: (step: CommunityLaunchSetupStep) => void;
  onSaveProfile: (draft: CommunityLaunchProfileSaveDraft) => Promise<void>;
  onSaveAbout: (draft: CommunityLaunchAboutSaveDraft) => Promise<void>;
  onAddKnowledge: (draft: CommunityLaunchKnowledgeSaveDraft) => Promise<void>;
  onSaveAgent: (draft: CommunityLaunchAgentSaveDraft) => Promise<void>;
  onSaveAccess: (draft: CommunityLaunchAccessSaveDraft) => Promise<void>;
  onSavePublish: (draft: CommunityLaunchPublishSaveDraft) => Promise<void>;
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
    body: "Create a first resource page here. It lands in the canonical resources directory for members and agents.",
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
    body: "Publish to Discover when the public surface is ready, or keep the community unlisted while you finish.",
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

function getStarterPrompts(community: CommunityLaunchSetupCommunity | null): string[] {
  const prompts = Array.isArray(community?.agent_starter_prompts)
    ? community.agent_starter_prompts
    : [];
  return [0, 1, 2].map((index) => String(prompts[index] ?? "").trim());
}

function isPublishProfileMissing(missing: CommunityLaunchSetupMissing): boolean {
  return (
    missing === "community_name" ||
    missing === "community_one_liner" ||
    missing === "community_avatar" ||
    missing === "community_banner"
  );
}

export function WebCommunityLaunchSetupModal(
  props: WebCommunityLaunchSetupModalProps,
) {
  const {
    isOpen,
    community,
    status,
    onClose,
    onOpenStep,
    onSaveProfile,
    onSaveAbout,
    onAddKnowledge,
    onSaveAgent,
    onSaveAccess,
    onSavePublish,
  } = props;
  const [activeStep, setActiveStep] = useState<CommunityLaunchSetupStep>(() =>
    normalizeActiveStep(status),
  );
  const [savingStep, setSavingStep] = useState<CommunityLaunchSetupStep | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepSuccess, setStepSuccess] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<CommunityLaunchProfileSaveDraft>({
    name: "",
    slug: "",
    oneLiner: "",
    avatarUrl: "",
    bannerUrl: "",
  });
  const [aboutDraft, setAboutDraft] = useState("");
  const [knowledgeDraft, setKnowledgeDraft] = useState<CommunityLaunchKnowledgeSaveDraft>({
    title: "",
    bodyMd: "",
    url: "",
  });
  const [agentDraft, setAgentDraft] = useState<CommunityLaunchAgentSaveDraft>({
    systemPrompt: "",
    starterPrompts: ["", "", ""],
  });
  const [accessDraft, setAccessDraft] = useState<CommunityEntryPolicy>("open");

  useEffect(() => {
    if (!isOpen) return;
    setActiveStep(normalizeActiveStep(status));
  }, [isOpen, status?.current_step]);

  useEffect(() => {
    if (!isOpen || !community) return;
    setProfileDraft({
      name: community.name ?? "",
      slug: community.slug ?? "",
      oneLiner: community.one_liner ?? "",
      avatarUrl: community.avatar_url ?? "",
      bannerUrl: community.banner_url ?? "",
    });
    setAboutDraft(community.about ?? "");
    setAgentDraft({
      systemPrompt: community.agent_system_prompt ?? "",
      starterPrompts: getStarterPrompts(community),
    });
    setAccessDraft(community.entry_policy ?? "open");
    setStepError(null);
    setStepSuccess(null);
  }, [
    isOpen,
    community?.id,
    community?.name,
    community?.slug,
    community?.one_liner,
    community?.about,
    community?.avatar_url,
    community?.banner_url,
    community?.entry_policy,
    community?.agent_system_prompt,
    community?.agent_starter_prompts,
  ]);

  const progress = Math.max(0, Math.min(100, status?.percent ?? 0));
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset =
    progressCircumference - (progress / 100) * progressCircumference;
  const activeMeta = STEP_META[activeStep];
  const activeStatus = status?.steps.find((step) => step.step === activeStep) ?? null;
  const activeComplete = Boolean(activeStatus?.completed);
  const missingCount = activeStatus?.missing.length ?? 0;
  const activeChecklistItems = STEP_CHECKLIST[activeStep];
  const publishMissing = status?.missing.filter(isPublishProfileMissing) ?? [];
  const isSavingActiveStep = savingStep === activeStep;
  const stepSummary = useMemo(() => {
    if (!activeStatus) return "Not loaded yet.";
    if (activeStatus.completed) return "Complete";
    if (missingCount === 1) return "1 item left";
    return `${missingCount} items left`;
  }, [activeStatus, missingCount]);

  if (!isOpen || !community || !status) return null;

  const runStepSave = async (
    step: CommunityLaunchSetupStep,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (savingStep) return;
    setSavingStep(step);
    setStepError(null);
    setStepSuccess(null);
    try {
      await action();
      setStepSuccess(successMessage);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save.";
      setStepError(message);
    } finally {
      setSavingStep(null);
    }
  };

  const handleSaveProfile = (event: FormEvent) => {
    event.preventDefault();
    void runStepSave(
      "profile",
      () => onSaveProfile(profileDraft),
      "Profile saved.",
    );
  };

  const handleSaveAbout = (event: FormEvent) => {
    event.preventDefault();
    void runStepSave(
      "about",
      () => onSaveAbout({ about: aboutDraft }),
      "About saved.",
    );
  };

  const handleAddKnowledge = (event: FormEvent) => {
    event.preventDefault();
    void runStepSave(
      "knowledge",
      async () => {
        await onAddKnowledge(knowledgeDraft);
        setKnowledgeDraft({ title: "", bodyMd: "", url: "" });
      },
      "Resource added.",
    );
  };

  const handleSaveAgent = (event: FormEvent) => {
    event.preventDefault();
    void runStepSave(
      "agent",
      () => onSaveAgent(agentDraft),
      "Agent saved.",
    );
  };

  const handleSaveAccess = (event: FormEvent) => {
    event.preventDefault();
    if (accessDraft === "paid_subscription") {
      setStepError("Paid access needs the full access setup for pricing and Stripe.");
      return;
    }
    void runStepSave(
      "access",
      () => onSaveAccess({ entryPolicy: accessDraft }),
      "Access saved.",
    );
  };

  const savePublishState = (visibility: "published" | "unlisted") => {
    void runStepSave(
      "publish",
      () => onSavePublish({ visibility }),
      visibility === "published" ? "Community published." : "Community kept unlisted.",
    );
  };

  const renderStepEditor = () => {
    if (activeStep === "profile") {
      const canSaveProfile = Boolean(profileDraft.name.trim() && profileDraft.slug.trim());
      return (
        <form className="community-launch-inline-form" onSubmit={handleSaveProfile}>
          <div className="community-launch-field-grid">
            <label className="community-launch-field">
              <span>Name</span>
              <input
                value={profileDraft.name}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="Community name"
              />
            </label>
            <label className="community-launch-field">
              <span>Slug</span>
              <input
                value={profileDraft.slug}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, slug: event.target.value }))}
                placeholder="community-slug"
              />
            </label>
          </div>
          <label className="community-launch-field">
            <span>One-liner</span>
            <textarea
              value={profileDraft.oneLiner}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, oneLiner: event.target.value }))}
              rows={2}
              placeholder="A short line about who this community is for."
            />
          </label>
          <div className="community-launch-field-grid">
            <label className="community-launch-field">
              <span>Avatar URL</span>
              <input
                value={profileDraft.avatarUrl}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, avatarUrl: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label className="community-launch-field">
              <span>Banner URL</span>
              <input
                value={profileDraft.bannerUrl}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, bannerUrl: event.target.value }))}
                placeholder="https://..."
              />
            </label>
          </div>
          <div className="community-launch-step-actions">
            <button type="button" className="polynet-onboarding-back" onClick={() => onOpenStep("profile")}>
              Open full editor
            </button>
            <button type="submit" className="polynet-onboarding-next" disabled={!canSaveProfile || isSavingActiveStep}>
              {isSavingActiveStep ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "about") {
      return (
        <form className="community-launch-inline-form" onSubmit={handleSaveAbout}>
          <label className="community-launch-field">
            <span>About</span>
            <textarea
              value={aboutDraft}
              onChange={(event) => setAboutDraft(event.target.value)}
              rows={7}
              placeholder="Describe the promise, audience, norms, and context members should understand before joining."
            />
          </label>
          <div className="community-launch-step-actions">
            <button type="button" className="polynet-onboarding-back" onClick={() => onOpenStep("about")}>
              Open full editor
            </button>
            <button type="submit" className="polynet-onboarding-next" disabled={isSavingActiveStep}>
              {isSavingActiveStep ? "Saving..." : "Save about"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "knowledge") {
      const canAddKnowledge = Boolean(
        knowledgeDraft.title.trim() &&
        (knowledgeDraft.bodyMd.trim() || knowledgeDraft.url.trim()),
      );
      return (
        <form className="community-launch-inline-form" onSubmit={handleAddKnowledge}>
          <label className="community-launch-field">
            <span>Resource title</span>
            <input
              value={knowledgeDraft.title}
              onChange={(event) => setKnowledgeDraft((draft) => ({ ...draft, title: event.target.value }))}
              placeholder="Start here"
            />
          </label>
          <label className="community-launch-field">
            <span>Resource body</span>
            <textarea
              value={knowledgeDraft.bodyMd}
              onChange={(event) => setKnowledgeDraft((draft) => ({ ...draft, bodyMd: event.target.value }))}
              rows={5}
              placeholder="Paste the first useful page, summary, or operating note."
            />
          </label>
          <label className="community-launch-field">
            <span>Source link</span>
            <input
              value={knowledgeDraft.url}
              onChange={(event) => setKnowledgeDraft((draft) => ({ ...draft, url: event.target.value }))}
              placeholder="https://..."
            />
          </label>
          <div className="community-launch-step-actions">
            <button type="button" className="polynet-onboarding-back" onClick={() => onOpenStep("knowledge")}>
              Open resources
            </button>
            <button type="submit" className="polynet-onboarding-next" disabled={!canAddKnowledge || isSavingActiveStep}>
              {isSavingActiveStep ? "Adding..." : "Add resource"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "agent") {
      return (
        <form className="community-launch-inline-form" onSubmit={handleSaveAgent}>
          <label className="community-launch-field">
            <span>Community agent instructions</span>
            <textarea
              value={agentDraft.systemPrompt}
              onChange={(event) => setAgentDraft((draft) => ({ ...draft, systemPrompt: event.target.value }))}
              rows={6}
              placeholder="Tell the community agent how to behave, what to prioritize, and what boundaries to respect."
            />
          </label>
          <div className="community-launch-field-grid">
            {agentDraft.starterPrompts.map((prompt, index) => (
              <label className="community-launch-field" key={index}>
                <span>Starter {index + 1}</span>
                <input
                  value={prompt}
                  onChange={(event) => {
                    const nextPrompts = [...agentDraft.starterPrompts];
                    nextPrompts[index] = event.target.value;
                    setAgentDraft((draft) => ({ ...draft, starterPrompts: nextPrompts }));
                  }}
                  placeholder="Starter prompt"
                />
              </label>
            ))}
          </div>
          <div className="community-launch-step-actions">
            <button type="button" className="polynet-onboarding-back" onClick={() => onOpenStep("agent")}>
              Open agent
            </button>
            <button type="submit" className="polynet-onboarding-next" disabled={isSavingActiveStep}>
              {isSavingActiveStep ? "Saving..." : "Save agent"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "access") {
      return (
        <form className="community-launch-inline-form" onSubmit={handleSaveAccess}>
          <div className="community-launch-choice-row" role="radiogroup" aria-label="Community access">
            {[
              ["open", "Open", "Members can join directly."],
              ["approval", "Approval", "Members request access first."],
              ["paid_subscription", "Paid", "Requires pricing setup."],
            ].map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                className={`community-launch-choice${accessDraft === value ? " selected" : ""}`}
                onClick={() => setAccessDraft(value as CommunityEntryPolicy)}
                role="radio"
                aria-checked={accessDraft === value}
              >
                <strong>{label}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <div className="community-launch-step-actions">
            <button type="button" className="polynet-onboarding-back" onClick={() => onOpenStep("access")}>
              Open access
            </button>
            <button
              type="submit"
              className="polynet-onboarding-next"
              disabled={accessDraft === "paid_subscription" || isSavingActiveStep}
            >
              {isSavingActiveStep ? "Saving..." : "Save access"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "publish") {
      const isPublished = String(community.visibility ?? "").trim().toLowerCase() === "published";
      return (
        <div className="community-launch-inline-form">
          {publishMissing.length > 0 ? (
            <p className="community-launch-inline-note">
              Publish needs the profile requirements above before the community can appear in Discover.
            </p>
          ) : (
            <p className="community-launch-inline-note">
              The public profile is ready to publish. The rest of launch setup can continue after publishing.
            </p>
          )}
          <div className="community-launch-step-actions">
            <button
              type="button"
              className="polynet-onboarding-back"
              onClick={() => savePublishState("unlisted")}
              disabled={isSavingActiveStep || !isPublished}
            >
              Keep unlisted
            </button>
            <button
              type="button"
              className="polynet-onboarding-next"
              onClick={() => savePublishState("published")}
              disabled={publishMissing.length > 0 || isSavingActiveStep || isPublished}
            >
              {isSavingActiveStep ? "Publishing..." : isPublished ? "Published" : "Publish"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="community-launch-inline-form">
        <p className="community-launch-inline-note">
          Workflow imports use the existing community apps and skills surfaces for now, so connected tools stay canonical.
        </p>
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
    );
  };

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
                    onClick={() => {
                      setActiveStep(step);
                      setStepError(null);
                      setStepSuccess(null);
                    }}
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
                {stepError ? <p className="community-launch-step-message error">{stepError}</p> : null}
                {stepSuccess ? <p className="community-launch-step-message success">{stepSuccess}</p> : null}
                {renderStepEditor()}
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
