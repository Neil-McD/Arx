import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildCommunityLaunchSetupStatus,
  COMMUNITY_LAUNCH_SETUP_STEPS,
} from "../shared/communityLaunchSetup.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const launchSetup = read("shared/communityLaunchSetup.ts");
const launchGateway = read("shared/cloudCommunityLaunchSetupGateway.ts");
const launchQuery = read("convex/communityLaunchSetup.ts");
const communityBarrel = read("convex/community.ts");
const setupCard = read("apps/web/src/components/WebCommunityLaunchSetupCard.tsx");
const setupModal = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const harnessImportSources = read("apps/web/src/lib/communityHarnessImportSources.ts");
const baseCss = read("apps/web/src/base.css");
const appShell = read("apps/web/src/App.tsx");
const shellChromeHostProps = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const mobileShellController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const workspaceLandingProjection = read(
  "apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx",
);

assert.deepEqual(COMMUNITY_LAUNCH_SETUP_STEPS, [
  "profile",
  "about",
  "agent",
  "workflows",
  "access",
  "knowledge",
  "publish",
]);
assert.match(
  launchSetup,
  /getCommunityPublishReadinessMissingFields/,
  "launch setup profile step must reuse the existing publish readiness helper",
);
assert.match(
  launchSetup,
  /const COMMUNITY_PROFILE_TOTAL_ITEMS = 4/,
  "profile launch completion should keep current publish readiness requirements",
);
assert.match(
  launchSetup,
  /isAccessConfigured/,
  "launch setup access step must account for policy-specific requirements",
);
assert.match(
  launchSetup,
  /paid_subscription"[\s\S]*Boolean\(input\.hasPaidAccessConfig\)/,
  "paid community access must require paid access configuration",
);

const draftStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  entryPolicy: "approval",
  visibility: "unlisted",
});
assert.equal(draftStatus.current_step, "profile");
assert.equal(draftStatus.completed, false);
assert.equal(draftStatus.total_items, 11);
assert.equal(draftStatus.steps.find((step) => step.step === "access")?.completed, true);
assert.equal(draftStatus.steps.find((step) => step.step === "publish")?.completed, false);
assert.deepEqual(draftStatus.steps.find((step) => step.step === "knowledge")?.missing, [
  "community_knowledge_material",
  "community_knowledge_published",
]);

const agentBeforeKnowledgeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: false,
  hasPublishedKnowledge: false,
  hasAgentConfig: false,
  hasWorkflow: false,
  entryPolicy: "approval",
  visibility: "unlisted",
});
assert.equal(agentBeforeKnowledgeStatus.current_step, "agent");

const workflowsBeforeKnowledgeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: false,
  hasPublishedKnowledge: false,
  hasAgentConfig: true,
  hasWorkflow: false,
  entryPolicy: "approval",
  visibility: "unlisted",
});
assert.equal(workflowsBeforeKnowledgeStatus.current_step, "workflows");

const accessBeforeKnowledgeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: false,
  hasPublishedKnowledge: false,
  hasAgentConfig: true,
  hasWorkflow: true,
  entryPolicy: null,
  visibility: "unlisted",
});
assert.equal(accessBeforeKnowledgeStatus.current_step, "access");

const stagedKnowledgeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: true,
  hasPublishedKnowledge: false,
  hasAgentConfig: true,
  hasWorkflow: true,
  entryPolicy: "approval",
  visibility: "published",
});
const stagedKnowledgeStep = stagedKnowledgeStatus.steps.find((step) => step.step === "knowledge");
assert.equal(stagedKnowledgeStatus.current_step, "knowledge");
assert.equal(stagedKnowledgeStep?.completed, false);
assert.equal(stagedKnowledgeStep?.completed_items, 1);
assert.equal(stagedKnowledgeStep?.total_items, 2);
assert.deepEqual(stagedKnowledgeStep?.missing, ["community_knowledge_published"]);

const paidWithoutPriceStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: true,
  hasPublishedKnowledge: true,
  hasAgentConfig: true,
  hasWorkflow: true,
  entryPolicy: "paid_subscription",
  hasPaidAccessConfig: false,
  visibility: "published",
});
assert.equal(paidWithoutPriceStatus.current_step, "access");
assert.equal(paidWithoutPriceStatus.completed, false);
assert.equal(paidWithoutPriceStatus.steps.find((step) => step.step === "access")?.completed, false);

const completeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: true,
  hasPublishedKnowledge: true,
  hasAgentConfig: true,
  hasWorkflow: true,
  entryPolicy: "paid_subscription",
  hasPaidAccessConfig: true,
  visibility: "published",
});
assert.equal(completeStatus.current_step, "complete");
assert.equal(completeStatus.completed, true);
assert.equal(completeStatus.percent, 100);

