import fs from "node:fs";
import path from "node:path";

const [inventoryArg, outputArg] = process.argv.slice(2);
if (!inventoryArg || !outputArg) {
  throw new Error("usage: node assign-domains.mjs <inventory-json> <coverage-json>");
}

const inventoryPath = path.resolve(inventoryArg);
const outputPath = path.resolve(outputArg);
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));

const domains = {
  "repository-architecture": "repository topology, packages, dependencies, generated code, and cross-cutting kernels",
  "release-configuration": "environment names, deployment selectors, CI, release, backup, restore, and rollback",
  "data-foundations": "schema-level and cross-domain persistence mechanics",
  "identity-access": "authentication, sessions, accounts, platform entitlement, roles, and access policy",
  "profiles-privacy": "profiles, personal memory, consent, legal acceptance, retention, export, and deletion",
  "community-core": "community identity, ownership, membership, visibility, funnels, onboarding, and community commerce access",
  "billing-money": "checkout, subscriptions, usage accounting, credits, Stripe, commissions, and payouts",
  interactions: "community chat/interactions, direct messages, presence, events, reactions, mentions, and notifications",
  "resources-intelligence": "resources, ingestion, evidence, compiler, cognition, accepted intelligence, retrieval, and outcomes",
  "agents-runtime": "member/community agents, models, prompts, context, tools, runs, receipts, and failure recovery",
  "apps-integrations-mcp": "apps, skills, OAuth, provider connections, MCP consumption, and MCP exposure",
  "workspace-harness": "threads, projects, coding/community harnesses, sandboxes, workers, terminals, previews, and compatibility substrate",
  "async-jobs": "scheduled jobs, outboxes, queues, leases, retries, reconciliation, and cleanup",
  "public-boundaries": "public APIs, Vercel adapters, Convex HTTP routes, webhooks, validation, and rate bounds",
  frontend: "routing, navigation, UI projections, client state, accessibility, mobile, CSS, and bundles",
  "observability-operations": "audit, diagnostics, analytics, logging, operator controls, and incident evidence",
  "tests-proofs": "tests, proof scripts, fixtures, seeds, migration checks, and quality gates",
  "docs-history-research": "active docs, archived contracts, historical evidence, and protected references",
};

const tableGroups = {
  "identity-access": ["users", "authSessions", "userEntitlements", "operatorRoles"],
  "profiles-privacy": [
    "legalAcceptances", "userMemorySettings", "userProfileDetails",
    "personalMemoryItems", "memberFacts", "memberProfileSpines",
  ],
  "community-core": [
    "communities", "communityMemberships", "communityOnboardingConfigs", "communityOnboardingSessions",
    "communityJoinRequests", "communityBlocks", "communityFunnels", "communityPricePoints", "communitySubscriptions",
    "communityMemberSettings",
  ],
  "billing-money": [
    "userStripeConnectAccounts", "builderPartners", "partnerAttributions", "partnerCommissionLedger",
    "partnerCommissionAdjustments", "partnerPayoutBatches", "partnerPayoutTransfers", "partnerPayoutItems",
    "workspaceCreditBalances", "workspaceAutoRechargeSettings", "workspaceAutoRechargeAttempts",
    "workspaceComputeCharges", "providerCostEntries", "workspaceUsageCollections", "creditLedgerEntries",
    "checkoutSessions", "userStripeCustomers", "purchaseClaims",
  ],
  interactions: [
    "communityPresence", "communityAnalyticsEvents", "platformBusinessVisits", "communityChatThreads",
    "communityChatMessages", "communityActivityEvents", "communityMessageReactions", "communityFeaturedMessages",
    "communityTypingPresence", "communityInteractionRoots", "communityInteractionReplies",
    "communityInteractionAttachments", "communityInteractionEmbeds", "communityInteractionContentBlocks",
    "communityInteractionMentions", "communityMentionBroadcasts", "communityAgentServeRequests",
    "communityInteractionReactions", "communityInteractionModerationEvents", "communityInteractionLegacyChatLinks",
    "dmConversations", "dmParticipants", "dmMessages", "dmBlocks", "dmRateCounters", "dmTypingPresence",
    "communityEvents", "emailPreferences", "emailOutbox", "emailDeliveries",
  ],
  "resources-intelligence": [
    "communityAiFeedPosts", "communityAiFeedReactions", "communityResources", "communityResourceContents",
    "communitySourceUnits", "communitySourceUnitContents", "communitySourceCrawlJobs", "communityResourceModules",
    "communityResourceBuilderChangesets", "communityArchiveDocuments", "communitySourceTraces",
    "communityEvidenceCitations", "communityEvidenceRetrievalLogs", "communityIntelligenceNodes",
    "communityIntelligenceEdges", "communityIntelligenceMutations", "communityIntelligenceChangeRequests",
    "communityIntelligenceRetrievalLogs", "communityOutcomeObservations", "communityMemoryMetabolizerRuns",
    "communityCompilerDigests",
  ],
  "agents-runtime": [
    "communityAgentConfigs", "communityAgentRuns", "communityAgentRunEvents", "memberAgentChannels",
    "memberAgentEpisodes", "runtimeRuns", "runtimeRunEvents",
  ],
  "apps-integrations-mcp": [
    "userProviderConnections", "userProviderAuthStates", "userProviderDeviceAuthStates",
    "userSourceIntegrationConnections", "userSourceIntegrationAuthStates", "developerApps", "appConnections",
    "appOAuthStates", "appToolSnapshots", "communityAppMounts", "userPlatformAppMounts",
    "userPlatformAppMountSources", "skillPackages", "skillPackageRevisions", "userPlatformSkillInstalls",
    "communitySkillAttachments",
  ],
  "workspace-harness": [
    "workspaceDirectorySnapshots", "workspaceFilePreviewSnapshots", "cloudProjects", "workspaceTerminalSessions",
    "threads", "cloudMessages", "cloudThreadAttachments", "cloudThreadAttachmentUploadTickets",
    "polynetCodexWorkerCapacityLeases", "daytonaCodexRuntimeTargets",
  ],
  "observability-operations": ["criticalAuditEvents", "platformDiagnosticEvents"],
};

