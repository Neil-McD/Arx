import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Check,
  Circle,
  FileText,
  Globe2,
  Image,
  Link2,
  LockKeyhole,
  PlugZap,
  X,
} from "lucide-react";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { getCommunityBannerImageStyle } from "../../../../shared/communityBannerUi";
import type {
  CommunityLaunchSetupMissing,
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../../shared/communityLaunchSetup";
import { buildCommunityLaunchSetupStatus } from "../../../../shared/communityLaunchSetup";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import {
  readBannerFileAsWideDataUrlWithinLimit,
  readCommunityAvatarFileAsDataUrlWithinLimit,
} from "../../../../shared/imageTransforms";
import { StripeWordmark } from "./StripeWordmark";

const COMMUNITY_LAUNCH_IMAGE_DATA_URL_MAX_CHARS = 600_000;
const COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS = 5;

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

export type CommunityLaunchKnowledgeLinkSaveDraft = {
  urls: string[];
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
  mode?: "setup" | "create";
  community: CommunityLaunchSetupCommunity | null;
  status: CommunityLaunchSetupStatus | null;
  onClose: () => void;
  onOpenStep: (step: CommunityLaunchSetupStep) => void;
  onCreateCommunity?: (draft: CommunityLaunchProfileSaveDraft) => Promise<void>;
  onSaveProfile: (draft: CommunityLaunchProfileSaveDraft) => Promise<void>;
  onSaveAbout: (draft: CommunityLaunchAboutSaveDraft) => Promise<void>;
  onAddKnowledgeLink: (draft: CommunityLaunchKnowledgeLinkSaveDraft) => Promise<void>;
  onSaveAgent: (draft: CommunityLaunchAgentSaveDraft) => Promise<void>;
  onSaveAccess: (draft: CommunityLaunchAccessSaveDraft) => Promise<void>;
  onSavePublish: (draft: CommunityLaunchPublishSaveDraft) => Promise<void>;
};

const STEP_ORDER: CommunityLaunchSetupStep[] = [
  "profile",
  "about",
  "agent",
  "workflows",
  "access",
  "knowledge",
  "publish",
];

const STEP_META: Record<
  CommunityLaunchSetupStep,
  {
    label: string;
    title: string;
    action: string;
    icon: ReactNode;
  }
> = {
  profile: {
    label: "Profile",
    title: "Shape the public identity",
    action: "Open profile",
    icon: <Image size={15} strokeWidth={2} aria-hidden="true" />,
  },
  about: {
    label: "About",
    title: "Write the about page",
    action: "Open about",
    icon: <FileText size={15} strokeWidth={2} aria-hidden="true" />,
  },
  agent: {
    label: "Agent",
    title: "Set the agent behavior",
    action: "Open agent",
    icon: <Bot size={15} strokeWidth={2} aria-hidden="true" />,
  },
  workflows: {
    label: "Workflows",
    title: "Connect workflows",
    action: "Open workflows",
    icon: <PlugZap size={15} strokeWidth={2} aria-hidden="true" />,
  },
  access: {
    label: "Access",
    title: "Choose access",
    action: "Open access",
    icon: <LockKeyhole size={15} strokeWidth={2} aria-hidden="true" />,
  },
  knowledge: {
    label: "Knowledge",
    title: "Build the knowledge base",
    action: "Open resources",
    icon: <BookOpen size={15} strokeWidth={2} aria-hidden="true" />,
  },
  publish: {
    label: "Publish",
    title: "Publish the community",
    action: "Open publish",
    icon: <Globe2 size={15} strokeWidth={2} aria-hidden="true" />,
  },
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

function getNextLaunchStep(step: CommunityLaunchSetupStep): CommunityLaunchSetupStep | null {
  const index = STEP_ORDER.indexOf(step);
  if (index < 0 || index >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[index + 1];
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
    mode = "setup",
    community,
    status,
    onClose,
    onOpenStep,
    onCreateCommunity,
    onSaveProfile,
    onSaveAbout,
    onAddKnowledgeLink,
    onSaveAgent,
    onSaveAccess,
    onSavePublish,
  } = props;
  const isCreateMode = mode === "create";
  const [activeStep, setActiveStep] = useState<CommunityLaunchSetupStep>(() =>
    normalizeActiveStep(status),
  );
  const [stepOverride, setStepOverride] = useState<CommunityLaunchSetupStep | null>(null);
  const [savingStep, setSavingStep] = useState<CommunityLaunchSetupStep | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepSuccess, setStepSuccess] = useState<string | null>(null);
  const [profileMediaError, setProfileMediaError] = useState<string | null>(null);
  const [profileAvatarFileName, setProfileAvatarFileName] = useState("");
  const [profileBannerFileName, setProfileBannerFileName] = useState("");
  const [processingProfileMedia, setProcessingProfileMedia] = useState<"avatar" | "banner" | null>(null);
  const [profileAvatarDragOver, setProfileAvatarDragOver] = useState(false);
  const [profileBannerDragOver, setProfileBannerDragOver] = useState(false);
  const [profileSlugEdited, setProfileSlugEdited] = useState(false);
  const [profileDraft, setProfileDraft] = useState<CommunityLaunchProfileSaveDraft>({
    name: "",
    slug: "",
    oneLiner: "",
    avatarUrl: "",
    bannerUrl: "",
  });
  const [aboutDraft, setAboutDraft] = useState("");
  const [knowledgeLinkDrafts, setKnowledgeLinkDrafts] = useState<string[]>([""]);
  const [agentDraft, setAgentDraft] = useState<CommunityLaunchAgentSaveDraft>({
    systemPrompt: "",
    starterPrompts: ["", "", ""],
  });
  const [accessDraft, setAccessDraft] = useState<CommunityEntryPolicy>("open");

  useEffect(() => {
    if (!isOpen) return;
    setStepOverride(null);
    setActiveStep(isCreateMode ? "profile" : normalizeActiveStep(status));
  }, [community?.id, isCreateMode, isOpen]);

  useEffect(() => {
    if (!isOpen || stepOverride) return;
    setActiveStep(isCreateMode ? "profile" : normalizeActiveStep(status));
  }, [isCreateMode, isOpen, status?.current_step, stepOverride]);

  useEffect(() => {
    if (!isOpen) return;
    if (isCreateMode) {
      setProfileDraft({
        name: "",
        slug: "",
        oneLiner: "",
        avatarUrl: "",
        bannerUrl: "",
      });
      setAboutDraft("");
      setKnowledgeLinkDrafts([""]);
      setAgentDraft({
        systemPrompt: "",
        starterPrompts: ["", "", ""],
      });
      setAccessDraft("approval");
      setStepError(null);
      setStepSuccess(null);
      setProfileMediaError(null);
      setProfileAvatarFileName("");
      setProfileBannerFileName("");
      setProcessingProfileMedia(null);
      setProfileAvatarDragOver(false);
      setProfileBannerDragOver(false);
      setProfileSlugEdited(false);
      return;
    }
    if (!community) return;
    setProfileDraft({
      name: community.name ?? "",
      slug: community.slug ?? "",
      oneLiner: community.one_liner ?? "",
      avatarUrl: community.avatar_url ?? "",
      bannerUrl: community.banner_url ?? "",
    });
    setAboutDraft(community.about ?? "");
    setKnowledgeLinkDrafts([""]);
    setAgentDraft({
      systemPrompt: community.agent_system_prompt ?? "",
      starterPrompts: getStarterPrompts(community),
    });
    setAccessDraft(community.entry_policy ?? "open");
    setStepError(null);
    setStepSuccess(null);
    setProfileMediaError(null);
    setProfileAvatarFileName("");
    setProfileBannerFileName("");
    setProcessingProfileMedia(null);
    setProfileAvatarDragOver(false);
    setProfileBannerDragOver(false);
    setProfileSlugEdited(false);
  }, [
    isOpen,
    isCreateMode,
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

  const createModeStatus = useMemo(
    () =>
      buildCommunityLaunchSetupStatus({
        name: profileDraft.name,
        oneLiner: profileDraft.oneLiner,
        avatarUrl: profileDraft.avatarUrl,
        bannerUrl: profileDraft.bannerUrl,
        about: null,
        hasKnowledgeMaterial: false,
        hasPublishedKnowledge: false,
        hasAgentConfig: false,
        hasWorkflow: false,
        entryPolicy: null,
        visibility: "unlisted",
      }),
    [
      profileDraft.avatarUrl,
      profileDraft.bannerUrl,
      profileDraft.name,
      profileDraft.oneLiner,
    ],
  );
  const effectiveStatus = isCreateMode ? createModeStatus : status;
  const effectiveCommunity: CommunityLaunchSetupCommunity | null = isCreateMode
    ? {
        id: "__new_community__",
        slug: profileDraft.slug,
        name: profileDraft.name.trim() || "New community",
        one_liner: profileDraft.oneLiner.trim() || null,
        about: null,
        avatar_url: profileDraft.avatarUrl || null,
        avatar_focus_x: 0.5,
        avatar_focus_y: 0.5,
        avatar_zoom: 1,
        banner_url: profileDraft.bannerUrl || null,
        banner_focus_x: 0.5,
        banner_focus_y: 0.5,
        banner_zoom: 1,
        visibility: "unlisted",
        entry_policy: "approval",
      }
    : community;

  const progress = Math.max(0, Math.min(100, effectiveStatus?.percent ?? 0));
  const progressCircumference = 2 * Math.PI * 17;
  const progressDashOffset =
    progressCircumference - (progress / 100) * progressCircumference;
  const activeMeta = STEP_META[activeStep];
  const activeStatus = effectiveStatus?.steps.find((step) => step.step === activeStep) ?? null;
  const activeComplete = Boolean(activeStatus?.completed);
  const missingCount = activeStatus?.missing.length ?? 0;
  const publishMissing = effectiveStatus?.missing.filter(isPublishProfileMissing) ?? [];
  const isSavingActiveStep = savingStep === activeStep;
  const stepSummary = useMemo(() => {
    if (!activeStatus) return "Not loaded yet.";
    if (activeStatus.completed) return "Complete";
    if (missingCount === 1) return "1 item left";
    return `${missingCount} items left`;
  }, [activeStatus, missingCount]);

  if (!isOpen || !effectiveCommunity || !effectiveStatus) return null;

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
      const nextStep = getNextLaunchStep(step);
      if (nextStep) {
        setStepOverride(nextStep);
        setActiveStep(nextStep);
        setStepSuccess(null);
      } else {
        setStepSuccess(successMessage);
      }
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

  const renderFinishLaterButton = () => (
    <button type="button" className="polynet-onboarding-back" onClick={onClose}>
      {isCreateMode ? "Cancel" : "Finish later"}
    </button>
  );

  const handleProfileImageDrop = (
    kind: "avatar" | "banner",
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (kind === "avatar") {
      setProfileAvatarDragOver(false);
    } else {
      setProfileBannerDragOver(false);
    }
    const file = event.dataTransfer.files?.[0] ?? null;
    void readProfileImage(kind, file);
  };

  const handleSaveProfile = (event: FormEvent) => {
    event.preventDefault();
    if (isCreateMode) {
      if (!onCreateCommunity) {
        setStepError("Community creation is unavailable.");
        return;
      }
      void runStepSave(
        "profile",
        () => onCreateCommunity(profileDraft),
        "Community created.",
      );
      return;
    }
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

  const handleAddKnowledgeLink = (event: FormEvent) => {
    event.preventDefault();
    if (savingStep) return;
    setSavingStep("knowledge");
    setStepError(null);
    setStepSuccess(null);
    void (async () => {
      try {
        await onAddKnowledgeLink({ urls: knowledgeLinkDrafts });
        setKnowledgeLinkDrafts([""]);
        setStepSuccess("Links added.");
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to add links.";
        setStepError(message);
      } finally {
        setSavingStep(null);
      }
    })();
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
      setStepError("Stripe Connect needs the full access setup for pricing.");
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

  const readProfileImage = async (kind: "avatar" | "banner", file: File | null) => {
    if (!file) return;
    setProfileMediaError(null);
    setProcessingProfileMedia(kind);
    try {
      const dataUrl =
        kind === "avatar"
          ? await readCommunityAvatarFileAsDataUrlWithinLimit(
              file,
              COMMUNITY_LAUNCH_IMAGE_DATA_URL_MAX_CHARS,
            )
          : await readBannerFileAsWideDataUrlWithinLimit(
              file,
              COMMUNITY_LAUNCH_IMAGE_DATA_URL_MAX_CHARS,
            );
      setProfileDraft((draft) => ({
        ...draft,
        [kind === "avatar" ? "avatarUrl" : "bannerUrl"]: dataUrl,
      }));
      if (kind === "avatar") {
        setProfileAvatarFileName(file.name || "Selected avatar");
      } else {
        setProfileBannerFileName(file.name || "Selected banner");
      }
    } catch (error) {
      setProfileMediaError(
        error instanceof Error
          ? error.message
          : kind === "avatar"
            ? "Could not read avatar image."
            : "Could not read banner image.",
      );
    } finally {
      setProcessingProfileMedia(null);
    }
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
                onChange={(event) => {
                  const nextName = event.target.value;
                  setProfileDraft((draft) => ({
                    ...draft,
                    name: nextName,
                    slug:
                      isCreateMode && !profileSlugEdited
                        ? slugifyCommunityName(nextName)
                        : draft.slug,
                  }));
                }}
                placeholder="Community name"
              />
            </label>
            <label className="community-launch-field">
              <span>Slug</span>
              <input
                value={profileDraft.slug}
                onChange={(event) => {
                  setProfileSlugEdited(true);
                  setProfileDraft((draft) => ({ ...draft, slug: event.target.value }));
                }}
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
          <div className="create-community-branding community-launch-profile-branding">
            <div
              className={`create-community-banner${profileBannerDragOver ? " drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setProfileBannerDragOver(true);
              }}
              onDragLeave={() => setProfileBannerDragOver(false)}
              onDrop={(event) => handleProfileImageDrop("banner", event)}
            >
              <div className="create-community-banner-media">
                {profileDraft.bannerUrl ? (
                  <img
                    src={profileDraft.bannerUrl}
                    alt="Community banner preview"
                    draggable={false}
                    style={getCommunityBannerImageStyle({
                      focusX: effectiveCommunity.banner_focus_x,
                      focusY: effectiveCommunity.banner_focus_y,
                      zoom: effectiveCommunity.banner_zoom,
                    })}
                  />
                ) : (
                  <div className="create-community-banner-placeholder">Banner preview</div>
                )}
              </div>
              <div className="create-community-branding-actions">
                <label className={`create-banner-btn${processingProfileMedia ? " disabled" : ""}`}>
                  {processingProfileMedia === "banner" ? "Reading..." : "Upload banner"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={Boolean(processingProfileMedia)}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void readProfileImage("banner", file);
                    }}
                  />
                </label>
                {profileDraft.bannerUrl ? (
                  <button
                    type="button"
                    className="create-banner-remove"
                    disabled={Boolean(processingProfileMedia)}
                    onClick={() => {
                      setProfileDraft((draft) => ({ ...draft, bannerUrl: "" }));
                      setProfileBannerFileName("");
                    }}
                  >
                    Remove
                  </button>
                ) : null}
                {profileBannerFileName ? <span className="create-upload-status">{profileBannerFileName}</span> : null}
              </div>
            </div>
            <div className="create-community-avatar-row">
              <CommunityAvatar
                className={`create-community-avatar${profileAvatarDragOver ? " drag-over" : ""}`}
                imageUrl={profileDraft.avatarUrl || null}
                focusX={effectiveCommunity.avatar_focus_x}
                focusY={effectiveCommunity.avatar_focus_y}
                zoom={effectiveCommunity.avatar_zoom}
                name={profileDraft.name || effectiveCommunity.name}
                alt="Community avatar preview"
                onDragOver={(event) => {
                  event.preventDefault();
                  setProfileAvatarDragOver(true);
                }}
                onDragLeave={() => setProfileAvatarDragOver(false)}
                onDrop={(event) => handleProfileImageDrop("avatar", event)}
              />
              <div className="create-community-avatar-actions">
                <label className={`create-avatar-btn${processingProfileMedia ? " disabled" : ""}`}>
                  {processingProfileMedia === "avatar" ? "Reading..." : "Upload avatar"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={Boolean(processingProfileMedia)}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      void readProfileImage("avatar", file);
                    }}
                  />
                </label>
                {profileDraft.avatarUrl ? (
                  <button
                    type="button"
                    className="create-avatar-remove"
                    disabled={Boolean(processingProfileMedia)}
                    onClick={() => {
                      setProfileDraft((draft) => ({ ...draft, avatarUrl: "" }));
                      setProfileAvatarFileName("");
                    }}
                  >
                    Remove
                  </button>
                ) : null}
                {profileAvatarFileName ? <span className="create-upload-status">{profileAvatarFileName}</span> : null}
              </div>
            </div>
          </div>
          {profileMediaError ? <p className="community-launch-step-message error">{profileMediaError}</p> : null}
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button type="submit" className="polynet-onboarding-next" disabled={!canSaveProfile || isSavingActiveStep}>
              {isSavingActiveStep
                ? isCreateMode
                  ? "Creating..."
                  : "Saving..."
                : isCreateMode
                  ? "Create community"
                  : "Save profile"}
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
            {renderFinishLaterButton()}
            <button type="submit" className="polynet-onboarding-next" disabled={isSavingActiveStep}>
              {isSavingActiveStep ? "Saving..." : "Save about"}
            </button>
          </div>
        </form>
      );
    }

    if (activeStep === "knowledge") {
      const canAddKnowledgeLink = knowledgeLinkDrafts.some((url) => url.trim());
      const canAddKnowledgeLinkRow = knowledgeLinkDrafts.length < COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS;
      return (
        <div className="community-launch-inline-form community-launch-knowledge-gateway">
          <div className="community-launch-knowledge-stack">
            <section className="community-launch-knowledge-row">
              <span className="community-launch-knowledge-icon" aria-hidden="true">
                <FileText size={15} strokeWidth={2} />
              </span>
              <div>
                <span className="community-launch-knowledge-kicker">Sources</span>
                <strong>Drop source material</strong>
                <p>Files, PDFs, presentations, videos, and notes should enter the canonical resources system here.</p>
                <div className="community-launch-knowledge-dropzone" aria-label="Knowledge upload placeholder">
                  Drop files here once ingestion is enabled
                </div>
              </div>
              <span className="community-launch-knowledge-pill">Next</span>
            </section>
            <section className="community-launch-knowledge-row">
              <span className="community-launch-knowledge-icon" aria-hidden="true">
                <Link2 size={15} strokeWidth={2} />
              </span>
              <div>
                <span className="community-launch-knowledge-kicker">Links</span>
                <strong>Add source links</strong>
                <p>Paste docs, videos, articles, or public resource URLs into the community resource directory.</p>
                <form className="community-launch-knowledge-link-composer" onSubmit={handleAddKnowledgeLink}>
                  <div className="community-launch-knowledge-link-list">
                    {knowledgeLinkDrafts.map((url, index) => (
                      <input
                        key={index}
                        aria-label={`Source link URL ${index + 1}`}
                        value={url}
                        onChange={(event) => {
                          const nextUrls = [...knowledgeLinkDrafts];
                          nextUrls[index] = event.target.value;
                          setKnowledgeLinkDrafts(nextUrls);
                        }}
                        placeholder="https://..."
                      />
                    ))}
                  </div>
                  <div className="community-launch-knowledge-link-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canAddKnowledgeLinkRow || isSavingActiveStep}
                      onClick={() => {
                        if (!canAddKnowledgeLinkRow) return;
                        setKnowledgeLinkDrafts((urls) => [
                          ...urls,
                          "",
                        ].slice(0, COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS));
                      }}
                    >
                      Add new link
                    </button>
                    <span>{knowledgeLinkDrafts.length}/{COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS}</span>
                    <button type="submit" disabled={!canAddKnowledgeLink || isSavingActiveStep}>
                      {isSavingActiveStep ? "Adding..." : "Add links"}
                    </button>
                  </div>
                </form>
              </div>
              <span className="community-launch-knowledge-pill">Next</span>
            </section>
            <section className="community-launch-knowledge-row">
              <span className="community-launch-knowledge-icon" aria-hidden="true">
                <PlugZap size={15} strokeWidth={2} />
              </span>
              <div>
                <span className="community-launch-knowledge-kicker">Integrations</span>
                <strong>Connect source systems</strong>
                <p>Connect cloud sources that can become community context once scoped and approved.</p>
                <div className="community-launch-knowledge-integrations" aria-label="Knowledge integrations">
                  <button type="button" onClick={() => onOpenStep("workflows")}>
                    <img
                      className="community-launch-knowledge-provider-logo drive"
                      src="/app-logos/google-drive.svg"
                      alt=""
                      aria-hidden="true"
                    />
                    <span>Google Drive</span>
                  </button>
                  <button type="button" onClick={() => onOpenStep("workflows")}>
                    <img
                      className="community-launch-knowledge-provider-logo github"
                      src="/app-logos/github.svg"
                      alt=""
                      aria-hidden="true"
                    />
                    <span>GitHub</span>
                  </button>
                </div>
              </div>
              <span className="community-launch-knowledge-pill">Planned</span>
            </section>
          </div>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
            <button
              type="button"
              className="polynet-onboarding-next"
              onClick={() => {
                setStepOverride("publish");
                setActiveStep("publish");
                setStepError(null);
                setStepSuccess(null);
              }}
            >
              Review publish
            </button>
          </div>
        </div>
      );
    }

    if (activeStep === "agent") {
      return (
        <form className="community-launch-inline-form" onSubmit={handleSaveAgent}>
          <label className="community-launch-field">
            <span>Agent instructions</span>
            <textarea
              value={agentDraft.systemPrompt}
              onChange={(event) => setAgentDraft((draft) => ({ ...draft, systemPrompt: event.target.value }))}
              rows={6}
              placeholder="How should the agent help this community?"
            />
          </label>
          <details className="community-launch-starter-panel">
            <summary>
              <strong>Starter prompts</strong>
              <span>Optional quick questions members can tap.</span>
            </summary>
            <div className="community-launch-starter-list">
              {agentDraft.starterPrompts.map((prompt, index) => (
                <label className="community-launch-field" key={index}>
                  <span>Prompt {index + 1}</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => {
                      const nextPrompts = [...agentDraft.starterPrompts];
                      nextPrompts[index] = event.target.value;
                      setAgentDraft((draft) => ({ ...draft, starterPrompts: nextPrompts }));
                    }}
                    rows={2}
                    placeholder="Suggested first question"
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
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
              ["paid_subscription", "Stripe Connect", "Connect Stripe before paid access."],
            ].map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                className={`community-launch-choice${accessDraft === value ? " selected" : ""}${
                  value === "paid_subscription" ? " stripe-connect" : ""
                }`}
                onClick={() => setAccessDraft(value as CommunityEntryPolicy)}
                role="radio"
                aria-checked={accessDraft === value}
                aria-label={label}
              >
                <strong>
                  {value === "paid_subscription" ? (
                    <span className="community-launch-stripe-label">
                      <StripeWordmark className="community-launch-stripe-wordmark" />
                      <span>Connect</span>
                    </span>
                  ) : (
                    label
                  )}
                </strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <div className="community-launch-step-actions">
            {renderFinishLaterButton()}
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
      const isPublished = String(effectiveCommunity.visibility ?? "").trim().toLowerCase() === "published";
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
            {renderFinishLaterButton()}
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
          {renderFinishLaterButton()}
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
          <button
            className="polynet-onboarding-close community-launch-close"
            type="button"
            onClick={onClose}
            aria-label="Close community launch setup"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>

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
              <h1 id="community-launch-title">
                {isCreateMode ? "Create community" : `Set up ${effectiveCommunity.name}`}
              </h1>
              <p>{progress}% complete</p>
            </div>
          </div>

          <div className="polynet-onboarding-shell">
            <nav className="polynet-onboarding-steps" aria-label="Community launch steps">
              {STEP_ORDER.map((step) => {
                const active = step === activeStep;
                const complete = isStepComplete(effectiveStatus, step);
                const disabled = isCreateMode && step !== "profile";
                return (
                  <button
                    key={step}
                    type="button"
                    className={`${active ? "active" : ""}${complete ? " complete" : ""}`}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setStepOverride(step);
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
                  <h2>{activeMeta.title}</h2>
                </div>
                {stepError ? <p className="community-launch-step-message error">{stepError}</p> : null}
                {stepSuccess ? <p className="community-launch-step-message success">{stepSuccess}</p> : null}
                {renderStepEditor()}
                <div
                  className={`community-launch-step-summary${activeComplete ? " complete" : ""}`}
                  aria-label={`${activeMeta.label} progress: ${stepSummary}, ${activeStatus?.completed_items ?? 0} of ${activeStatus?.total_items ?? 0}`}
                >
                  {activeComplete ? (
                    <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <Circle size={10} strokeWidth={2.4} aria-hidden="true" />
                  )}
                  <span>{stepSummary}</span>
                  <span className="community-launch-status-count">
                    {activeStatus?.completed_items ?? 0}/{activeStatus?.total_items ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
