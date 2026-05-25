import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCommunityLaunchSetupStatus,
  COMMUNITY_LAUNCH_SETUP_STEPS,
} from "../shared/communityLaunchSetup.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const launchSetup = read("shared/communityLaunchSetup.ts");
const launchGateway = read("shared/cloudCommunityLaunchSetupGateway.ts");
const convexSchema = read("convex/schema.ts");
const launchQuery = read("convex/communityLaunchSetup.ts");
const communityBarrel = read("convex/community.ts");
const setupCard = read(
  "apps/web/src/components/WebCommunityLaunchSetupCard.tsx",
);
const setupModal = read(
  "apps/web/src/components/WebCommunityLaunchSetupModal.tsx",
);
const launchSetupRoute = read("apps/web/src/communityLaunchSetupRoute.ts");
const sourceOAuth = read("apps/web/src/communityLaunchKnowledgeSourceOAuth.ts");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const baseCss = read("apps/web/src/base.css");
const appShell = read("apps/web/src/App.tsx");
const shellChromeHostProps = read(
  "apps/web/src/controllers/buildWebShellChromeHostProps.ts",
);
const mobileShellController = read(
  "apps/web/src/controllers/useWebMobileShellController.ts",
);
const workspaceLandingProjection = read(
  "apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx",
);

assert.deepEqual(COMMUNITY_LAUNCH_SETUP_STEPS, [
  "profile",
  "about",
  "agent",
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
assert.equal(draftStatus.total_items, 10);
assert.equal(
  draftStatus.steps.find((step) => step.step === "access")?.completed,
  true,
);
assert.equal(
  draftStatus.steps.find((step) => step.step === "publish")?.completed,
  false,
);
assert.deepEqual(
  draftStatus.steps.find((step) => step.step === "knowledge")?.missing,
  ["community_knowledge_material", "community_knowledge_published"],
);

const agentBeforeKnowledgeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: false,
  hasPublishedKnowledge: false,
  hasAgentConfig: false,
  entryPolicy: "approval",
  visibility: "unlisted",
});
assert.equal(agentBeforeKnowledgeStatus.current_step, "agent");

const knowledgeBeforePublishStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: false,
  hasPublishedKnowledge: false,
  hasAgentConfig: true,
  entryPolicy: "approval",
  visibility: "unlisted",
});
assert.equal(knowledgeBeforePublishStatus.current_step, "knowledge");

const accessBeforeKnowledgeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: false,
  hasPublishedKnowledge: false,
  hasAgentConfig: true,
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
  entryPolicy: "approval",
  visibility: "published",
});
const stagedKnowledgeStep = stagedKnowledgeStatus.steps.find(
  (step) => step.step === "knowledge",
);
assert.equal(stagedKnowledgeStatus.current_step, "knowledge");
assert.equal(stagedKnowledgeStep?.completed, false);
assert.equal(stagedKnowledgeStep?.completed_items, 1);
assert.equal(stagedKnowledgeStep?.total_items, 2);
assert.deepEqual(stagedKnowledgeStep?.missing, [
  "community_knowledge_published",
]);

const paidWithoutPriceStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: true,
  hasPublishedKnowledge: true,
  hasAgentConfig: true,
  entryPolicy: "paid_subscription",
  hasPaidAccessConfig: false,
  visibility: "published",
});
assert.equal(paidWithoutPriceStatus.current_step, "access");
assert.equal(paidWithoutPriceStatus.completed, false);
assert.equal(
  paidWithoutPriceStatus.steps.find((step) => step.step === "access")
    ?.completed,
  false,
);

