import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import {
  buildCommunityLaunchSetupStatus,
  COMMUNITY_LAUNCH_SETUP_STEPS,
} from "../shared/communityLaunchSetup.ts";
import { buildCommunityWorkflowImportFunctionTools } from "../shared/communityWorkflowImportToolProtocol.ts";
import {
  COMMUNITY_WORKFLOW_EXPORT_PACKAGE_SENTINEL,
  parseCommunityWorkflowExportPackage,
} from "../shared/communityWorkflowExportPackage.ts";
import { resolveCommunityWorkflowImportMcpCatalogMatch } from "../shared/communityWorkflowImportCatalogResolver.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function assertToolSchemaRequiresEveryProperty(value: unknown, label: string) {
  assert.equal(
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
    true,
    `${label} must use an object schema`,
  );
  const schema = value as Record<string, unknown>;
  assert.equal(schema.type, "object", `${label} schema must be an object`);
  assert.equal(schema.additionalProperties, false, `${label} must reject extra top-level args`);
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : null;
  assert.ok(properties, `${label} must define properties`);
  const required = Array.isArray(schema.required)
    ? schema.required.map((entry) => String(entry ?? ""))
    : [];
  assert.deepEqual(
    required.sort(),
    Object.keys(properties).sort(),
    `${label} must mark every top-level property required for ChatGPT Responses strict schema validation`,
  );
}

const launchSetup = read("shared/communityLaunchSetup.ts");
const launchGateway = read("shared/cloudCommunityLaunchSetupGateway.ts");
const convexSchema = read("convex/schema.ts");
const launchQuery = read("convex/communityLaunchSetup.ts");
const communityBarrel = read("convex/community.ts");
const workflowImports = read("convex/communityWorkflowImports.ts");
const workflowImportTools = read("shared/communityWorkflowImportToolProtocol.ts");
const workflowImportPrompt = read("shared/communityWorkflowImportPrompt.ts");
const workflowImportHarnessProfiles = read("shared/communityWorkflowImportHarnessProfiles.ts");
const workflowExportPackage = read("shared/communityWorkflowExportPackage.ts");
const workflowImportCandidateIds = read("shared/communityWorkflowImportCandidateIds.ts");
const workflowImportCatalogResolver = read("shared/communityWorkflowImportCatalogResolver.ts");
const workflowImportRepositoryIdentity = read("shared/communityWorkflowImportRepositoryIdentity.ts");
const workflowImportReviewProjection = read("shared/communityWorkflowImportReviewProjection.ts");
const discoverCatalog = read("shared/discoverCatalog.ts");
const effectiveSkills = read("shared/effectiveSkills.ts");
const cloudEffectiveSkillGateway = read("shared/cloudEffectiveSkillGateway.ts");
const harnessSkills = read("convex/harnessSkills.ts");
const setupCard = read("apps/web/src/components/WebCommunityLaunchSetupCard.tsx");
const setupModal = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const integrationsSettingsSection = read("apps/web/src/components/WebIntegrationsSettingsSection.tsx");
const harnessImportSources = read("apps/web/src/lib/communityHarnessImportSources.ts");
const baseCss = read("apps/web/src/base.css");
const appShell = read("apps/web/src/App.tsx");
const shellChromeHostProps = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const mobileShellController = read("apps/web/src/controllers/useWebMobileShellController.ts");
const workspaceLandingProjection = read(
  "apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx",
);

function buildWorkflowExportZip(
  files: Record<string, string>,
): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, value]) => [path, strToU8(value)]),
    ),
  );
}