const tableDomain = new Map();
for (const [domain, names] of Object.entries(tableGroups)) {
  for (const name of names) tableDomain.set(name, domain);
}

function semanticDomain(raw) {
  const value = String(raw ?? "").toLowerCase();
  if (/stripe|billing|commerce|checkout|purchase|credit|cost|recharge|partner|commission|payout|settlement|funding/.test(value)) return "billing-money";
  if (/directmessage|direct_message|\bdm|interaction|chat|message|reaction|mention|presence|event|notification|email|digest|reminder|featured/.test(value)) return "interactions";
  if (/resource|source|archive|evidence|intelligence|compiler|cognition|memory|metabol|ai.?feed|wiki|retrieval|outcome|lineage/.test(value)) return "resources-intelligence";
  if (/memberagent|communityagent|agent|runtime|model|inference|prompt|toolcall|tool_call|turn|reasoning|voice/.test(value)) return "agents-runtime";
  if (/mcp|oauth|developerapp|appmount|appconnection|skill|providerconnection|provider_connection|integration/.test(value)) return "apps-integrations-mcp";
  if (/workspace|project|thread|daytona|blaxel|terminal|sandbox|previewproxy|preview_proxy|codexworker|codex_worker|harness/.test(value)) return "workspace-harness";
  if (/community|membership|onboarding|funnel|joinrequest|join_request|block|discover/.test(value)) return "community-core";
  if (/profile|ontology|personal|privacy|legal|consent|accountdelete|account_delete|anonymoususer/.test(value)) return "profiles-privacy";
  if (/auth|session|identity|entitlement|gate|operatoraccess|operator_access|accountsetup|account_setup/.test(value)) return "identity-access";
  if (/diagnostic|audit|analytics|operator|errorlog|error_log|sentry|health|probe/.test(value)) return "observability-operations";
  return "repository-architecture";
}

function fileAssignment(file) {
  const normalized = String(file ?? "").replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  const semantic = semanticDomain(normalized);
  if (lower.startsWith("references/")) return { primaryDomain: "docs-history-research", semanticDomain: semantic, role: "protected_research" };
  if (lower.startsWith("docs/")) return { primaryDomain: "docs-history-research", semanticDomain: semantic, role: lower.includes("/archive/") ? "archived_document" : "document" };
  if (lower.startsWith("scripts/")) {
    if (/deploy|release|preflight|readiness|production|staging|guard\.sh$/.test(lower)) return { primaryDomain: "release-configuration", semanticDomain: semantic, role: "operational_script" };
    if (/migration|backfill|prune|cleanup|repair/.test(lower)) return { primaryDomain: "tests-proofs", semanticDomain: semantic, role: "migration_or_maintenance_script" };
    return { primaryDomain: "tests-proofs", semanticDomain: semantic, role: "proof_or_fixture" };
  }
  if (lower.startsWith("api/")) return { primaryDomain: "public-boundaries", semanticDomain: semantic, role: "vercel_api_route" };
  if (lower.startsWith("convex/http") || lower === "convex/http.ts") return { primaryDomain: "public-boundaries", semanticDomain: semantic, role: "convex_http_boundary" };
  if (lower === "convex/crons.ts") return { primaryDomain: "async-jobs", semanticDomain: semantic, role: "scheduler_registry" };
  if (lower === "convex/schema.ts" || lower.startsWith("convex/_generated/")) return { primaryDomain: "data-foundations", semanticDomain: semantic, role: lower.includes("_generated") ? "generated_contract" : "schema" };
  if (lower.startsWith("apps/web/")) return { primaryDomain: "frontend", semanticDomain: semantic, role: "web_client" };
  if (lower.startsWith("apps/preview-proxy/")) return { primaryDomain: "workspace-harness", semanticDomain: "workspace-harness", role: "preview_service" };
  if (lower.startsWith("services/")) return { primaryDomain: "workspace-harness", semanticDomain: semantic, role: "worker_service" };
  if (lower.startsWith("public/") || lower === "index.html") return { primaryDomain: "frontend", semanticDomain: semantic, role: "public_asset" };
  if (lower.startsWith("convex/")) return { primaryDomain: semantic, semanticDomain: semantic, role: "cloud_domain_logic" };
  if (lower.startsWith("shared/")) return { primaryDomain: semantic, semanticDomain: semantic, role: /\.tsx$/.test(lower) ? "shared_ui_projection" : "shared_contract_or_client_logic" };
  if (/^\.env|vercel|convex\.json|\.github/.test(lower)) return { primaryDomain: "release-configuration", semanticDomain: semantic, role: "configuration_or_release" };
  if (/package|tsconfig|gitignore/.test(lower)) return { primaryDomain: "repository-architecture", semanticDomain: semantic, role: "repository_configuration" };
  if (/\.md$/.test(lower)) return { primaryDomain: "docs-history-research", semanticDomain: semantic, role: "root_doctrine" };
  return { primaryDomain: "repository-architecture", semanticDomain: semantic, role: "repository_asset" };
}