assert.match(
  launchQuery,
  /requireCommunityManager/,
  "launch setup status must be manager-gated",
);
assert.match(
  launchQuery,
  /communityResources/,
  "launch setup status must inspect community resources",
);
assert.match(
  launchSetup,
  /hasKnowledgeMaterial/,
  "launch setup knowledge step must track staged material separately",
);
assert.match(
  launchSetup,
  /hasPublishedKnowledge/,
  "launch setup knowledge step must track published usable knowledge separately",
);
assert.match(
  launchSetup,
  /community_knowledge_material[\s\S]*community_knowledge_published/,
  "launch setup knowledge step must expose separate activation points",
);
assert.match(
  launchSetup,
  /buildStepStatus\("knowledge", knowledgeMissing, 2\)/,
  "launch setup knowledge step must have two activation points",
);
assert.match(
  launchQuery,
  /communityResourceIsPublishedKnowledge/,
  "launch setup knowledge completion must require published usable knowledge",
);
assert.match(
  launchQuery,
  /hasKnowledgeMaterial: rows\.length > 0/,
  "launch setup staged knowledge progress must come from existing resource rows",
);
assert.match(
  launchQuery,
  /hasPublishedKnowledge: rows\.some\(\(row\) => communityResourceIsPublishedKnowledge\(row\)\)/,
  "launch setup published knowledge progress must use the shared usable knowledge predicate",
);
assert.match(
  launchQuery,
  /by_community_status_createdAt/,
  "launch setup knowledge completion must use the published-resource index",
);
assert.match(
  launchQuery,
  /communityAgentConfigs/,
  "launch setup status must inspect community agent config",
);
assert.match(
  launchQuery,
  /communityPricePoints/,
  "launch setup status must inspect community price points",
);
assert.match(
  launchQuery,
  /by_community_current/,
  "launch setup paid access check must use current price point index",
);
assert.match(
  launchQuery,
  /hasUsablePaidAccessConfig/,
  "launch setup paid access check must reject archived current price points",
);
assert.doesNotMatch(
  launchQuery,
  /communityResourceModules/,
  "empty resource modules must not complete the knowledge setup step",
);
assert.match(
  launchQuery,
  /communityAppMounts/,
  "launch setup status must inspect connected app workflows",
);
assert.match(
  launchQuery,
  /communitySkillAttachments/,
  "launch setup status must inspect attached skills",
);
assert.doesNotMatch(
  launchQuery,
  /\.collect\(\)/,
  "launch setup workspace status query must stay bounded",
);
assert.match(
  communityBarrel,
  /getCommunityLaunchSetupStatus/,
  "community barrel must expose launch setup status",
);
assert.match(
  launchGateway,
  /community:getCommunityLaunchSetupStatus/,
  "web gateway must call the canonical launch status query",
);
assert.match(
  launchGateway,
  /community:saveCommunityLaunchProfile/,
  "launch onboarding inline profile/about/publish saves must write through the canonical community mutation",
);
assert.match(
  communityBarrel,
  /saveCommunityLaunchProfile/,
  "community barrel must expose the launch profile mutation",
);
assert.match(
  setupCard,
  /Community launch/,
  "workspace card must present launch setup separately from account setup",
);
assert.match(
  setupModal,
  /Profile[\s\S]*About[\s\S]*Agent[\s\S]*Workflows[\s\S]*Access[\s\S]*Knowledge[\s\S]*Publish/,
  "launch modal must expose the agreed setup sequence",
);
assert.doesNotMatch(
  setupModal,
  /Globe2/,
  "launch publish step must not use the wrong lucide globe icon",
);
assert.match(
  setupModal,
  /PUBLISHED_COMMUNITY_GLOBE_ICON[\s\S]*<path d="M2 12h20" \/>[\s\S]*M12 2a15\.3 15\.3/,
  "launch publish step must reuse the published-community globe shape",
);
assert.match(
  setupModal,
  /Stripe Connect/,
  "launch access setup must label paid setup as Stripe Connect",
);
assert.match(
  setupModal,
  /StripeWordmark[\s\S]*community-launch-stripe-wordmark/,
  "launch access setup must reuse the Stripe wordmark for the paid setup path",
);
assert.match(
  setupModal,
  /mode\?: "setup" \| "create"[\s\S]*onCreateCommunity/,
  "launch modal must support create mode before a community exists",
);
assert.match(
  setupModal,
  /entryPolicy: null/,
  "launch modal create mode must not count access as complete before the community exists",
);
assert.doesNotMatch(
  setupModal,
  /activeMeta\.body|make the community recognizable across Discover/,
  "launch modal step cards should keep the active card focused on title and fields",
);
assert.doesNotMatch(
  setupModal,
  /polynet-onboarding-topbar|community-launch-brand-avatar/,
  "launch modal must not render the synthetic top-left community brand row",
);
assert.match(
  setupModal,
  /polynet-onboarding-close community-launch-close/,
  "launch modal close button should align with the modal header instead of reserving a topbar",
);
assert.doesNotMatch(
  setupModal,
  /Open full editor|polynet-onboarding-finish-later/,
  "launch modal must not keep the old full-editor escape button or detached finish-later footer",
);
assert.match(
  setupModal,
  /renderFinishLaterButton[\s\S]*polynet-onboarding-back[\s\S]*onClose[\s\S]*Finish later/,
  "launch modal must place Finish later in the per-step action row",
);
assert.match(
  setupModal,
  /function getNextLaunchStep[\s\S]*STEP_ORDER\.indexOf\(step\)[\s\S]*STEP_ORDER\[index \+ 1\]/,
  "launch modal saves must know the next onboarding step",
);
assert.match(
  setupModal,
  /await action\(\);[\s\S]*const nextStep = getNextLaunchStep\(step\);[\s\S]*setStepOverride\(nextStep\);[\s\S]*setActiveStep\(nextStep\);/,
  "launch modal must advance to the next step after a successful save/create",
);
assert.match(
  setupModal,
  /if \(!isOpen \|\| stepOverride\) return;/,
  "launch modal status refreshes must not pull the user back after a successful step advance",
);
assert.match(
  baseCss,
  /\.community-launch-field input,[\s\S]*?background: linear-gradient\(180deg, rgba\(5, 5, 7, 0\.86\), rgba\(8, 8, 11, 0\.9\)\)/,
  "launch modal text fields must be visibly darker than the card surface",
);
assert.match(
  appShell,
  /openCommunityLaunchCreateFlow[\s\S]*setIsCommunityLaunchCreateMode\(true\)[\s\S]*setIsCommunityLaunchSetupModalOpen\(true\)/,
  "app shell must open the launch onboarding modal for new community creation",
);
assert.match(
  appShell,
  /create_community: \(payload\)[\s\S]*if \(payload\.draft\)[\s\S]*openCreateCommunityModal\(payload\.draft\)[\s\S]*openCommunityLaunchCreateFlow\(\)/,
  "auth resume should keep legacy drafts but route empty community create intents to launch onboarding",
);
assert.match(
  appShell,
  /handleCreateCommunityFromLaunch[\s\S]*createCloudCommunity[\s\S]*loadCloudCommunityLaunchSetupStatus/,
  "launch create flow must create the community then continue into setup status",
);
assert.match(
  shellChromeHostProps,
  /onOpenCommunityCreateCta[\s\S]*openCommunityCreateFlow/,
  "desktop community rail create CTA must route to the launch create flow",
);
assert.doesNotMatch(
  shellChromeHostProps,
  /onOpenCommunityCreateCta[\s\S]{0,240}openCreateCommunityModal/,
  "desktop community rail create CTA must not open the legacy create modal directly",
);
assert.match(
  mobileShellController,
  /openMobileCreateCommunity[\s\S]*openCommunityCreateFlow/,
  "mobile community create CTA must route to the launch create flow",
);
assert.match(
  setupModal,
  /community-launch-step-summary[\s\S]*completed_items[\s\S]*total_items/,
  "launch modal must show the compact aggregate progress indicator for each step",
);
assert.doesNotMatch(
  setupModal,
  /community-launch-checklist|Add source material|Publish one usable resource|Resource title|Resource body|Add resource|knowledgeDraft|handleAddKnowledge\(/,
  "launch modal must not render per-item checklist rows inside the step card",
);
assert.match(
  setupModal,
  /Sources[\s\S]*Drop source material[\s\S]*Links[\s\S]*Add source links[\s\S]*Integrations[\s\S]*Google Drive[\s\S]*GitHub[\s\S]*Review publish/,
  "launch knowledge step must separate file sources, link sources, and connected source integrations",
);
assert.match(
  setupModal,
  /COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS = 5[\s\S]*knowledgeLinkDrafts[\s\S]*Add new link[\s\S]*Add links/,
  "launch knowledge link entry must support adding up to five links",
);
assert.match(
  setupModal,
  /onAddKnowledgeLink[\s\S]*handleAddKnowledgeLink[\s\S]*urls: knowledgeLinkDrafts[\s\S]*community-launch-knowledge-link-composer/,
  "launch knowledge link entries must write through the onboarding save path",
);
assert.match(
  appShell,
  /handleAddCommunityLaunchKnowledgeLink[\s\S]*urls: string\[\][\s\S]*rawUrls\.length > 5[\s\S]*saveCloudCommunityResource[\s\S]*type: "link"[\s\S]*resource_status: "published"/,
  "launch knowledge links must create canonical published link resources",
);
assert.doesNotMatch(
  setupModal,
  /Starter guide|Generate the Get Started path/,
  "launch knowledge step should not lead with the old starter-guide placeholder",
);
assert.match(
  setupModal,
  /community-launch-knowledge-provider-logo drive[\s\S]*\/app-logos\/google-drive\.svg[\s\S]*community-launch-knowledge-provider-logo github[\s\S]*\/app-logos\/github\.svg/,
  "launch knowledge integrations must show Google Drive and light GitHub logos",
);
assert.match(
  baseCss,
  /\.community-launch-knowledge-provider-logo\.github[\s\S]*filter: brightness\(0\) invert\(1\)/,
  "launch knowledge GitHub logo must be light on the dark background",
);
assert.match(
  setupModal,
  /create-community-banner[\s\S]*create-community-banner-media[\s\S]*create-community-avatar-row[\s\S]*create-community-avatar/,
  "launch profile setup must reuse the canonical community branding preview structure",
);
assert.match(
  setupModal,
  /type="file"[\s\S]*accept="image\/\*"/,
  "launch profile setup must use raw image file inputs",
);
assert.doesNotMatch(
  setupModal,
  /Avatar URL|Banner URL|community-launch-media-grid|community-launch-avatar-preview|community-launch-banner-preview/,
  "launch profile setup must not expose resolved storage URLs or custom branding preview classes",
);
assert.match(
  appShell,
  /prepareCloudCommunityBrandingField[\s\S]*saveCloudCommunityLaunchProfile/,
  "launch profile saves must upload raw branding images through the canonical storage path",
);
assert.match(
  setupModal,
  /onSaveProfile[\s\S]*onSaveAbout[\s\S]*onSaveAgent[\s\S]*onSaveAccess/,
  "launch modal must support inline canonical saves for the core setup surfaces",
);
assert.match(
  setupModal,
  /Choose workflow path[\s\S]*Import from existing harness[\s\S]*Build in PolyNet/,
  "launch workflow step must start with the two-path choice layer",
);
assert.match(
  setupModal,
  /Import from existing harness[\s\S]*MCP servers[\s\S]*Claude[\s\S]*Codex[\s\S]*OpenClaw[\s\S]*Hermes/,
  "launch workflow import path must frame harness import as MCPs, skills, prompts, and repo context",
);
assert.match(
  harnessImportSources,
  /label: "Claude"[\s\S]*logoUrl: "\/harness-logos\/claude\.svg"[\s\S]*label: "Codex"[\s\S]*logoUrl: "\/harness-logos\/codex\.png"[\s\S]*label: "OpenClaw"[\s\S]*logoUrl: "\/harness-logos\/openclaw\.svg"[\s\S]*label: "Hermes"[\s\S]*logoUrl: "\/harness-logos\/hermes\.svg"/,
  "launch workflow import path must use a dedicated asset-backed harness source registry",
);
assert.doesNotMatch(
  harnessImportSources,
  /Clawd|clawd/,
  "launch workflow import path must not keep the incorrect Clawd source",
);
assert.match(
  setupModal,
  /communityHarnessImportSources\.map[\s\S]*<img src=\{source\.logoUrl\} alt="" loading="lazy" \/>/,
  "launch workflow import path must render real harness logo images from the registry",
);
assert.doesNotMatch(
  setupModal,
  /title="CLAW"|>CLAW<|>OC<|>H</,
  "launch workflow import path must not render fake text logo chips",
);
for (const logoPath of [
  "apps/web/public/harness-logos/claude.svg",
  "apps/web/public/harness-logos/codex.png",
  "apps/web/public/harness-logos/openclaw.svg",
  "apps/web/public/harness-logos/hermes.svg",
]) {
  assert.equal(existsSync(logoPath), true, `missing harness logo asset: ${logoPath}`);
}
assert.equal(
  existsSync("apps/web/public/harness-logos/clawd.png"),
  false,
  "incorrect Clawd logo asset must not be kept",
);
assert.match(
  setupModal,
  /Build in PolyNet[\s\S]*onOpenStep\("workflows"\)/,
  "launch workflow build path must continue to the canonical PolyNet workflows surface",
);
assert.match(
  baseCss,
  /\.community-launch-workflow-option \{[\s\S]*background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.072\), rgba\(255, 255, 255, 0\.044\)\)/,
  "launch workflow selector cards must use a visibly raised neutral button surface",
);
assert.match(
  baseCss,
  /\.community-launch-choice \{[\s\S]*background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.072\), rgba\(255, 255, 255, 0\.044\)\)/,
  "launch access selector cards must use a visibly raised neutral button surface",
);
assert.match(
  workspaceLandingProjection,
  /WebCommunityLaunchSetupCard/,
  "workspace landing must be able to render the community launch setup card",
);

console.log("PASS: community launch setup contract is canonical.");