const validWorkflowExportPackage = await parseCommunityWorkflowExportPackage(
  buildWorkflowExportZip({
    "manifest.json": JSON.stringify({
      schemaVersion: "polynet_workflow_export_v1",
      sourceHarness: "Codex",
      summary: { name: "Operator workflow", purpose: "Import test" },
      scanSummary: {
        searchedLocations: [".codex"],
        skillSearchLocations: ["skills"],
        skillLikeItemsSeen: 1,
        selectedSkillCandidates: 1,
        completenessConfidence: "high",
      },
    }),
    "mcp/servers.json": JSON.stringify({
      mcpServers: [
        {
          name: "GitHub",
          catalog_app_id: "github",
          purpose: "Repository work",
          auth_type: "oauth",
          confidence: "high",
        },
      ],
    }),
    "skills/frontend-skill/SKILL.md":
      "# Frontend Skill\n\nUse this complete standalone behavior to review and improve frontend work in PolyNet communities.",
    "skills/frontend-skill/metadata.json": JSON.stringify({
      name: "Frontend Skill",
      purpose: "Reusable frontend behavior.",
      recommendedHandling: "import_as_skill",
    }),
    "markdown/decisions.json": JSON.stringify({ markdownFiles: [] }),
    "repository.json": JSON.stringify({
      present: "yes",
      host: "github",
      owner: "polynet",
      repo: "workflow",
      fullName: "polynet/workflow",
      visibility: "public",
      recommendedNextStep: "connect_public_github",
    }),
    "evidence.json": JSON.stringify([{ source: "skills/frontend-skill/SKILL.md" }]),
  }),
  {
    communityId: "community_123",
    builderUserId: "user_123",
    sourceHarness: "Codex",
    sourceFilename: "polynet-workflow-export.zip",
  },
);
assert.equal(validWorkflowExportPackage.summary.skill_count, 1);
assert.equal(validWorkflowExportPackage.summary.mcp_count, 1);
assert.equal(
  (validWorkflowExportPackage.ledger.skills as Array<Record<string, unknown>>)[0]
    ?.proposedInstructionsMd,
  "# Frontend Skill\n\nUse this complete standalone behavior to review and improve frontend work in PolyNet communities.",
);
const inferredSupabaseCatalogMatch = resolveCommunityWorkflowImportMcpCatalogMatch({
  name: "Supabase",
  record: {
    name: "supabase",
    providerName: "Supabase",
    packageName: "@supabase/mcp-server-supabase",
    command: "npx",
  },
});
assert.deepEqual(
  {
    catalogAppId: inferredSupabaseCatalogMatch.catalogAppId,
    endpointUrl: inferredSupabaseCatalogMatch.endpointUrl,
    authType: inferredSupabaseCatalogMatch.authType,
    connectable: inferredSupabaseCatalogMatch.connectable,
  },
  {
    catalogAppId: "supabase",
    endpointUrl: "https://mcp.supabase.com/mcp",
    authType: "bearer",
    connectable: true,
  },
  "workflow import catalog resolver must make vetted Supabase candidates mountable without explicit ledger catalog ids",
);
const inferredGitHubCatalogMatch = resolveCommunityWorkflowImportMcpCatalogMatch({
  name: "Imported MCP",
  record: {
    endpoint_url: "https://api.githubcopilot.com/mcp/readonly",
  },
});
assert.deepEqual(
  {
    catalogAppId: inferredGitHubCatalogMatch.catalogAppId,
    endpointUrl: inferredGitHubCatalogMatch.endpointUrl,
    authType: inferredGitHubCatalogMatch.authType,
    connectable: inferredGitHubCatalogMatch.connectable,
  },
  {
    catalogAppId: "github",
    endpointUrl: "https://api.githubcopilot.com/mcp/readonly",
    authType: "bearer",
    connectable: true,
  },
  "workflow import catalog resolver must match GitHub only through exact known endpoint hosts or aliases",
);
const inferredVercelCatalogMatch = resolveCommunityWorkflowImportMcpCatalogMatch({
  name: "Vercel",
  record: {
    endpoint_url: "https://mcp.vercel.com",
  },
});
assert.equal(
  inferredVercelCatalogMatch.catalogAppId,
  "vercel",
  "workflow import catalog resolver must recognize Vercel catalog identity",
);
assert.equal(
  inferredVercelCatalogMatch.connectable,
  false,
  "workflow import catalog resolver must keep recognized catalog apps manual until the catalog connection profile is ready",
);
const fakeGitHubProxyCatalogMatch = resolveCommunityWorkflowImportMcpCatalogMatch({
  name: "Imported proxy",
  record: {
    endpoint_url: "https://example.com/github-proxy",
    sourceUrl: "https://github.com/modelcontextprotocol/server-github",
  },
});
assert.equal(
  fakeGitHubProxyCatalogMatch.catalogAppId,
  null,
  "workflow import catalog resolver must not use fuzzy URL substrings as catalog authority",
);
assert.equal(
  fakeGitHubProxyCatalogMatch.connectable,
  false,
  "workflow import catalog resolver must leave fake GitHub-looking endpoints manual",
);
const localContext7CatalogMatch = resolveCommunityWorkflowImportMcpCatalogMatch({
  name: "Context7",
  record: {
    name: "context7",
    packageName: "@upstash/context7-mcp",
    command: "npx",
  },
});
assert.equal(
  localContext7CatalogMatch.connectable,
  false,
  "workflow import catalog resolver must keep non-catalog local MCP candidates out of automatic mounting",
);
assert.equal(
  localContext7CatalogMatch.reviewLogoUrl,
  "/app-logos/context7.svg",
  "workflow import catalog resolver may provide review-only logos without making a candidate connectable",
);
const localFlyCatalogMatch = resolveCommunityWorkflowImportMcpCatalogMatch({
  name: "flyctl",
  record: {
    command: "flyctl mcp start",
  },
});
assert.equal(
  localFlyCatalogMatch.catalogAppId,
  null,
  "workflow import catalog resolver must not auto-connect Fly from local CLI shape",
);
assert.equal(
  localFlyCatalogMatch.reviewLogoUrl,
  "/app-logos/fly-light.svg",
  "workflow import catalog resolver may provide Fly review-only logos while keeping it manual",
);