const schemaTables = inventory.schemaTables.map((row) => ({
  ...row,
  primaryDomain: tableDomain.get(row.name) ?? "data-foundations",
  assignmentConfidence: tableDomain.has(row.name) ? "explicit" : "fallback",
}));

const convexFunctions = inventory.exportedConvexFunctions.map((row) => ({
  ...row,
  primaryDomain: fileAssignment(row.file).semanticDomain,
  role: row.constructor,
  assignmentConfidence: "filename_heuristic",
}));
const convexFunctionAliases = (inventory.exportedConvexAliases ?? []).map((row) => ({
  ...row,
  primaryDomain: fileAssignment(row.file).semanticDomain,
  role: "transport_alias_candidate",
  assignmentConfidence: "resolved_export_graph",
}));

const convexHttpRoutes = inventory.convexHttpRoutes.map((row) => ({
  file: row.file,
  line: row.line,
  path: row.path,
  method: row.method,
  primaryDomain: "public-boundaries",
  semanticDomain: semanticDomain(`${row.file} ${row.path}`),
  assignmentConfidence: "boundary_plus_filename_heuristic",
}));

const apiRoutes = inventory.apiRouteFiles.map((row) => ({
  ...row,
  primaryDomain: "public-boundaries",
  semanticDomain: semanticDomain(`${row.file} ${row.route}`),
  assignmentConfidence: "boundary_plus_path_heuristic",
}));

const scheduledJobs = inventory.scheduledJobs.map((row) => ({
  ...row,
  primaryDomain: "async-jobs",
  semanticDomain: semanticDomain(`${row.name} ${row.function}`),
  assignmentConfidence: "scheduler_plus_target_heuristic",
}));

const trackedFiles = inventory.trackedFiles.map((row) => ({ ...row, ...fileAssignment(row.path), assignmentConfidence: "path_heuristic" }));
const documentation = inventory.documentation.map((row) => ({ ...row, ...fileAssignment(row.file), assignmentConfidence: "path_and_status_heuristic" }));

function counts(rows, field) {
  const result = {};
  for (const row of rows) result[row[field]] = (result[row[field]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceInventory: path.relative(path.dirname(outputPath), inventoryPath),
  snapshot: inventory.snapshot,
  warning: "Coverage assignments are mechanical routing aids, not authority, liveness, deadness, ownership, or deletion proof.",
  domains,
  summary: {
    schemaTables: counts(schemaTables, "primaryDomain"),
    convexFunctions: counts(convexFunctions, "primaryDomain"),
    convexFunctionAliases: counts(convexFunctionAliases, "primaryDomain"),
    convexHttpRoutes: counts(convexHttpRoutes, "semanticDomain"),
    apiRoutes: counts(apiRoutes, "semanticDomain"),
    scheduledJobs: counts(scheduledJobs, "semanticDomain"),
    trackedFiles: counts(trackedFiles, "primaryDomain"),
    documentation: counts(documentation, "semanticDomain"),
    fallbackSchemaTables: schemaTables.filter((row) => row.assignmentConfidence === "fallback").map((row) => row.name),
  },
  schemaTables,
  convexFunctions,
  convexFunctionAliases,
  convexHttpRoutes,
  apiRoutes,
  scheduledJobs,
  trackedFiles,
  documentation,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, summary: output.summary }, null, 2));