const completeStatus = buildCommunityLaunchSetupStatus({
  name: "Operators",
  oneLiner: "Operators building with AI.",
  avatarUrl: "https://example.com/avatar.png",
  bannerUrl: "https://example.com/banner.png",
  about: "A community for operators.",
  hasKnowledgeMaterial: true,
  hasPublishedKnowledge: true,
  hasAgentConfig: true,
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
assert.doesNotMatch(
  launchQuery,
  /communityAppMounts|communitySkillAttachments/,
  "launch setup status must not depend on workflow app or skill imports",
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
  /Profile[\s\S]*About[\s\S]*Agent[\s\S]*Access[\s\S]*Knowledge[\s\S]*Publish/,
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
  /if \(!isOpen \|\| stepOverride \|\| requestedInitialStep\) return;/,
  "launch modal status refreshes must not pull the user back after a successful step advance or route-restored initial step",
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
  /community-launch-checklist|Add source material|Publish one usable resource|Resource title|Resource body|Add resource|handleAddKnowledge\(/,
  "launch modal must not render per-item checklist rows inside the step card",
);
assert.match(
  setupModal,
  /Collect source material[\s\S]*Sources[\s\S]*Drop source material[\s\S]*Drop files or choose files[\s\S]*Links[\s\S]*Add source links[\s\S]*Integrations[\s\S]*Google Drive[\s\S]*GitHub/,
  "launch knowledge step must separate file sources, link sources, and connected source integrations",
);
assert.match(
  setupModal,
  /CommunityLaunchGoogleDriveConnection[\s\S]*CommunityLaunchGoogleDriveFile[\s\S]*onLoadKnowledgeGoogleDriveConnection[\s\S]*onConnectKnowledgeGoogleDrive[\s\S]*onListKnowledgeGoogleDriveFiles[\s\S]*onImportKnowledgeGoogleDriveFiles/,
  "launch knowledge integrations must expose a concrete Google Drive lifecycle contract",
);
assert.match(
  setupModal,
  /CommunityLaunchKnowledgeImportedSource[\s\S]*knowledgeLinkSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*knowledgeFileSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*knowledgeGoogleDriveSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*onLoadKnowledgeSources\?:[\s\S]*onRemoveKnowledgeLinkSource\?:[\s\S]*onRemoveKnowledgeFileSource\?:[\s\S]*onRemoveKnowledgeGoogleDriveSource\?:[\s\S]*onDisconnectKnowledgeGoogleDrive\?:/,
  "launch knowledge contract must expose saved link/file/Google Drive source rows, explicit source loading, per-source removal, and disconnect",
);
assert.match(
  setupModal,
  /knowledgeGitHubSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*onLoadKnowledgeGitHubConnection[\s\S]*onConnectKnowledgeGitHub[\s\S]*onListKnowledgeGitHubRepositories[\s\S]*onListKnowledgeGitHubFiles[\s\S]*onImportKnowledgeGitHubFiles[\s\S]*onRemoveKnowledgeGitHubSource\?:[\s\S]*onDisconnectKnowledgeGitHub/,
  "launch knowledge integrations must expose a concrete GitHub lifecycle contract with imported rows and per-source removal",
);
assert.match(
  setupModal,
  /knowledgeDriveConnection[\s\S]*knowledgeDriveFiles[\s\S]*knowledgeDriveSelectedIds[\s\S]*handleGoogleDrivePrimaryAction[\s\S]*handleImportGoogleDriveFiles/,
  "launch knowledge Google Drive UI must track connection, file selections, and local import action",
);
assert.match(
  setupModal,
  /CommunityLaunchGoogleDriveFileListRequest[\s\S]*folderId\?: string \| null[\s\S]*pageToken\?: string \| null[\s\S]*next_page_token\?: string \| null/,
  "launch knowledge Google Drive list contract must support folder navigation and cursor pagination",
);
assert.match(
  setupModal,
  /knowledgeDriveBrowserOpen[\s\S]*knowledgeDriveSearchDraft[\s\S]*knowledgeDriveFolderTrail[\s\S]*knowledgeDriveNextPageToken[\s\S]*knowledgeDriveLocationPath[\s\S]*handleSearchGoogleDriveFiles[\s\S]*handleOpenGoogleDriveFolder[\s\S]*handleBackGoogleDriveLocation[\s\S]*handleLoadMoreGoogleDriveFiles[\s\S]*handleCloseGoogleDrivePicker/,
  "launch knowledge Google Drive picker must expose search, folder navigation, load-more, and close state",
);
assert.match(
  setupModal,
  /community-launch-knowledge-drive-location[\s\S]*Current location[\s\S]*knowledgeDriveLocationPath[\s\S]*community-launch-knowledge-drive-back/,
  "launch knowledge Google Drive picker should show a clear current location with one back action instead of breadcrumb pills",
);
assert.match(
  setupModal,
  /file\.kind === "folder"[\s\S]*community-launch-knowledge-drive-folder[\s\S]*handleOpenGoogleDriveFolder\(file\)[\s\S]*isImportableGoogleDriveSourceFile\(file\)[\s\S]*handleToggleGoogleDriveFile/,
  "launch knowledge Google Drive folders should navigate while only importable files can be selected",
);
assert.match(
  setupModal,
  /(?=[\s\S]*knowledgeDriveImportedExternalIds)(?=[\s\S]*handleDisconnectGoogleDrive)(?=[\s\S]*handleRemoveSavedKnowledgeSource)(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeGoogleDriveSources}[\s\S]*fallbackTitle="Drive source"[\s\S]*onRemove={handleRemoveSavedKnowledgeSource})(?=[\s\S]*function ImportedKnowledgeSourceRows[\s\S]*community-launch-knowledge-imported-source[\s\S]*<Check[\s\S]*<ExternalLink[\s\S]*<Trash2)/,
  "launch knowledge Drive UI must show saved Drive sources under Drive and support deleting one source",
);
assert.match(
  setupModal,
  /(?=[\s\S]*knowledgeGitHubImportedExternalIds)(?=[\s\S]*handleRemoveSavedKnowledgeSource)(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeGitHubSources}[\s\S]*fallbackTitle="GitHub source"[\s\S]*onRemove={handleRemoveSavedKnowledgeSource})(?=[\s\S]*community-launch-knowledge-imported-source)/,
  "launch knowledge GitHub UI must show saved GitHub sources under GitHub and support deleting one source",
);
assert.match(
  setupModal,
  /(?=[\s\S]*knowledgeFileSourcesExpanded)(?=[\s\S]*knowledgeLinkSourcesExpanded)(?=[\s\S]*knowledgeDriveSourcesExpanded)(?=[\s\S]*knowledgeGitHubSourcesExpanded)(?=[\s\S]*function ImportedKnowledgeSourceRows[\s\S]*resourceLabel[\s\S]*community-launch-knowledge-imported-summary[\s\S]*<span>\{resourceLabel\}<\/span>)(?=[\s\S]*community-launch-knowledge-imported-sources is-expanded[\s\S]*Show fewer)/,
  "launch knowledge saved source counters must be provider-local and expand to detail rows",
);
assert.doesNotMatch(
  setupModal,
  /effectiveKnowledgeSavedSources|knowledgePendingResourceLabel|community-launch-knowledge-savebar|Save sources/,
  "launch knowledge must not collapse provider sources into a global saved/pending save surface",
);
assert.match(
  baseCss,
  /\.community-launch-knowledge-imported-summary[\s\S]*background: transparent[\s\S]*\.community-launch-knowledge-imported-sources[\s\S]*max-height: 136px[\s\S]*overflow-y: auto[\s\S]*\.community-launch-knowledge-source-list-toggle/,
  "launch knowledge imported source list must default to a minimal resource counter and scroll only in expanded detail mode",
);
assert.match(
  setupModal,
  /alreadyAdded = knowledgeDriveImportedExternalIds\.has\(file\.id\)[\s\S]*disabled=\{!isImportableGoogleDriveSourceFile\(file\) \|\| alreadyAdded\}[\s\S]*alreadyAdded \? "Added"/,
  "launch knowledge Google Drive picker should mark already imported files as Added instead of selectable",
);
assert.match(
  setupModal,
  /knowledgeDriveConnectionLoading[\s\S]*knowledgeDriveFilesLoading[\s\S]*knowledgeGitHubConnectionLoading[\s\S]*knowledgeGitHubRepositoriesLoading[\s\S]*knowledgeGitHubFilesLoading/,
  "launch knowledge integration loading must be split by connection, list, and file phases to avoid picker flicker",
);
assert.match(
  setupModal,
  /onLoadKnowledgeGoogleDriveConnectionRef[\s\S]*onLoadKnowledgeGitHubConnectionRef[\s\S]*const loadConnection = onLoadKnowledgeGitHubConnectionRef\.current[\s\S]*\}, \[activeStep, community\?\.id, isOpen, knowledgeIntegrationReloadKey\]\);/,
  "launch knowledge passive integration status reloads should not restart when App recreates callback props",
);
assert.doesNotMatch(
  setupModal,
  /knowledgeDriveLoading|knowledgeGitHubLoading/,
  "launch knowledge integrations must not collapse provider refresh/list/import into one flickery loading flag",
);
assert.match(
  setupModal,
  /knowledgeProviderStateCommunityKeyRef[\s\S]*nextKnowledgeProviderStateCommunityKey[\s\S]*!== nextKnowledgeProviderStateCommunityKey[\s\S]*setKnowledgeDriveConnection\(null\)[\s\S]*setKnowledgeGitHubConnection\(null\)/,
  "launch knowledge integration state should reset only when the target community changes",
);
assert.match(
  setupModal,
  /knowledgeGitHubConnection[\s\S]*knowledgeGitHubRepositories[\s\S]*knowledgeGitHubSelectedRepository[\s\S]*knowledgeGitHubFiles[\s\S]*knowledgeGitHubSelectedIds[\s\S]*knowledgeGitHubDisconnecting[\s\S]*loadGitHubRepositories[\s\S]*knowledgeAutoOpenProvider !== "github"[\s\S]*handleGitHubPrimaryAction[\s\S]*handleSelectGitHubRepository[\s\S]*handleCloseGitHubPicker[\s\S]*handleDisconnectGitHub[\s\S]*handleImportGitHubFiles/,
  "launch knowledge GitHub UI must track connection, auto-open repository selection, close state, disconnect state, and local import action",
);
assert.match(
  setupModal,
  /Google Drive[\s\S]*Select files[\s\S]*Connect[\s\S]*Disconnect[\s\S]*knowledgeDriveSelectedIds\.length[\s\S]*selected[\s\S]*Close/,
  "launch knowledge Google Drive chip must connect first, then allow staged file selection and closing the picker",
);
assert.doesNotMatch(
  setupModal,
  /community-launch-knowledge-drive-picker|community-launch-knowledge-drive-browser|community-launch-knowledge-drive-actions|community-launch-knowledge-drive-empty|community-launch-knowledge-drive-import/,
  "launch knowledge shared source picker chrome must not keep Drive-only class names",
);
assert.match(
  setupModal,
  /GitHub[\s\S]*Select repo[\s\S]*Connect[\s\S]*handleDisconnectGitHub[\s\S]*Disconnect[\s\S]*knowledgeGitHubSelectedIds\.length[\s\S]*selected/,
  "launch knowledge GitHub chip must connect first, support disconnecting credentials, then allow staged repository/file selection",
);
assert.match(
  setupModal,
  /community-launch-knowledge-integrations[\s\S]*community-launch-knowledge-integration-provider[\s\S]*Google Drive[\s\S]*handleDisconnectGoogleDrive[\s\S]*community-launch-knowledge-integration-provider[\s\S]*GitHub[\s\S]*handleDisconnectGitHub/,
  "launch knowledge provider disconnect controls must be grouped under their own provider chips",
);
assert.match(
  baseCss,
  /\.community-launch-knowledge-integration-provider[\s\S]*display: grid[\s\S]*align-content: start/,
  "launch knowledge provider groups should stack each disconnect directly below its provider chip",
);
assert.doesNotMatch(
  setupModal,
  /GitHub connected/,
  "launch knowledge GitHub UI should not show the old connected-as account text",
);
assert.match(
  sourceOAuth,
  /SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES[\s\S]*source_integration_oauth[\s\S]*source_integration_finalize_token[\s\S]*source_integration_context[\s\S]*normalizeSourceIntegrationOAuthProvider[\s\S]*readCommunityLaunchKnowledgeSourceOAuthIntent[\s\S]*return_context_kind[\s\S]*community_launch_knowledge/,
  "source integration OAuth launch restore helpers must own return params, stored intent, and explicit return context",
);
assert.match(
  appShell,
  /readCommunityLaunchKnowledgeOAuthContext[\s\S]*readCommunityLaunchKnowledgeSourceOAuthIntent[\s\S]*mergeCommunityLaunchKnowledgeOAuthContext[\s\S]*finalizeCloudCommunityGitHubSourceOAuth[\s\S]*finalizeCloudCommunityGoogleDriveSourceOAuth[\s\S]*`\$\{providerLabel\} connected\.`/,
  "app shell must use the source OAuth helpers to finalize launch integration returns",
);
assert.match(
  launchSetupRoute,
  /COMMUNITY_LAUNCH_SETUP_ROUTE_PARAM_NAMES[\s\S]*community_launch_setup[\s\S]*community_launch_step[\s\S]*readCommunityLaunchSetupPathRouteContext[\s\S]*readCurrentCommunityLaunchSetupRouteContext[\s\S]*\/setup\/\$\{encodeURIComponent\(args\.step\)\}/,
  "launch setup route helper must own path-first parse/build behavior for durable setup-step URLs",
);
assert.match(
  routeLifecycle,
  /source_integration_oauth[\s\S]*hasCommunityLaunchSetupRouteState[\s\S]*community_launch_setup[\s\S]*isCommunityLaunchSetupRoutePath[\s\S]*hasCommunityLaunchSetupRouteState\(\)\) return/,
  "route lifecycle must preserve source OAuth and launch setup route state instead of canonicalizing it away",
);
assert.match(
  appShell,
  /pendingCommunityLaunchSetupRouteContext[\s\S]*readCurrentCommunityLaunchSetupRouteContext[\s\S]*replaceCommunityLaunchSetupRouteState[\s\S]*buildCommunityLaunchSetupRoutePath[\s\S]*clearCommunityLaunchSetupRouteState[\s\S]*readCommunityLaunchSetupRouteContext/,
  "app shell must persist launch setup modal state to the URL and clear setup path/query state on close",
);
assert.match(
  appShell,
  /communityLaunchKnowledgeAutoOpenProvider[\s\S]*"google_drive" \| "github" \| null[\s\S]*provider === "google_drive" \|\| provider === "github"[\s\S]*setCommunityLaunchKnowledgeAutoOpenProvider\(provider\)[\s\S]*knowledgeAutoOpenProvider=\{communityLaunchKnowledgeAutoOpenProvider\}[\s\S]*onKnowledgeAutoOpenHandled/,
  "Drive and GitHub OAuth restore should pass an auto-open intent into the launch Knowledge modal",
);
{
  const earlyNullReturnIndex = setupModal.indexOf("if (!isOpen || !effectiveCommunity || !effectiveStatus) return null;");
  const driveAutoOpenHookIndex = setupModal.indexOf("knowledgeAutoOpenProvider !== \"google_drive\"");
  const githubAutoOpenHookIndex = setupModal.indexOf("knowledgeAutoOpenProvider !== \"github\"");
  assert.ok(earlyNullReturnIndex >= 0, "launch setup modal must retain the explicit unloaded early return");
  assert.ok(driveAutoOpenHookIndex >= 0, "launch setup modal must retain the Google Drive auto-open hook");
  assert.ok(githubAutoOpenHookIndex >= 0, "launch setup modal must retain the GitHub auto-open hook");
  assert.ok(
    driveAutoOpenHookIndex < earlyNullReturnIndex,
    "launch setup modal hooks must stay before the unloaded early return to preserve React hook order",
  );
  assert.ok(
    githubAutoOpenHookIndex < earlyNullReturnIndex,
    "launch setup modal GitHub auto-open hook must stay before the unloaded early return to preserve React hook order",
  );
}
assert.match(
  appShell,
  /const context = pendingCommunityLaunchSetupRouteContext[\s\S]*context\.step[\s\S]*applyCommunityShellState[\s\S]*setCommunityLaunchSetupInitialStep\(context\.step\)[\s\S]*setIsCommunityLaunchSetupModalOpen\(true\)/,
  "app shell must restore launch setup modal and exact step from durable route state after refresh",
);
assert.match(
  setupModal,
  /onStepChange\?:[\s\S]*onStepChange,[\s\S]*onStepChange\?\.\(nextStep\)[\s\S]*onStepChange\?\.\(step\)/,
  "launch setup modal step changes must notify the shell so the durable route stays current",
);
assert.match(
  appShell,
  /setCommunityLaunchLinkSources[\s\S]*setCommunityLaunchFileSources[\s\S]*setCommunityLaunchGoogleDriveSources[\s\S]*setCommunityLaunchGitHubSources[\s\S]*loadCommunityLaunchKnowledgeSources[\s\S]*listCloudCommunityLaunchKnowledgeSources[\s\S]*source_ingestion_kind === "url"[\s\S]*source_ingestion_kind === "file"[\s\S]*source_external_provider === "google_drive"[\s\S]*source_external_provider === "github"[\s\S]*handleLoadCommunityLaunchGoogleDriveConnection[\s\S]*loadCloudCommunityGoogleDriveSourceConnection[\s\S]*handleConnectCommunityLaunchGoogleDrive[\s\S]*beginCloudCommunityGoogleDriveSourceOAuth[\s\S]*writeCommunityLaunchKnowledgeSourceOAuthIntent\(\{[\s\S]*provider: "google_drive"[\s\S]*window\.location\.assign\(result\.authorize_url\)[\s\S]*handleListCommunityLaunchGoogleDriveFiles[\s\S]*listCloudCommunityGoogleDriveSourceFiles[\s\S]*handleImportCommunityLaunchGoogleDriveFiles[\s\S]*importCloudCommunityGoogleDriveSourceFiles[\s\S]*handleRemoveCommunityLaunchKnowledgeSource[\s\S]*deleteCloudCommunityResource[\s\S]*handleDisconnectCommunityLaunchGoogleDrive[\s\S]*disconnectCloudCommunityGoogleDriveSourceConnection/,
  "app shell must wire focused launch Knowledge link/file rows plus Google Drive connection, listing, import, remove, and disconnect handlers",
);
assert.match(
  appShell,
  /handleLoadCommunityLaunchKnowledgeSources[\s\S]*loadCommunityLaunchKnowledgeSources\(community\.id, session\)[\s\S]*onLoadKnowledgeSources=\{handleLoadCommunityLaunchKnowledgeSources\}/,
  "app shell must explicitly hydrate saved launch Knowledge sources through the focused source-row query when the Knowledge step opens",
);
assert.doesNotMatch(
  appShell.match(/const handleLoadCommunityLaunchKnowledgeSources[\s\S]*?const handleLoadCommunityLaunchGoogleDriveConnection/)?.[0] ?? "",
  /loadCommunityResources/,
  "launch Knowledge saved source hydration must not depend on broad community resource hydration",
);
const googleDriveConnectionLoadSection =
  appShell.match(/const handleLoadCommunityLaunchGoogleDriveConnection[\s\S]*?const handleConnectCommunityLaunchGoogleDrive/)?.[0] ?? "";
assert.doesNotMatch(
  googleDriveConnectionLoadSection,
  /loadCommunityResources/,
  "passive Google Drive connection status loading should not refresh community resources",
);
assert.match(
  appShell,
  /handleLoadCommunityLaunchGitHubConnection[\s\S]*loadCloudCommunityGitHubSourceConnection[\s\S]*handleConnectCommunityLaunchGitHub[\s\S]*beginCloudCommunityGitHubSourceOAuth[\s\S]*writeCommunityLaunchKnowledgeSourceOAuthIntent\(\{[\s\S]*provider: "github"[\s\S]*window\.location\.assign\(result\.authorize_url\)[\s\S]*handleListCommunityLaunchGitHubRepositories[\s\S]*listCloudCommunityGitHubSourceRepositories[\s\S]*handleListCommunityLaunchGitHubFiles[\s\S]*listCloudCommunityGitHubSourceFiles[\s\S]*handleImportCommunityLaunchGitHubFiles[\s\S]*importCloudCommunityGitHubSourceFiles[\s\S]*handleDisconnectCommunityLaunchGitHub[\s\S]*disconnectCloudCommunityGitHubSourceConnection/,
  "app shell must wire launch Knowledge GitHub connection, listing, import, and disconnect handlers",
);
assert.match(
  appShell,
  /knowledgeLinkSources=\{communityLaunchLinkSources\}[\s\S]*knowledgeFileSources=\{communityLaunchFileSources\}[\s\S]*knowledgeGitHubSources=\{communityLaunchGitHubSources\}[\s\S]*onRemoveKnowledgeLinkSource=\{handleRemoveCommunityLaunchKnowledgeSource\}[\s\S]*onRemoveKnowledgeFileSource=\{handleRemoveCommunityLaunchKnowledgeSource\}[\s\S]*onRemoveKnowledgeGitHubSource=\{handleRemoveCommunityLaunchKnowledgeSource\}/,
  "app shell must pass saved link/file/GitHub source rows and provider-agnostic source removal into launch Knowledge",
);
assert.doesNotMatch(
  setupModal,
  /Drop files here once ingestion is enabled/,
  "launch knowledge source uploads must not be a disabled placeholder",
);
assert.doesNotMatch(
  setupModal,
  /type CommunityLaunchKnowledgeStage|knowledgeStage|Set up the wiki structure|Build the wiki plan|Review the generated wiki plan|community-launch-knowledge-architect-row|community-launch-knowledge-intent/,
  "launch knowledge step must not expose setup or architect screens",
);
assert.match(
  setupModal,
  /handlePrepareKnowledgeResources[\s\S]*Add source links before continuing[\s\S]*Import selected Google Drive files before continuing[\s\S]*Import selected GitHub files before continuing[\s\S]*onIngestKnowledgeSources[\s\S]*onGenerateKnowledgePlan[\s\S]*onApplyKnowledgePlan[\s\S]*!sourceBackedPlan[\s\S]*onLoadKnowledgeHealth[\s\S]*onEnsureKnowledgeScaffold[\s\S]*onDraftKnowledgeResources[\s\S]*onOpenStep\("knowledge"\)/,
  "launch knowledge Next must require provider-local saves/imports, run source-driven planning first, and reserve scaffold for fallback",
);
assert.match(
  setupModal,
  /architecture_quality\?:[\s\S]*formatKnowledgeArchitectureQualityWarning[\s\S]*Resources drafted, but organization needs review\.[\s\S]*applyResult\.architecture_quality[\s\S]*setStepSuccess/,
  "launch knowledge Next must surface architecture quality warnings compactly",
);
assert.match(
  setupModal,
  /sourceNeedsIntegrationReconnect[\s\S]*credential_status === "missing"[\s\S]*knowledgeDriveMissingCredentialSources[\s\S]*knowledgeGitHubMissingCredentialSources[\s\S]*knowledgeMissingCredentialMessage[\s\S]*handlePrepareKnowledgeResources[\s\S]*if \(knowledgeMissingCredentialMessage\)[\s\S]*setStepError\(knowledgeMissingCredentialMessage\)[\s\S]*return;[\s\S]*onIngestKnowledgeSources/,
  "launch knowledge Next must block provider ingestion when queued Drive or GitHub sources need reconnect",
);
assert.match(
  setupModal,
  /community-launch-knowledge-reconnect-required[\s\S]*formatReconnectRequiredMessage\([\s\S]*"Google Drive"[\s\S]*community-launch-knowledge-reconnect-required[\s\S]*formatReconnectRequiredMessage\([\s\S]*"GitHub"/,
  "launch knowledge integrations must show compact reconnect-required copy under the affected provider",
);
assert.match(
  baseCss,
  /\.community-launch-knowledge-imported-source\.is-credential-missing[\s\S]*\.community-launch-knowledge-reconnect-required/,
  "launch knowledge missing-credential source rows must have a compact warning state",
);
assert.match(
  setupModal,
  /(?=[\s\S]*Curating resources\.\.\.)(?=[\s\S]*Resources drafted for review\.)(?=[\s\S]*Draft resources prepared for review\.)/,
  "launch knowledge step must present agent preparation as an internal progress state",
);
assert.doesNotMatch(
  setupModal,
  /Create drafts|Review publish|Apply draft plan/,
  "launch knowledge step must not expose raw scaffold or architect actions",
);
assert.match(
  setupModal,
  /COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS = 5[\s\S]*knowledgeLinkDrafts[\s\S]*community-launch-knowledge-link-actions[\s\S]*community-launch-knowledge-link-add[\s\S]*<Plus[\s\S]*Add new link[\s\S]*Add links/,
  "launch knowledge link entry must support adding up to five links with a left-aligned plus add control and local Add links action",
);
assert.match(
  baseCss,
  /\.community-launch-knowledge-link-actions[\s\S]*justify-content: space-between[\s\S]*\.community-launch-knowledge-link-composer button\.community-launch-knowledge-link-add[\s\S]*background: transparent/,
  "launch knowledge link add control must sit left of the count without a heavy button box",
);
assert.match(
  setupModal,
  /onAddKnowledgeLink[\s\S]*saveKnowledgeLinkDrafts[\s\S]*const urls = knowledgeLinkDrafts[\s\S]*await onAddKnowledgeLink\(\{ urls \}\)[\s\S]*community-launch-knowledge-link-composer[\s\S]*effectiveKnowledgeLinkSources[\s\S]*handleRemoveSavedKnowledgeSource/,
  "launch knowledge link entries must trim source URLs, write through the local link action, and show saved links under Links",
);
assert.match(
  setupModal,
  /(?=[\s\S]*onAddKnowledgeFile)(?=[\s\S]*saveKnowledgeFiles[\s\S]*await onAddKnowledgeFile)(?=[\s\S]*handleKnowledgeFileDrop[\s\S]*saveKnowledgeFiles)(?=[\s\S]*community-launch-knowledge-dropzone)(?=[\s\S]*effectiveKnowledgeFileSources)/,
  "launch knowledge file uploads must write immediately and show saved files under Sources",
);
assert.match(
  appShell,
  /handleAddCommunityLaunchKnowledgeFile[\s\S]*uploadCloudCommunityResourceSourceFile[\s\S]*type: "file"[\s\S]*resource_role: "source"[\s\S]*resource_status: "review"[\s\S]*source_ingestion_status: "queued"[\s\S]*source_ingestion_kind: "file"/,
  "launch knowledge files must create canonical reviewed source resources queued for file ingestion",
);
assert.match(
  appShell,
  /handleAddCommunityLaunchKnowledgeLink[\s\S]*urls: string\[\][\s\S]*rawUrls\.length > 5[\s\S]*saveCloudCommunityResource[\s\S]*type: "link"[\s\S]*resource_role: "source"[\s\S]*resource_status: "review"[\s\S]*source_ingestion_status: "queued"[\s\S]*source_ingestion_kind: "url"[\s\S]*loadCommunityLaunchKnowledgeSources\(community\.id, session\)/,
  "launch knowledge links must create canonical reviewed source resources queued for ingestion and refresh focused saved link rows",
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
  /knowledgeGitHubImportedRepoCounts[\s\S]*community-launch-knowledge-github-repo-list[\s\S]*community-launch-knowledge-github-repo-item[\s\S]*community-launch-knowledge-github-repo[\s\S]*has-imported-sources[\s\S]*aria-pressed[\s\S]*Public[\s\S]*default_branch[\s\S]*importedSourceCount[\s\S]*imported[\s\S]*community-launch-knowledge-github-file-panel[\s\S]*community-launch-knowledge-github-file-truth[\s\S]*knowledgeGitHubFilesTruncated[\s\S]*\$\{knowledgeGitHubFileLimit\}-file selector limit[\s\S]*community-launch-knowledge-github-file-list[\s\S]*handleSelectAllGitHubFiles[\s\S]*Select all[\s\S]*handleImportGitHubFiles[\s\S]*Import selected[\s\S]*Close/,
  "launch knowledge GitHub repo picker must render files inline under the selected repo, disclose file-list limits, support local import, and keep one close control",
);
assert.match(
  baseCss,
  /\.community-launch-knowledge-github-repo-list[\s\S]*\.community-launch-knowledge-github-repo-item[\s\S]*\.community-launch-knowledge-github-repo\.is-selected[\s\S]*\.community-launch-knowledge-github-repo\.has-imported-sources:not\(\.is-selected\)[\s\S]*\.community-launch-knowledge-github-file-panel[\s\S]*\.community-launch-knowledge-github-file-truth[\s\S]*\.community-launch-knowledge-github-file-list[\s\S]*max-height: 216px[\s\S]*overflow-y: auto/,
  "launch knowledge GitHub repo picker must have dedicated row styling, imported-source highlighting, truth copy, and an inline scrollable selected-repo file list",
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
assert.doesNotMatch(
  setupModal + appShell + baseCss,
  /Choose workflow path|Import from existing harness|onStartWorkflowImport|community-launch-workflow-option|community-launch-harness-selector/,
  "community launch onboarding must not expose the retired workflow import path",
);
assert.doesNotMatch(
  setupModal + baseCss,
  /Build in PolyNet[\s\S]*onOpenStep\("workflows"\)|community-launch-workflow-option|community-launch-harness-selector|Back to workflow path options/,
  "community launch onboarding must not retain workflow import UI hooks or styles",
);
assert.match(
  baseCss,
  /\.community-launch-choice \{[\s\S]*background: linear-gradient\([\s\S]*180deg,[\s\S]*rgba\(255, 255, 255, 0\.072\),[\s\S]*rgba\(255, 255, 255, 0\.044\)[\s\S]*\)/,
  "launch access selector cards must use a visibly raised neutral button surface",
);
assert.match(
  workspaceLandingProjection,
  /WebCommunityLaunchSetupCard/,
  "workspace landing must be able to render the community launch setup card",
);

console.log("PASS: community launch setup contract is canonical.");