const rankedSkillFiles: Record<string, string> = {
  "manifest.json": JSON.stringify({
    schemaVersion: "polynet_workflow_export_v1",
    sourceHarness: "Codex",
    summary: { name: "Ranked Codex skill surface", purpose: "Import the most relevant actual skills" },
    scanSummary: {
      searchedLocations: ["~/.codex/skills", "~/.codex/plugins/cache"],
      skillSearchLocations: ["~/.codex/skills/**/SKILL.md", "~/.codex/plugins/cache/**/skills/**/SKILL.md"],
      skillLikeItemsSeen: 85,
      selectedSkillCandidates: 30,
      packagedSkillLimit: 30,
      skippedSkillCandidates: [{ reason: "package_skill_cutoff", count: 55 }],
      completenessConfidence: "high",
    },
  }),
};
for (let index = 0; index < 30; index += 1) {
  const slug = `codex-skill-${index + 1}`;
  rankedSkillFiles[`skills/${slug}/SKILL.md`] =
    `# Codex Skill ${index + 1}\n\nUse this actual readable harness skill file as a review candidate for PolyNet workflow import.`;
  rankedSkillFiles[`skills/${slug}/metadata.json`] = JSON.stringify({
    name: `Codex Skill ${index + 1}`,
    originKind: index < 2 ? "existing_skill_file" : "plugin_skill",
    sourcePath: index < 2
      ? `/Users/neilmcdevitt/.codex/skills/${slug}/SKILL.md`
      : `/Users/neilmcdevitt/.codex/plugins/cache/plugin/skills/${slug}/SKILL.md`,
    bodyExtraction: "copied_exact",
    isActualHarnessSkill: true,
    shouldDefaultImport: index < 2,
    importRisk: index < 2 ? "low" : "medium",
  });
}
const rankedWorkflowExportPackage = await parseCommunityWorkflowExportPackage(
  buildWorkflowExportZip(rankedSkillFiles),
  {
    communityId: "community_123",
    builderUserId: "user_123",
    sourceHarness: "Codex",
    sourceFilename: "polynet-workflow-export.zip",
  },
);
assert.equal(rankedWorkflowExportPackage.summary.skill_count, 30);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        ...rankedSkillFiles,
        "skills/extra/SKILL.md":
          "# Extra Skill\n\nThis extra actual skill should exceed the first-version PolyNet workflow import package cap.",
        "skills/extra/metadata.json": JSON.stringify({
          name: "Extra Skill",
          originKind: "plugin_skill",
          sourcePath: "/Users/neilmcdevitt/.codex/plugins/cache/plugin/skills/extra/SKILL.md",
          bodyExtraction: "copied_exact",
          isActualHarnessSkill: true,
          shouldDefaultImport: false,
        }),
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_too_many_skills/,
);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        "manifest.json": JSON.stringify({ schemaVersion: "polynet_workflow_export_v1" }),
        "../evil.txt": "bad",
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_relative_path_rejected|workflow_export_unexpected_path/,
);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        "manifest.json": JSON.stringify({ schemaVersion: "polynet_workflow_export_v1" }),
        ".env": "SECRET=value",
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_junk_path_rejected|workflow_export_unexpected_path/,
);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        "manifest.json": JSON.stringify({ schemaVersion: "polynet_workflow_export_v1" }),
        "checksums.json": JSON.stringify({
          sha256: {
            "manifest.json": "0000000000000000000000000000000000000000000000000000000000000000",
          },
        }),
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_checksum_mismatch:manifest\.json/,
);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        "manifest.json": JSON.stringify({ sourceHarness: "Codex" }),
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_schema_version_required/,
);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        "manifest.json": JSON.stringify({ schemaVersion: "polynet_workflow_export_v1" }),
        "mcp/servers.json": JSON.stringify({
          mcpServers: Array.from({ length: 101 }, (_, index) => ({
            name: `MCP ${index + 1}`,
          })),
        }),
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_too_many_mcp_servers/,
);
const oversizedWorkflowExportPackage = await parseCommunityWorkflowExportPackage(
  buildWorkflowExportZip({
    "manifest.json": JSON.stringify({ schemaVersion: "polynet_workflow_export_v1" }),
    "skills/big/SKILL.md": "A".repeat(41_000),
    "skills/big/metadata.json": JSON.stringify({ name: "Big Skill" }),
  }),
  { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
);
assert.equal(oversizedWorkflowExportPackage.summary.oversized_skill_count, 1);
assert.equal(
  (oversizedWorkflowExportPackage.ledger.skills as Array<Record<string, unknown>>)[0]
    ?.proposedInstructionsMd,
  undefined,
);
assert.equal(
  (oversizedWorkflowExportPackage.ledger.skills as Array<Record<string, unknown>>)[0]
    ?.bodyTooLarge,
  true,
);
await assert.rejects(
  () =>
    parseCommunityWorkflowExportPackage(
      buildWorkflowExportZip({
        "manifest.json": JSON.stringify({ schemaVersion: "polynet_workflow_export_v1" }),
        "skills/huge/SKILL.md": "A".repeat(121_000),
      }),
      { communityId: "community_123", builderUserId: "user_123", sourceHarness: "Codex" },
    ),
  /workflow_export_skill_file_too_large:huge/,
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
  /Import from existing harness[\s\S]*MCP servers[\s\S]*skills[\s\S]*prompts[\s\S]*repo context[\s\S]*current agent harness/,
  "launch workflow import path must frame harness import as MCPs, skills, prompts, and repo context without overcrowding the card",
);
assert.match(
  setupModal,
  /community-launch-harness-logo-row[\s\S]*Supported harnesses: Claude, Codex, OpenClaw, Hermes[\s\S]*slice\(0, 4\)/,
  "launch workflow choice card must preview only the original four primary harnesses before the import selector opens",
);
assert.match(
  harnessImportSources,
  /label: "Claude"[\s\S]*logoUrl: "\/harness-logos\/claude\.svg"[\s\S]*label: "Codex"[\s\S]*logoUrl: "\/harness-logos\/codex\.png"[\s\S]*label: "OpenClaw"[\s\S]*logoUrl: "\/harness-logos\/openclaw\.svg"[\s\S]*label: "Hermes"[\s\S]*logoUrl: "\/harness-logos\/hermes\.svg"[\s\S]*label: "Cursor"[\s\S]*logoUrl: "\/harness-logos\/cursor\.png"[\s\S]*label: "Gemini CLI"[\s\S]*logoUrl: "\/harness-logos\/gemini-cli\.svg"[\s\S]*label: "Antigravity"[\s\S]*logoUrl: "\/harness-logos\/antigravity\.svg"[\s\S]*id: "other"[\s\S]*label: "Other"/,
  "launch workflow import path must use seven named harnesses plus Other in the final selector slot",
);
assert.doesNotMatch(
  harnessImportSources,
  /OpenCode|opencode/,
  "launch workflow import path must not keep OpenCode as a default source",
);
assert.doesNotMatch(
  harnessImportSources,
  /Clawd|clawd/,
  "launch workflow import path must not keep the incorrect Clawd source",
);
assert.match(
  setupModal,
  /communityHarnessImportSources\.map[\s\S]*source\.logoUrl \?[\s\S]*<img src=\{source\.logoUrl\} alt="" loading="lazy" \/>[\s\S]*community-launch-harness-logo-fallback/,
  "launch workflow import path must render real harness logo images while supporting the Other fallback tile",
);
assert.match(
  setupModal,
  /selectedHarnessImportSource\.id === "other"[\s\S]*Harness name[\s\S]*Name the harness you use/,
  "launch workflow Other selector must expose a harness name field",
);
assert.match(
  setupModal,
  /Select a harness to import from[\s\S]*communityHarnessImportSources\.map/,
  "launch workflow import path must open an in-card harness selector before the export prompt",
);
assert.match(
  setupModal,
  /Follow the instructions/,
  "launch workflow import path must use an in-card instructions step after source selection",
);
assert.match(
  setupModal,
  /setWorkflowPathDraft\("import"\)[\s\S]*setWorkflowImportStage\("harness"\)[\s\S]*Import from existing harness/,
  "launch workflow import card must transition directly into the harness selector",
);
assert.match(
  setupModal,
  /setSelectedHarnessImportSourceId\(source\.id\)[\s\S]*setWorkflowImportStage\("prompt"\)/,
  "launch workflow harness selector must advance directly into the prompt step when a source is selected",
);
assert.doesNotMatch(
  setupModal,
  /Export prompt next/,
  "launch workflow harness selector must not require a separate disabled export-prompt button",
);
assert.match(
  workflowImportPrompt,
  /buildCommunityWorkflowImportPrompt[\s\S]*read-only workflow audit[\s\S]*polynet-workflow-export\.zip[\s\S]*mcp\/servers\.json[\s\S]*skills\/<slug>\/SKILL\.md[\s\S]*markdown\/decisions\.json[\s\S]*repository\.json/,
  "launch workflow import prompt must ask for a focused workflow export zip with MCP, skill, markdown, and repository inventory",
);
assert.match(
  workflowImportPrompt,
  /getCommunityWorkflowImportHarnessProfile[\s\S]*Actual skill files first:[\s\S]*originKind[\s\S]*bodyExtraction[\s\S]*isActualHarnessSkill[\s\S]*shouldDefaultImport/,
  "launch workflow import prompt must be driven by source-specific harness profiles and preserve skill provenance fields",
);
assert.match(
  workflowImportPrompt,
  /act like the source-harness operator[\s\S]*starting map[\s\S]*If this harness stores skills[\s\S]*somewhere else, discover those locations/,
  "launch workflow import prompt must recruit the source harness as an intelligent scanner instead of treating profile paths as exhaustive",
);
assert.match(
  workflowImportPrompt,
  /Do whatever safe read-only inspection is needed[\s\S]*plugin manifests[\s\S]*package\/plugin cache folders[\s\S]*Do not exclude plugin\/cache\/system skills solely because they are not user-owned/,
  "launch workflow import prompt must tell the source harness to find and package real plugin/cache/system skill files for review",
);
assert.match(
  workflowImportPrompt,
  /Skill ranking and cutoff:[\s\S]*Package the top 20 actual skills[\s\S]*up to 30 actual skills[\s\S]*Do not package a skill merely because it exists[\s\S]*package_skill_cutoff/,
  "launch workflow import prompt must rank discovered actual skills and cap the first package at 20 to 30 high-signal skills",
);
assert.match(
  workflowImportPrompt,
  /Do not write derived or rewritten Markdown into skills\/<slug>\/SKILL\.md[\s\S]*skills folder is for complete actual harness skill files only/,
  "launch workflow import prompt must keep markdown-derived behavior out of packaged skill files",
);
assert.match(
  workflowExportPackage,
  /maxFiles: 100[\s\S]*maxSkills: 30/,
  "launch workflow export parser must enforce the first-version 30-skill package cap",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "claude"[\s\S]*\.claude\/skills\/\*\*\/SKILL\.md[\s\S]*\.mcp\.json[\s\S]*CLAUDE\.md/,
  "launch workflow Claude import profile must probe Claude skill, MCP, and instruction locations",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "codex"[\s\S]*~\/\.codex\/config\.toml mcp_servers[\s\S]*~\/\.codex\/skills\/\*\*\/SKILL\.md[\s\S]*AGENTS\.md/,
  "launch workflow Codex import profile must probe Codex MCP, skill, and AGENTS locations",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "openclaw"[\s\S]*~\/\.openclaw\/skills\/\*\*\/SKILL\.md[\s\S]*openclaw mcp list[\s\S]*openclaw skills list/,
  "launch workflow OpenClaw import profile must probe OpenClaw MCP and skill surfaces",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "hermes"[\s\S]*~\/\.hermes\/skills\/\*\*\/SKILL\.md[\s\S]*hermes skills list[\s\S]*hermes mcp list/,
  "launch workflow Hermes import profile must probe Hermes MCP and skill surfaces conservatively",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "cursor"[\s\S]*\.cursor\/mcp\.json[\s\S]*\.cursor\/rules\/\*\.mdc[\s\S]*\.cursor\/commands\/\*\*\/\*\.md/,
  "launch workflow Cursor import profile must probe Cursor MCP, rules, and commands",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "gemini-cli"[\s\S]*\.gemini\/settings\.json mcpServers[\s\S]*GEMINI\.md[\s\S]*\.gemini\/commands\/\*\*\/\*\.toml/,
  "launch workflow Gemini CLI import profile must probe Gemini memory, MCP, and command files",
);
assert.match(
  workflowImportHarnessProfiles,
  /id: "antigravity"[\s\S]*mcp_config\.json[\s\S]*~\/\.gemini\/antigravity-cli\/plugins\/\*\/skills\/\*\*\/SKILL\.md/,
  "launch workflow Antigravity import profile must probe plugin skill and MCP bundle paths",
);
assert.match(
  workflowImportPrompt,
  /Research pass:[\s\S]*web\/search\/docs tools[\s\S]*official docs[\s\S]*package registry pages[\s\S]*public GitHub repositories[\s\S]*scanSummary\.importantOmissions/,
  "launch workflow import prompt must ask the source harness to gather docs/package/source evidence when available",
);
assert.match(
  workflowImportPrompt,
  /mcp\/servers\.json[\s\S]*docsUrl[\s\S]*packageUrl[\s\S]*sourceUrl[\s\S]*publiclyVerifiable[\s\S]*configExampleFound[\s\S]*polynetAction[\s\S]*evidenceUrls/,
  "launch workflow import prompt must return integration readiness and source URL fields for downstream classification",
);
assert.match(
  workflowImportPrompt,
  /providerName[\s\S]*officialName[\s\S]*logoUrl[\s\S]*skillSearchLocations[\s\S]*skillLikeItemsSeen[\s\S]*complete standalone Markdown body[\s\S]*owner[\s\S]*repo[\s\S]*fullName[\s\S]*defaultBranch/,
  "launch workflow import prompt must request MCP identity, skill completeness, and GitHub repository identity fields",
);
assert.match(
  workflowImportPrompt,
  /buildCommunityWorkflowImportPrompt[\s\S]*Do not include API keys, tokens, passwords, private keys, credential values, or secret values/,
  "launch workflow import prompt must protect secret values",
);
assert.match(
  workflowImportPrompt,
  /Important Markdown decision rule:[\s\S]*stand alone as reusable agent behavior[\s\S]*dependsOnRepoContext[\s\S]*recommendedHandling/,
  "launch workflow import prompt must classify repo-bound markdown separately from standalone skill candidates",
);
assert.match(
  workflowImportPrompt,
  /Repository judgment guidance:[\s\S]*publicSharingRecommendation[\s\S]*keep_private_import_mcp_and_skills_only/,
  "launch workflow import prompt must judge GitHub sharing versus private MCP and skill import",
);
assert.doesNotMatch(
  setupModal,
  /function buildHarnessImportPrompt|function buildCommunityLaunchWorkflowReviewProjection|DISCOVER_APP_CATALOG/,
  "launch modal must not own workflow import prompt, projection, or catalog-logo matching logic",
);
assert.match(
  setupModal,
  /copyTextToClipboard\(harnessImportPrompt\)[\s\S]*Copy prompt[\s\S]*Drop polynet-workflow-export\.zip[\s\S]*Fallback pasted output/,
  "launch workflow prompt step must provide copyable instructions, preferred zip upload, and paste fallback",
);
assert.match(
  convexSchema,
  /communityWorkflowImportDrafts: defineTable\([\s\S]*communityId: v\.id\("communities"\)[\s\S]*builderUserId: v\.id\("users"\)[\s\S]*sourceHarness: v\.string\(\)[\s\S]*sourceKind[\s\S]*workflow_export_zip[\s\S]*status: v\.union\([\s\S]*working[\s\S]*ready_for_review[\s\S]*applied[\s\S]*failed[\s\S]*rawHarnessOutput: v\.string\(\)[\s\S]*currentLedgerJson[\s\S]*packageSha256/,
  "workflow import must have a dedicated community-scoped draft ledger table",
);
assert.match(
  convexSchema,
  /communityWorkflowImportEvents: defineTable\([\s\S]*draftId: v\.id\("communityWorkflowImportDrafts"\)[\s\S]*seq: v\.number\(\)[\s\S]*eventType: v\.string\(\)[\s\S]*payload: v\.any\(\)[\s\S]*\.index\("by_draft_seq", \["draftId", "seq"\]\)/,
  "workflow import must have a sequenced event ledger keyed by import draft",
);
assert.match(
  workflowImports,
  /normalizeHarnessOutput[\s\S]*redactLikelySecretValues/,
  "workflow import harness output must be bounded and secret-redacted",
);
assert.match(
  workflowImports,
  /sanitizeWorkflowImportJsonArtifact[\s\S]*redactLikelySecretValues[\s\S]*WORKFLOW_IMPORT_LEDGER_MAX_JSON_CHARS/,
  "workflow import ledger artifacts must be recursively redacted and bounded before becoming review data",
);
assert.match(
  workflowImports,
  /createCommunityWorkflowImportDraft[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityManager[\s\S]*normalizeHarnessOutput/,
  "workflow import draft creation must be authenticated and manager-gated",
);
assert.match(
  workflowImports,
  /generateCommunityWorkflowImportPackageUploadUrl[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityManager[\s\S]*ctx\.storage\.generateUploadUrl/,
  "workflow import package upload URL creation must be authenticated and manager-gated",
);
assert.match(
  workflowImports,
  /createCommunityWorkflowImportDraftFromPackage = action[\s\S]*assertCommunityManagerAccessInternal[\s\S]*ctx\.storage\.get[\s\S]*parseCommunityWorkflowExportPackage[\s\S]*ctx\.storage\.delete/,
  "workflow import package action must parse uploaded zips without Daytona and delete temporary storage",
);
assert.match(
  workflowExportPackage,
  /maxZipBytes[\s\S]*maxFiles[\s\S]*maxSkillBodyChars[\s\S]*readAllowedPathKind[\s\S]*manifest\.json[\s\S]*mcp\/servers\.json[\s\S]*skillBody/,
  "workflow export package parser must enforce tight limits and a narrow allowed path contract",
);
assert.match(
  workflowExportPackage,
  /validateWorkflowExportZipDirectory\(bytes\)[\s\S]*unzipSync\(bytes\)/,
  "workflow export package parser must validate zip paths and uncompressed sizes before inflating entries",
);
assert.match(
  workflowExportPackage,
  /normalizePath[\s\S]*absolute_path_rejected[\s\S]*relative_path_rejected[\s\S]*junk_path_rejected[\s\S]*isLikelyBinary/,
  "workflow export package parser must reject path traversal, junk paths, and binary files",
);
assert.match(
  workflowExportPackage,
  /sha256Hex[\s\S]*readChecksumMap[\s\S]*workflow_export_checksum_mismatch/,
  "workflow export package parser must validate package checksums when provided",
);
assert.match(
  workflowImports,
  /eventType: "draft_created"[\s\S]*eventType: "harness_output_received"[\s\S]*eventType: "agent_contract_prepared"/,
  "workflow import creation must write the initial draft and prepared-contract event trace",
);
assert.match(
  workflowImports,
  /ctx\.scheduler\.runAfter\([\s\S]*runCommunityWorkflowImportAnalysisInternal[\s\S]*eventType: "analysis_scheduled"/,
  "workflow import draft creation must schedule the internal import analysis loop",
);
assert.doesNotMatch(
  workflowImports,
  /eventType: "agent_started"/,
  "workflow import draft creation must not claim that the agent has started before the agent loop runs",
);
assert.match(
  workflowImports,
  /readCommunityWorkflowImportContextInternal[\s\S]*raw_harness_output: draft\.rawHarnessOutput/,
  "raw harness output must be available only through the internal import-agent context path",
);
assert.doesNotMatch(
  launchGateway,
  /raw_harness_output/,
  "web-facing launch gateway draft summaries must not expose raw harness output",
);
assert.match(
  workflowImports,
  /writeCommunityWorkflowImportLedgerInternal[\s\S]*v\.literal\("working"\)[\s\S]*v\.literal\("ready_for_review"\)[\s\S]*v\.literal\("failed"\)[\s\S]*writeWorkflowImportLedgerPatch/,
  "workflow import ledger writes must be internal to the import agent loop",
);
assert.doesNotMatch(
  workflowImports,
  /export const writeCommunityWorkflowImportLedger = mutation/,
  "workflow import must not expose a public manager-writable ledger mutation",
);
assert.doesNotMatch(
  communityBarrel,
  /writeCommunityWorkflowImportLedger/,
  "community barrel must not expose the workflow import ledger write path",
);
assert.match(
  workflowImports,
  /WORKFLOW_IMPORT_RAW_HARNESS_OUTPUT_PURGED[\s\S]*status !== "working"[\s\S]*patch\.rawHarnessOutput = WORKFLOW_IMPORT_RAW_HARNESS_OUTPUT_PURGED[\s\S]*eventType: "harness_output_purged"/,
  "workflow import must purge raw pasted harness output when a draft leaves the working state",
);
assert.match(
  workflowImports,
  /payload: sanitizeWorkflowImportJsonArtifact[\s\S]*patch\.currentLedgerJson = sanitizeWorkflowImportJsonArtifact/,
  "workflow import ledger and event writes must sanitize model-written JSON before storage",
);
assert.match(
  workflowImports,
  /runCommunityWorkflowImportAnalysisInternal[\s\S]*if \(context\.status !== "working"\)[\s\S]*stop_reason: "draft_not_working"/,
  "workflow import analysis must not reopen drafts that already left the working state",
);
assert.match(
  workflowImports,
  /const WORKFLOW_IMPORT_MAX_TOOL_STEPS = 48/,
  "workflow import analysis must allow enough bounded tool steps for real harness inventories",
);
assert.match(
  workflowImports,
  /draft\.status !== "working"[\s\S]*status === "working"[\s\S]*status === "ready_for_review"[\s\S]*workflow_import_terminal_draft_requires_retry/,
  "workflow import ledger writes must not reopen terminal drafts without a dedicated retry path",
);
assert.match(
  workflowImportTools,
  /CommunityWorkflowImportToolName[\s\S]*"read_import_context"[\s\S]*"search_import_candidates"[\s\S]*"write_import_ledger"[\s\S]*"finish_import_analysis"/,
  "workflow import analysis agent must expose exactly the simple read, search, write, and finish tool surface",
);
for (const tool of buildCommunityWorkflowImportFunctionTools()) {
  assertToolSchemaRequiresEveryProperty(tool.parameters, `workflow import tool ${tool.name}`);
}
assert.match(
  workflowImports,
  /runCommunityWorkflowImportAnalysisInternal = internalAction[\s\S]*runNativeRuntimeKernel<CommunityWorkflowImportToolName>[\s\S]*runChatgptNativeToolCompletion[\s\S]*buildCommunityWorkflowImportFunctionTools/,
  "workflow import analysis must run through the platform runtime kernel with native tool calling",
);
assert.match(
  workflowImports,
  /executeWorkflowImportTool[\s\S]*read_import_context[\s\S]*search_import_candidates[\s\S]*write_import_ledger[\s\S]*finish_import_analysis/,
  "workflow import analysis loop must implement all four import tools",
);
assert.match(
  workflowImports,
  /writeCommunityWorkflowImportLedgerInternal = internalMutation[\s\S]*writeWorkflowImportLedgerPatch/,
  "workflow import agent must write the ledger through an internal mutation instead of exposing raw context to the web",
);
assert.match(
  workflowImports,
  /requireSelectedWorkflowImportApplyPlanItems[\s\S]*selectedItemIds[\s\S]*buildWorkflowImportApplyPlan[\s\S]*workflow_import_selection_invalid[\s\S]*applyCommunityWorkflowImportReview = action\([\s\S]*selectedItemIds: v\.array\(v\.string\(\)\)[\s\S]*requireSelectedWorkflowImportApplyPlanItems/,
  "workflow import apply must accept selected review item ids but rederive authority through a server-side apply plan",
);
assert.match(
  workflowImports,
  /applyCommunityWorkflowImportReview = action\([\s\S]*context\.status !== "ready_for_review"[\s\S]*workflow_import_not_ready_for_review/,
  "workflow import apply must only run after analysis reaches ready-for-review",
);
assert.match(
  workflowImports,
  /resolveCommunityWorkflowImportMcpCatalogMatch[\s\S]*buildWorkflowImportMcpApplyPlanItems[\s\S]*catalogMatch\.connectable[\s\S]*api\.community\.connectCommunityApp[\s\S]*needs_manual_setup/,
  "workflow import apply must auto-connect vetted catalog-matched MCPs and leave unknown or non-ready MCPs for manual setup",
);
assert.match(
  workflowImportCatalogResolver,
  /DISCOVER_APP_ALIASES[\s\S]*github[\s\S]*supabase[\s\S]*resolveCommunityWorkflowImportMcpCatalogMatch[\s\S]*connectable[\s\S]*No vetted PolyNet catalog app matched/,
  "workflow import catalog resolver must centralize vetted MCP identity matching for review and apply paths",
);
assert.match(
  workflowImports,
  /applyWorkflowImportSkillPlanItem[\s\S]*needs_skill_body_review[\s\S]*findWorkflowImportSkillPackageByMentionTokenInternal[\s\S]*createSkillPackageInternal[\s\S]*upsertCommunitySkillAttachmentInternal/,
  "workflow import apply must create or attach skills only when a complete skill body exists and must reuse matching builder skills",
);
assert.match(
  workflowImports,
  /already_connected[\s\S]*already_attached[\s\S]*apply_plan[\s\S]*outcomes/,
  "workflow import apply must record item-level idempotent outcomes and the server-side apply plan",
);
assert.match(
  workflowImports,
  /markCommunityWorkflowImportAppliedInternal = internalMutation[\s\S]*status: "applied"[\s\S]*eventType: "review_applied"/,
  "workflow import apply must persist an applied review event and terminal applied status",
);
assert.doesNotMatch(
  workflowImports,
  /saveCommunityResource|createCloudCommunityResource/,
  "workflow import apply must not write resources or knowledge in this slice",
);
assert.match(
  communityBarrel,
  /createCommunityWorkflowImportDraft[\s\S]*generateCommunityWorkflowImportPackageUploadUrl[\s\S]*createCommunityWorkflowImportDraftFromPackage[\s\S]*getCommunityWorkflowImportDraft[\s\S]*listCommunityWorkflowImportEvents[\s\S]*applyCommunityWorkflowImportReview/,
  "community barrel must expose draft, package import, event, and review apply functions without exposing raw ledger writes",
);
assert.match(
  launchGateway,
  /CloudCommunityWorkflowImportDraft[\s\S]*community:createCommunityWorkflowImportDraft/,
  "web gateway must create workflow import drafts through the community backend",
);
assert.match(
  launchGateway,
  /requestCloudCommunityWorkflowImportPackageUploadUrl[\s\S]*community:generateCommunityWorkflowImportPackageUploadUrl[\s\S]*uploadCloudCommunityWorkflowImportPackage[\s\S]*community:createCommunityWorkflowImportDraftFromPackage/,
  "web gateway must upload workflow export packages through Convex storage and create package-backed drafts",
);
assert.match(
  launchGateway,
  /loadCloudCommunityWorkflowImportDraft[\s\S]*community:getCommunityWorkflowImportDraft/,
  "web gateway must be able to poll sanitized workflow import draft status",
);
assert.match(
  launchGateway,
  /applyCloudCommunityWorkflowImportReview[\s\S]*selectedItemIds[\s\S]*community:applyCommunityWorkflowImportReview/,
  "web gateway must apply workflow import review by selected ids only",
);
assert.match(
  setupModal,
  /onStartWorkflowImport[\s\S]*handleStartWorkflowImport[\s\S]*packageFile: harnessImportPackageFile[\s\S]*setWorkflowImportStage\("understanding"\)/,
  "launch workflow prompt step must hand preferred package uploads or pasted output to the backend",
);
assert.match(
  setupModal,
  /onLoadWorkflowImport[\s\S]*window\.setInterval[\s\S]*workflowImportDraftStatus/,
  "launch workflow understanding step must poll the sanitized draft status",
);
assert.match(
  setupModal + baseCss,
  /community-launch-import-agent-activity[\s\S]*community-launch-import-agent-orbit[\s\S]*community-launch-import-sweep/,
  "launch workflow understanding step must show live agent activity while analysis is running",
);
assert.match(
  setupModal,
  /type CommunityLaunchWorkflowImportStage = "path" \| "harness" \| "prompt" \| "understanding" \| "review"/,
  "launch workflow import must have a real review stage after understanding",
);
assert.match(
  setupModal,
  /importReady[\s\S]*setWorkflowImportStage\("review"\)[\s\S]*Review integrations/,
  "launch workflow ready state must advance into the real review screen",
);
assert.doesNotMatch(
  setupModal,
  /Review import next/,
  "launch workflow ready state must not render a fake disabled review action",
);
assert.match(
  workflowImportReviewProjection,
  /buildCommunityWorkflowImportReviewProjection[\s\S]*mcp_servers[\s\S]*mcpServers[\s\S]*markdown_files[\s\S]*markdownFiles[\s\S]*repository/,
  "launch workflow review must project the saved ledger across snake_case and camelCase provider output",
);
assert.match(
  workflowImportReviewProjection,
  /skillScan[\s\S]*skillLikeItemsSeen[\s\S]*selectedSkillCandidates[\s\S]*completenessConfidence[\s\S]*importantOmissions/,
  "launch workflow review projection must preserve skill scan completeness signals from the import ledger",
);
assert.match(
  workflowImportReviewProjection,
  /catalogAppId[\s\S]*endpointUrl[\s\S]*authType[\s\S]*instructionsMd/,
  "launch workflow review projection must expose server-usable MCP and skill apply metadata from the sanitized ledger",
);
assert.match(
  workflowImportCatalogResolver,
  /DISCOVER_APP_ALIASES[\s\S]*REVIEW_ONLY_LOGO_ALIASES[\s\S]*context7[\s\S]*fly-light[\s\S]*logoUrlDark \?\? app\.logoUrl/,
  "launch workflow catalog resolver must prefer light-on-dark catalog logos and support review-only known MCP aliases",
);
const reviewCatalogMatcher =
  workflowImportCatalogResolver.match(/function catalogCandidatesFromRecord[\s\S]*?function reviewLogoCandidatesFromRecord/)?.[0] ?? "";
assert.doesNotMatch(
  reviewCatalogMatcher,
  /docsUrl|websiteUrl|packageUrl|sourceUrl/,
  "launch workflow catalog matching must not bind unknown MCPs to catalog apps just because evidence links live on GitHub or another app host",
);
assert.doesNotMatch(
  workflowImportCatalogResolver,
  /key\.includes|includes\(catalogKey|includes\(aliasKey/,
  "launch workflow catalog resolver must not use broad substring matching as catalog authority",
);
assert.match(
  workflowImportCatalogResolver,
  /looksLikeEndpointHostInput[\s\S]*readEndpointHost[\s\S]*DISCOVER_APP_ID_BY_ENDPOINT_HOST[\s\S]*findCatalogAppForCandidate/,
  "launch workflow catalog resolver must treat parsed endpoint hosts as a separate exact-match authority path",
);
assert.match(
  workflowImportReviewProjection,
  /Boolean\(instructionsMd\)[\s\S]*hasActualSkillProvenance[\s\S]*shouldDefaultImport !== false[\s\S]*!dependsOnRepo[\s\S]*!itemHasLowConfidence[\s\S]*!isRejectedWorkflowCandidate/,
  "launch workflow review must not default-select skills unless complete actual skill provenance is present",
);
assert.match(
  workflowImportReviewProjection,
  /isDerivedOrSynthesizedSkillRecord[\s\S]*bodyExtraction[\s\S]*synthesized[\s\S]*originKind[\s\S]*derived_from_markdown[\s\S]*defaultSelected: false/,
  "launch workflow review must keep markdown-derived or synthesized skill candidates visible but manually selected",
);
assert.match(
  workflowImportReviewProjection,
  /sourcePath[\s\S]*source_path[\s\S]*location[\s\S]*hasActualSkillProvenance/,
  "launch workflow review must use sourcePath skill provenance when judging default selection",
);
assert.match(
  workflowImportReviewProjection,
  /buildCommunityWorkflowImportRepositoryIdentity[\s\S]*identity\.displayName[\s\S]*identity\.host === "github"[\s\S]*"GitHub"/,
  "launch workflow review must display GitHub repositories by real owner/repo identity while preserving the GitHub logo",
);
assert.match(
  workflowImportRepositoryIdentity,
  /parseCommunityWorkflowImportGitHubFullName[\s\S]*git@github[\s\S]*parsed\.hostname\.toLowerCase\(\) !== "github\.com"[\s\S]*fullName[\s\S]*displayName/,
  "workflow import repository identity helper must parse GitHub HTTPS and SSH remotes into owner/repo display names",
);
assert.match(
  workflowImportCandidateIds,
  /normalizeCommunityWorkflowImportCandidateKey[\s\S]*buildCommunityWorkflowImportMcpReviewItemId[\s\S]*buildCommunityWorkflowImportSkillReviewItemId[\s\S]*buildCommunityWorkflowImportMarkdownSkillReviewItemId/,
  "workflow import review ids must come from a shared deterministic candidate id helper",
);
assert.match(
  workflowImportReviewProjection,
  /communityWorkflowImportCandidateIds[\s\S]*buildCommunityWorkflowImportMcpReviewItemId[\s\S]*buildCommunityWorkflowImportSkillReviewItemId[\s\S]*buildCommunityWorkflowImportMarkdownSkillReviewItemId/,
  "web review projection must use the shared workflow import candidate id helper",
);
assert.match(
  workflowImports,
  /communityWorkflowImportCandidateIds[\s\S]*buildCommunityWorkflowImportMcpReviewItemId[\s\S]*buildCommunityWorkflowImportSkillReviewItemId[\s\S]*buildCommunityWorkflowImportMarkdownSkillReviewItemId/,
  "server apply planning must use the same workflow import candidate ids shown to the user",
);
assert.match(
  workflowImports,
  /mapCatalogCandidate[\s\S]*catalog_app_id: app\.id[\s\S]*logo_url: app\.logoUrl[\s\S]*logo_url_dark: app\.logoUrlDark[\s\S]*endpoint_url[\s\S]*auth_type/,
  "workflow import candidate search must return catalog identity, logo, endpoint, and auth metadata for the analysis agent",
);
assert.match(
  workflowImports,
  /copy its catalog_app_id exactly[\s\S]*logo_url[\s\S]*logo_url_dark[\s\S]*proposedInstructionsMd[\s\S]*fullName/,
  "workflow import agent instructions must preserve catalog identity, importable skill bodies, and GitHub repo names in the ledger",
);
assert.match(
  workflowImports,
  /buildCommunityWorkflowImportRepositoryIdentity[\s\S]*identity\.displayName[\s\S]*repositoryUrl: identity\.remoteUrl/,
  "server workflow import apply plan must use the same repository identity display name as the review projection",
);
assert.match(
  setupModal,
  /MCP servers[\s\S]*showSummary: false[\s\S]*Skills[\s\S]*showSummary: true[\s\S]*GitHub/,
  "launch workflow review must keep MCP rows minimal while giving skills a compact explanation surface",
);
assert.match(
  setupModal,
  /skillScan\.itemCount[\s\S]*skill-like found[\s\S]*skillScan\.completenessConfidence[\s\S]*Skill scan/,
  "launch workflow review must show compact skill scan completeness status when the ledger provides it",
);
assert.match(
  setupModal,
  /community-launch-review-logo[\s\S]*item\.logoUrl[\s\S]*item\.name[\s\S]*community-launch-review-toggle/,
  "launch workflow review MCP and repo rows must expose logo, name, and keep/remove control",
);
assert.match(
  setupModal,
  /community-launch-review-preview[\s\S]*Preview[\s\S]*community-launch-skill-preview/,
  "launch workflow review skills must have a compact preview path before confirmation",
);
assert.match(
  setupModal,
  /handleConfirmAllWorkflowReviewItems[\s\S]*Confirm all/,
  "launch workflow review must allow local bulk confirmation",
);
assert.match(
  setupModal,
  /onApplyWorkflowImport[\s\S]*selectedItemIds[\s\S]*Apply selected/,
  "launch workflow review must apply only the selected review ids",
);
assert.doesNotMatch(
  setupModal,
  /Apply next/,
  "launch workflow review must not render a fake disabled apply affordance before apply exists",
);
assert.doesNotMatch(
  setupModal,
  /connectCommunityApp|attachSkillPackageToCommunity|saveCommunityResource|createCloudCommunityResource/,
  "launch workflow review UI must not own canonical app, skill, or resource writes",
);
assert.match(
  appShell,
  /handleStartCommunityLaunchWorkflowImport[\s\S]*currentLedgerJson: result\.current_ledger_json[\s\S]*handleLoadCommunityLaunchWorkflowImport[\s\S]*currentLedgerJson: result\.current_ledger_json[\s\S]*handleApplyCommunityLaunchWorkflowImport[\s\S]*applyCloudCommunityWorkflowImportReview[\s\S]*onApplyWorkflowImport=\{handleApplyCommunityLaunchWorkflowImport\}/,
  "app shell must pass sanitized workflow import ledger data into the review screen and wire the real apply path",
);
assert.match(
  appShell,
  /handleApplyCommunityLaunchWorkflowImport[\s\S]*loadCommunityAppMounts\(community\.id, session\)[\s\S]*loadCommunitySkillAttachments\(community\.id, session\)[\s\S]*reloadEffectiveMcpApps\(\)[\s\S]*reloadEffectiveSkills\(\)/,
  "workflow import apply must refresh canonical community rows and the effective harness integrations surface",
);
assert.match(
  effectiveSkills,
  /buildEffectiveSkills[\s\S]*personalSkills[\s\S]*communitySkills[\s\S]*personal_install[\s\S]*community_attachment/,
  "effective skills must merge personal skill installs with selected-community skill attachments",
);
assert.match(
  harnessSkills,
  /listEffectiveSkills[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess[\s\S]*buildEffectiveSkills/,
  "effective skill reads must be authenticated and community-access gated without requiring manager authority",
);
assert.match(
  cloudEffectiveSkillGateway,
  /harnessSkills:listEffectiveSkills/,
  "web effective skill gateway must read the dedicated effective harness skill query",
);
assert.match(
  integrationsSettingsSection,
  /effectiveSkills[\s\S]*Harness skills[\s\S]*Personal skills and selected-community skills are available through the\s+same harness context/,
  "integrations settings must render the one effective harness skill surface instead of personal-only skills",
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
  "apps/web/public/harness-logos/cursor.png",
  "apps/web/public/harness-logos/gemini-cli.svg",
  "apps/web/public/harness-logos/antigravity.svg",
]) {
  assert.equal(existsSync(logoPath), true, `missing harness logo asset: ${logoPath}`);
}
for (const logoPath of [
  "apps/web/public/app-logos/github-light.svg",
  "apps/web/public/app-logos/vercel-light.svg",
  "apps/web/public/app-logos/context7.svg",
  "apps/web/public/app-logos/fly-light.svg",
]) {
  assert.equal(existsSync(logoPath), true, `missing workflow import review logo asset: ${logoPath}`);
}
assert.match(
  discoverCatalog,
  /id: "github"[\s\S]*logoUrl: "\/app-logos\/github\.svg"[\s\S]*logoUrlDark: "\/app-logos\/github-light\.svg"[\s\S]*id: "vercel"[\s\S]*logoUrl: "\/app-logos\/vercel\.svg"[\s\S]*logoUrlDark: "\/app-logos\/vercel-light\.svg"/,
  "Discover catalog must expose light-on-dark GitHub and Vercel logo variants for dark review surfaces",
);
assert.equal(
  existsSync("apps/web/public/harness-logos/opencode.svg"),
  false,
  "removed OpenCode source must not leave an unused harness logo asset",
);
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
  /\.community-launch-workflow-option:hover,[\s\S]*\.community-launch-workflow-option\.selected \{[\s\S]*var\(--accent-gold\)/,
  "launch workflow selector cards must use the same hover language as access choices",
);
assert.match(
  baseCss,
  /\.community-launch-harness-selector-option:hover,[\s\S]*\.community-launch-harness-selector-option\.selected \{[\s\S]*var\(--accent-gold\)/,
  "launch harness selector cards must use the same hover language as access choices",
);
assert.match(
  setupModal,
  /ArrowLeft[\s\S]*aria-label="Back to workflow path options"/,
  "launch workflow import back control must use an icon button instead of text",
);
assert.match(
  baseCss,
  /\.community-launch-harness-selector-grid \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/,
  "launch harness selector must present the current import sources as a dedicated grid",
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
