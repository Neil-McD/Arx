import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const vercel = read("vercel.json");
const sourceUrlFetcher = read("api/source-url-fetch.js");
const schema = read("convex/schema.ts");
const core = read("convex/communityCore.ts");
const resources = read("convex/communityResources.ts");
const sourceUrlPolicy = read("convex/communitySourceUrlPolicy.ts");
const http = read("convex/http.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const resourceController = read("shared/useCommunityResourceController.ts");
const sourceIntake = read("apps/web/src/components/WebCommunityKnowledgeSourceIntake.tsx");
const sourceCrawler = read("shared/communitySourceCrawler.ts");
const sourceCrawlerServicePath = join(root, "services/community-source-crawler/app.py");
const app = read("apps/web/src/App.tsx");

assert.match(
  packageJson,
  /"check:community-source-ingestion-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_source_ingestion_contract_proof\.ts"/,
  "source ingestion proof should be wired into package scripts",
);
assert.match(
  resources,
  /function isIngestibleCommunitySource\(row: CommunityResourceLike\): boolean \{\n  return isPlainUrlSource\(row\) \|\| isPlainFileSource\(row\);\n\}/,
  "only manual link and file sources are ingested; GitHub and Google Drive import is retired",
);
assert.match(
  resources,
  /ingestionKind === "google_drive" \|\| ingestionKind === "github"[\s\S]*"retired_provider"[\s\S]*"community_source_provider_retired"/,
  "a claimed GitHub or Google Drive source fails closed instead of being fetched",
);
assert.doesNotMatch(
  resources + http + gateway,
  /SourceOAuth|source-integrations|getGoogleDriveConnectionRow|getGitHubConnectionRow|GITHUB_OAUTH|GOOGLE_DRIVE_OAUTH/,
  "GitHub and Google Drive connections, OAuth and import stay deleted",
);
assert.match(
  packageJson,
  /"check:community-source-url-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_source_url_policy_behavior_proof\.ts"/,
  "source URL policy behavior proof should be wired into package scripts",
);
assert.match(
  packageJson,
  /"check:community-source-crawl-behavior-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_source_crawl_behavior_proof\.ts"/,
  "source crawl behavior proof should be wired into package scripts",
);

assert.match(
  vercel,
  /"functions":\s*\{[\s\S]*"api\/source-url-fetch\.js":\s*\{[\s\S]*"maxDuration":\s*10/,
  "source URL fetch broker should run as a bounded first-party Vercel function",
);
assert.match(
  vercel,
  /"src": "\/api\/preview\([^)]+\)\?"[\s\S]*"handle": "filesystem"/,
  "source URL fetch broker should remain reachable through the filesystem function route",
);
assert.match(
  sourceUrlFetcher,
  /timingSafeEqual[\s\S]*BROKER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET"[\s\S]*requireBearerSecret[\s\S]*source_url_fetcher_secret_not_configured[\s\S]*authorization\.startsWith\(prefix\)[\s\S]*constantTimeEquals\(token, secret\)/,
  "source URL fetch broker should require the shared bearer secret before fetching",
);
assert.match(
  sourceUrlFetcher,
  /MAX_REQUEST_BODY_BYTES[\s\S]*source_url_fetcher_invalid_json[\s\S]*if \(req\.method !== "POST"\)/,
  "source URL fetch broker should only accept bounded POST JSON requests",
);
assert.match(
  sourceUrlFetcher,
  /requireSafeSourceUrl[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_https_required[\s\S]*parsed\.username \|\| parsed\.password[\s\S]*community_source_url_credentials_not_supported[\s\S]*parsed\.port && parsed\.port !== "443"[\s\S]*community_source_url_port_not_supported/,
  "source URL fetch broker should only fetch public-shaped HTTPS URLs without credentials or custom ports",
);
assert.match(
  sourceUrlFetcher,
  /DENIED_HOSTNAMES[\s\S]*metadata\.google\.internal[\s\S]*DENIED_HOSTNAME_SUFFIXES[\s\S]*"\.internal"[\s\S]*"\.arpa"[\s\S]*hasEmbeddedPrivateIpv4/,
  "source URL fetch broker should reject local-only hostnames and embedded private IPv4 targets",
);
assert.match(
  sourceUrlFetcher,
  /dns\.promises\.lookup\(hostname, \{ all: true, verbatim: true \}\)[\s\S]*rows\.some\(\(row\) => isPrivateOrReservedIp\(row\.address\)\)[\s\S]*community_source_url_private_address_denied/,
  "source URL fetch broker should resolve DNS itself and fail closed on private or reserved addresses",
);
assert.match(
  sourceUrlFetcher,
  /https\.request\([\s\S]*hostname: pinnedAddress\.address[\s\S]*servername: parsedUrl\.hostname[\s\S]*lookup: \(_hostname, _options, callback\) => \{[\s\S]*pinnedAddress\.address/,
  "source URL fetch broker should pin the connection to the validated public address while preserving TLS SNI",
);
assert.match(
  sourceUrlFetcher,
  /for \(let redirectCount = 0; redirectCount <= options\.maxRedirects[\s\S]*new URL\(String\(result\.redirectUrl\), currentUrl\)[\s\S]*currentUrl = requireSafeSourceUrl\(nextUrl\.toString\(\)\)/,
  "source URL fetch broker should revalidate every redirect target",
);
assert.match(
  sourceUrlFetcher,
  /HARD_MAX_BYTES = 2_500_000[\s\S]*HARD_MAX_CHARS = 50_000[\s\S]*HARD_TIMEOUT_MS = 8_000[\s\S]*HARD_MAX_REDIRECTS = 3/,
  "source URL fetch broker should enforce hard byte, text, timeout, and redirect limits",
);
assert.match(
  sourceUrlFetcher,
  /contentType\.includes\("application\/pdf"\) \|\| isPdfUrl\(parsedUrl\)[\s\S]*community_source_pdf_ingestion_not_supported[\s\S]*isReadableContentType/,
  "source URL fetch broker should reject PDFs and unsupported content types",
);
assert.match(
  sourceUrlFetcher,
  /extractReadableTextFromHtml[\s\S]*extractReadableText[\s\S]*sendJson\(res, 200,[\s\S]*final_url:[\s\S]*content_type:[\s\S]*title:[\s\S]*text:/,
  "source URL fetch broker should return bounded extracted text for the Convex ingester",
);

assert.match(
  schema,
  /sourceIngestionStatus:[\s\S]*"queued"[\s\S]*"processing"[\s\S]*"ready"[\s\S]*"failed"/,
  "community resources should store source ingestion readiness separately from editorial status",
);
assert.match(
  schema,
  /sourceIngestionKind:[\s\S]*"url"[\s\S]*"file"[\s\S]*"google_drive"[\s\S]*"github"/,
  "source ingestion should share one kind contract for links, files, Drive, and GitHub",
);
assert.match(
  schema,
  /sourceIngestionError:[\s\S]*sourceIngestionAttemptedAt:[\s\S]*sourceIngestedAt:/,
  "source ingestion should persist failure and timing evidence",
);
assert.match(
  schema,
  /sourceIngestionLeaseId:[\s\S]*sourceIngestionLeaseExpiresAt:[\s\S]*sourceIngestionAttempt:/,
  "source ingestion should persist one bounded ownership fence on the canonical source row",
);
assert.match(
  schema,
  /sourceOriginalFilename:[\s\S]*sourceOriginalMimeType:[\s\S]*sourceOriginalBytes:/,
  "file source ingestion should persist original upload metadata",
);
assert.match(
  schema,
  /communitySourceCrawlJobs:[\s\S]*provider: v\.union\(v\.literal\("simple"\), v\.literal\("crawl4ai"\), v\.literal\("firecrawl"\)\)[\s\S]*rootUrl: v\.string\(\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("queued"\)[\s\S]*v\.literal\("crawling"\)[\s\S]*v\.literal\("saving_sources"\)[\s\S]*v\.literal\("ready"\)[\s\S]*v\.literal\("failed"\)[\s\S]*sourceResourceIds:[\s\S]*\.index\("by_community_status_createdAt", \["communityId", "status", "createdAt"\]\)/,
  "source crawling should persist durable crawl job state, tolerate legacy firecrawl rows, and keep status, limits, counts, and saved source ids",
);
assert.match(
  schema,
  /sourceExternalProvider:[\s\S]*sourceExternalConnectionUserId:[\s\S]*sourceExternalId:[\s\S]*sourceExternalName:[\s\S]*sourceExternalUrl:[\s\S]*sourceExternalMimeType:[\s\S]*sourceExternalModifiedAt:[\s\S]*\.index\("by_community_source_external", \["communityId", "sourceExternalProvider", "sourceExternalId"\]\)/,
  "community source resources should carry external source identity and credential authority for integrations",
);
assert.match(
  schema,
  /communityResourceContents:[\s\S]*resourceId: v\.id\("communityResources"\)[\s\S]*bodyMd: v\.string\(\)[\s\S]*bodyChars: v\.number\(\)[\s\S]*bodyHash: v\.string\(\)[\s\S]*\.index\("by_resource", \["resourceId"\]\)/,
  "large parsed source text should live in resource content rows, not only the hot communityResources metadata row",
);
assert.match(
  schema,
  /communitySourceUnits:[\s\S]*crawlJobId: v\.id\("communitySourceCrawlJobs"\)[\s\S]*sourceResourceId: v\.optional\(v\.id\("communityResources"\)\)[\s\S]*unitKey: v\.string\(\)[\s\S]*unitKind: v\.union\(v\.literal\("page"\), v\.literal\("virtual_section"\)\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("ready"\)[\s\S]*v\.literal\("failed"\)[\s\S]*v\.literal\("skipped"\)[\s\S]*bodyChars: v\.number\(\)[\s\S]*bodyOriginalChars: v\.number\(\)[\s\S]*bodyHash: v\.string\(\)[\s\S]*bodyTruncated: v\.optional\(v\.boolean\(\)\)[\s\S]*seenCount: v\.number\(\)[\s\S]*lastSeenAt: v\.number\(\)[\s\S]*\.index\("by_community_unit_key", \["communityId", "unitKey"\]\)[\s\S]*\.index\("by_source_resource", \["sourceResourceId"\]\)/,
  "crawler source units should be a bounded deduped evidence layer separate from user-facing resources",
);
assert.match(
  schema,
  /communitySourceUnitContents:[\s\S]*sourceUnitId: v\.id\("communitySourceUnits"\)[\s\S]*bodyMd: v\.string\(\)[\s\S]*bodyChars: v\.number\(\)[\s\S]*bodyHash: v\.string\(\)[\s\S]*\.index\("by_source_unit", \["sourceUnitId"\]\)/,
  "source unit bodies should be stored outside source unit metadata rows",
);
assert.match(
  sourceCrawler,
  /buildCommunitySourceCrawlerUnitKey[\s\S]*communitySourceCrawlerUrlInRootScope[\s\S]*root\.origin !== candidate\.origin[\s\S]*rootPath === "\/"[\s\S]*candidatePath === rootPath \|\| candidatePath\.startsWith\(`\$\{rootPath\}\/`\)[\s\S]*planCommunitySourceCrawlerPageSave[\s\S]*existingSourcesByAlias[\s\S]*seenAliases[\s\S]*"existing_ready"[\s\S]*"update_existing"[\s\S]*summarizeCommunitySourceCrawlerPageSaveDecisions/,
  "source crawler save behavior should be covered by shared pure decision helpers",
);
assert.equal(
  existsSync(sourceCrawlerServicePath),
  false,
  "legacy Fly/Crawl4AI community-source-crawler service must be deleted from the repo",
);
assert.match(
  resources,
  /saveCommunitySourceUnitsForPage[\s\S]*COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS \+ 1[\s\S]*bodyOriginalChars = bodyRaw\.length[\s\S]*bodyTruncated = bodyOriginalChars > COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS[\s\S]*by_community_unit_key[\s\S]*existing\.bodyHash !== bodyHash[\s\S]*writeCommunitySourceUnitContent[\s\S]*planCommunitySourceCrawlerPageSave[\s\S]*existingSourcesByAlias: existingByUrl[\s\S]*seenAliases: seenUrls[\s\S]*decision\.action === "update_existing"[\s\S]*writeCommunityResourceBodyContent/,
  "crawler source persistence should dedupe source units while preserving the existing source-resource save path",
);

assert.match(
  core,
  /normalizeResourceSourceIngestionStatus[\s\S]*communityResourceBodyChars\(row\) > 0[\s\S]*"ready"[\s\S]*String\(row\.url[\s\S]*"queued"/,
  "source rows should infer ready only from readable body text metadata, not URL metadata",
);
assert.match(
  core,
  /communityResourceSourceHasReadyText[\s\S]*normalizeResourceRole\(row\.role\) === "source"[\s\S]*normalizeResourceSourceIngestionStatus\(row\) === "ready"[\s\S]*communityResourceBodyChars\(row\) > 0/,
  "ready source truth should require source role, ready status, and readable text",
);
assert.match(
  core,
  /source_ingestion_status:[\s\S]*source_ingestion_kind:[\s\S]*source_ingestion_error:/,
  "resource rows mapped to the web should expose ingestion state",
);
assert.match(
  core,
  /source_external_provider:[\s\S]*source_external_id:[\s\S]*source_external_name:[\s\S]*source_external_url:[\s\S]*source_external_mime_type:[\s\S]*source_external_modified_at:/,
  "resource rows mapped to the web should expose external integration source identity",
);
assert.match(
  resources,
  /(?=[\s\S]*listCommunityLaunchKnowledgeSources = query\(\{[\s\S]*by_community_role_status[\s\S]*isPlainUrlSource\(row\)[\s\S]*isPlainFileSource\(row\)[\s\S]*isGoogleDriveSourceResource\(row\)[\s\S]*isGitHubSourceResource\(row\))(?=[\s\S]*source_ingestion_kind: sourceIngestionKind)(?=[\s\S]*source_external_url:[\s\S]*normalizeOptionalUrl\(row\.url\))/,
  "launch Knowledge focused source query should return saved files, URL links, and Drive/GitHub rows with openable source URLs when available",
);
assert.doesNotMatch(
  core,
  /source_external_connection_user_id/,
  "resource rows mapped to the web must not expose the private integration credential owner",
);
assert.match(
  core,
  /normalizeResourceSourceIngestionKind[\s\S]*sourceExternalProvider[\s\S]*"google_drive"[\s\S]*sourceExternalProvider[\s\S]*"github"/,
  "legacy integration source rows should infer Drive and GitHub ingestion kinds from external providers",
);

assert.match(
  sourceUrlPolicy,
  /COMMUNITY_SOURCE_URL_DENIED_HOSTNAME_SUFFIXES[\s\S]*"\.internal"[\s\S]*"\.arpa"[\s\S]*"\.invalid"/,
  "URL ingestion should deny local-only hostname suffixes",
);
assert.match(
  sourceUrlPolicy,
  /requireSafeCommunitySourceUrl[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_https_required[\s\S]*parsed\.username \|\| parsed\.password[\s\S]*community_source_url_credentials_not_supported[\s\S]*parsed\.port && parsed\.port !== "443"[\s\S]*community_source_url_port_not_supported/,
  "URL ingestion should only fetch public-shaped HTTPS URLs without credentials or custom ports",
);
assert.match(
  sourceUrlPolicy,
  /isDeniedCommunitySourceHostname[\s\S]*localhost[\s\S]*metadata\.google\.internal[\s\S]*isLiteralIpv4[\s\S]*hasEmbeddedPrivateIpv4[\s\S]*COMMUNITY_SOURCE_URL_DENIED_HOSTNAME_SUFFIXES/,
  "URL ingestion must reject local, private, literal IP, and embedded-private-IP source targets",
);
assert.match(
  resources,
  /function requireSafeSourceIngestionUrl\(raw: unknown\): string \{[\s\S]*return requireSafeCommunitySourceUrl\(raw\)/,
  "community resource ingestion should use the shared source URL policy",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV = "ARX_SOURCE_URL_FETCHER_ENDPOINT"[\s\S]*COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET"/,
  "URL ingestion should require a configured first-party fetcher endpoint",
);
assert.match(
  sourceUrlPolicy,
  /requireSafeCommunitySourceFetcherEndpoint[\s\S]*community_source_url_fetcher_not_configured[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_fetcher_invalid/,
  "URL ingestion fetcher should fail closed unless a valid HTTPS broker is configured",
);
assert.match(
  resources,
  /resolveSourceUrlFetcherEndpoint[\s\S]*return requireSafeCommunitySourceFetcherEndpoint\(readEnv\(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV\)\)/,
  "community resource ingestion should validate the first-party fetcher endpoint through the shared source URL policy",
);
assert.match(
  resources,
  /sourceUrlFetcherHeaders[\s\S]*community_source_url_fetcher_secret_not_configured[\s\S]*authorization: `Bearer \$\{secret\}`/,
  "URL ingestion fetcher should require a shared broker secret before making requests",
);
assert.match(
  resources,
  /fetchSourceUrlViaConfiguredFetcher[\s\S]*requireSafeSourceIngestionUrl\(rawUrl\)[\s\S]*fetchWithTimeout\(resolveSourceUrlFetcherEndpoint\(\)[\s\S]*sourceUrlFetcherHeaders\(\)[\s\S]*max_redirects: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS/,
  "URL ingestion should send source URL extraction through the configured fetch broker only",
);
assert.match(
  resources,
  /extractSourceTextFromUrl[\s\S]*return await fetchSourceUrlViaConfiguredFetcher\(rawUrl\)/,
  "URL ingestion must not fetch arbitrary source URLs directly from Convex",
);
assert.doesNotMatch(
  resources,
  /fetchSourceUrlResponse|COMMUNITY_RESOURCE_SOURCE_INGESTION_DNS_QUERY_URL|fetchWithTimeout\(currentUrl/,
  "source URL ingestion must not rely on DNS preflight plus direct hostname fetch",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES[\s\S]*COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS[\s\S]*AbortController/,
  "URL ingestion must be timeout and size bounded",
);
assert.match(
  resources,
  /fetchSourceUrlViaConfiguredFetcher[\s\S]*payload\.text[\s\S]*normalizeExtractedText[\s\S]*community_source_url_no_readable_content/,
  "URL ingestion should accept bounded readable text from the configured fetch broker",
);
assert.match(
  sourceCrawler,
  /export type CommunitySourceCrawlerProvider = "simple"[\s\S]*export type CommunitySourceCrawlJobStatus = "queued" \| "crawling" \| "saving_sources" \| "ready" \| "failed"[\s\S]*export type CommunitySourcePageResult = \{[\s\S]*requested_url: string[\s\S]*final_url: string[\s\S]*canonical_url: string[\s\S]*root_url: string[\s\S]*parent_url: string \| null[\s\S]*depth: number[\s\S]*markdown: string[\s\S]*links: CommunitySourcePageLink\[\][\s\S]*status: CommunitySourcePageStatus[\s\S]*error: string \| null/,
  "source crawling should use a stable Polynet-owned page result contract",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES = 1[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES = 1[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH = 0[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH = 0/,
  "source crawling should be bounded to simple one-page ingestion",
);
assert.match(
  resources,
  /normalizeSourceCrawlerProvider\(\): CommunitySourceCrawlerProvider \{[\s\S]*return "simple";[\s\S]*getCommunitySourceCrawlerStatusValue[\s\S]*provider: "simple" as const[\s\S]*configured: true[\s\S]*max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES[\s\S]*message: "Only the linked page will be read\."/,
  "source crawler provider should be irreducibly simple and always use the first-party URL fetch broker",
);
assert.match(
  resources,
  /crawlSourceRootWithConfiguredProvider[\s\S]*normalizeSourceCrawlerProvider\(\)[\s\S]*crawlSourceRootWithSimpleFetcher\(\{ rootUrl \}\)/,
  "configured source crawling should execute only the simple brokered URL fetch path",
);
assert.doesNotMatch(
  resources,
  /ARX_SOURCE_CRAWLER_PROVIDER|ARX_CRAWL4AI|Crawl4AI|crawl4ai|resolveCrawl4AiEndpoint|crawl4AiHeaders|crawlSourceRootWithCrawl4AI|sourceCrawlerEndpointUrl|COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_RESPONSE_BYTES/,
  "source ingestion must not retain the deleted external Crawl4AI/Fly crawler adapter",
);
assert.match(
  resources,
  /crawlCommunitySourceRoot: any = action\(\{[\s\S]*requireCommunityManagerForAction\(ctx, userId, args\.communityId\)[\s\S]*createCommunitySourceCrawlJobInternal[\s\S]*ctx\.scheduler\.runAfter\([\s\S]*processCommunitySourceCrawlJobInternal[\s\S]*kind: "community_source_root_crawl_job"[\s\S]*job/,
  "source root crawl should be manager-gated and create a durable asynchronous crawl job",
);
assert.match(
  resources,
  /processCommunitySourceCrawlJobInternal = internalAction\(\{[\s\S]*status: "crawling"[\s\S]*crawlSourceRootWithConfiguredProvider[\s\S]*status: "saving_sources"[\s\S]*saveCommunitySourceCrawlPagesInternal[\s\S]*sourceResourceIds\.length === 0[\s\S]*community_source_crawl_no_usable_sources[\s\S]*status: "ready"[\s\S]*status: "failed"/,
  "source crawl jobs should move through crawling, saving, ready, and failed states and fail when no usable source rows exist",
);
assert.match(
  resources,
  /crawlWebRoot: any = internalAction\(\{[\s\S]*userId: v\.id\("users"\)[\s\S]*communityId: v\.id\("communities"\)/,
  "agent-visible web crawling must remain internal and require an explicit community funding scope",
);
const crawlWebRootActiveSourceSection = resources.match(
  /if \(!args\.communityId\) throw new Error\("web_crawl_active_community_required"\);[\s\S]*?\n  },\n}\);\n\nexport const crawlCommunitySourceRoot/,
)?.[0] ?? "";
assert.match(
  crawlWebRootActiveSourceSection,
  /requireCommunityManagerForAction[\s\S]*createCommunitySourceCrawlJobInternal[\s\S]*ctx\.runAction\([\s\S]*processCommunitySourceCrawlJobInternal[\s\S]*kind: "web_crawl"/,
  "agent-visible active-community crawling should create a durable job and wait on the canonical crawl worker",
);
assert.doesNotMatch(
  crawlWebRootActiveSourceSection,
  /crawlSourceRootWithConfiguredProvider|saveCommunitySourceCrawlPagesInternal|patchCommunitySourceCrawlJobInternal/,
  "agent-visible active-community crawling must not duplicate provider, persistence, or job-transition logic",
);
assert.match(
  resources,
  /saveCommunitySourceCrawlPagesInternal = internalMutation\(\{[\s\S]*communitySourceCrawlerPageArg[\s\S]*requireCommunityManager[\s\S]*by_community_role_status[\s\S]*communitySourceCrawlerUrlAliases\(maybeSafeSourceCrawlerUrl, source\.url\)[\s\S]*planCommunitySourceCrawlerPageSave[\s\S]*existingSourcesByAlias: existingByUrl[\s\S]*seenAliases: seenUrls[\s\S]*decision\.action === "skip"[\s\S]*decision\.action === "update_existing"[\s\S]*role: "source"[\s\S]*status: "review"[\s\S]*sourceIngestionStatus: "ready"[\s\S]*sourceIngestionKind: "url"[\s\S]*writeCommunityResourceBodyContent[\s\S]*syncCommunityResourceMemoryProjection/,
  "source crawl pages should dedupe root/redirect URL aliases and persist canonical ready URL source rows through the memory lifecycle",
);
assert.match(
  resources,
  /decision\.action === "update_existing"[\s\S]*sourceIngestionStatus: "ready"[\s\S]*sourceIngestionLeaseId: undefined[\s\S]*sourceIngestionLeaseExpiresAt: undefined[\s\S]*sourceIngestionAttempt: undefined/,
  "a crawler update should invalidate any older direct-ingestion claim on the same source",
);
assert.match(
  resources,
  /getCommunitySourceCrawlerStatus = query\(\{[\s\S]*requireCommunityManager[\s\S]*getCommunitySourceCrawlerStatusValue[\s\S]*listCommunitySourceCrawlJobs = query\(\{[\s\S]*requireCommunityManager[\s\S]*by_community_createdAt[\s\S]*mapCommunitySourceCrawlJob[\s\S]*getCommunitySourceCrawlJob = query\(\{[\s\S]*community_source_crawl_job_not_found/,
  "source crawl jobs should have manager-gated status and progress queries for launch polling",
);
assert.doesNotMatch(
  app,
  /crawlCommunitySourceRoot|ARX_CRAWL4AI|Crawl4AI/,
  "Crawl4AI should not be called from the browser UI",
);
assert.match(
  resources,
  /generateCommunityResourceSourceUploadUrl[\s\S]*await requireCommunityManager[\s\S]*ctx\.storage\.generateUploadUrl/,
  "source file uploads should be manager-gated",
);
assert.match(
  resources,
  /extractSourceTextFromFile[\s\S]*ctx\.storage\.getUrl[\s\S]*isPdfFileType[\s\S]*community_source_pdf_ingestion_not_supported[\s\S]*isReadableTextFileType/,
  "file ingestion should read uploaded source files from storage and reject PDFs until a first-party parser exists",
);
assert.match(
  resources,
  /fetchSourceUrlViaConfiguredFetcher[\s\S]*application\/pdf[\s\S]*community_source_pdf_ingestion_not_supported/,
  "URL ingestion should reject PDF URLs until a first-party parser exists",
);
assert.doesNotMatch(
  resources,
  /r\.jina\.ai|fetchPdfTextViaReader/,
  "source ingestion must not send source PDFs or signed uploaded file URLs to a third-party reader",
);
assert.doesNotMatch(
  resources,
  /application\/pdf;q=/,
  "source ingestion should not advertise PDF parsing support while PDFs fail closed",
);
assert.match(
  resources,
  /export const getCommunitySourceIngestionStateInternal = internalQuery\(/,
  "source ingestion should read source readiness through an internal query",
);
assert.match(
  resources,
  /function isPlainUrlSource[\s\S]*!isSourceIntegrationSource\(row\)[\s\S]*function isPlainFileSource[\s\S]*!isSourceIntegrationSource\(row\)/,
  "manual link/file source filters should exclude Drive and GitHub integration rows",
);
assert.doesNotMatch(
  resources,
  /communitySourceMatchesIngestionKind|function countPendingSourceIngestion|sourceKind:|resultKind:/,
  "the combined ingestion path must not retain obsolete provider-specific generalization",
);
assert.match(
  resources,
  /runCommunitySourceIngestion[\s\S]*const invalidMessage[\s\S]*status: "failed"[\s\S]*const failedSources = Number\(after\?\.failed_sources \?\? 0\)[\s\S]*const remainingPendingSources = Number\(after\?\.pending_sources \?\? 0\)[\s\S]*const ok = readySources > 0 && failedSources === 0 && remainingPendingSources === 0[\s\S]*failed_sources: failedSources[\s\S]*source_ingestion_partial_failure[\s\S]*source_ingestion_incomplete/,
  "source ingestion should derive truthful completion from persisted failed and pending state",
);
assert.match(
  resources,
  /claimNextCommunitySourceIngestionInternal = internalMutation\([\s\S]*requireCommunityManager[\s\S]*status === "queued"[\s\S]*status === "failed"[\s\S]*status === "processing" && leaseExpired[\s\S]*sourceIngestionLeaseId: leaseId[\s\S]*sourceIngestionAttempt: nextAttempt/,
  "source ingestion should claim one canonical source atomically with authorization, a lease, and an attempt fence",
);
assert.match(
  resources,
  /const claimedResourceIds:[\s\S]*excludeResourceIds: claimedResourceIds[\s\S]*claimedResourceIds\.push\(candidate\.resourceId\)/,
  "one ingestion action should claim each source at most once instead of burning retries in a tight loop",
);
assert.match(
  resources,
  /isExplicitFailedRetry[\s\S]*attempt >= COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS && !isExplicitFailedRetry[\s\S]*isExplicitFailedRetry && attempt >= COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS[\s\S]*\? 1[\s\S]*: attempt \+ 1/,
  "automatic retries should stop while an explicit retry can restart an exhausted source once",
);
assert.doesNotMatch(
  resources,
  /ctx\.db\.insert\("communityResourceModules"[\s\S]{0,500}descriptionMd:\s*null/,
  "community resource module scaffolds must omit empty descriptions instead of writing null into an optional string field",
);
assert.match(
  resources,
  /finalizeCommunitySourceIngestionInternal = internalMutation\([\s\S]*if \(!existing\) return \{ ok: false, code: "community_source_not_found" \}[\s\S]*requireActiveCommunity[\s\S]*community_source_ingestion_community_inactive[\s\S]*sourceIngestionLeaseId[\s\S]*sourceIngestionLeaseExpiresAt[\s\S]*community_source_ingestion_claim_lost/,
  "source finalization should reject inactive communities, deletion, and stale or expired ownership",
);
assert.match(
  resources,
  /args\.status === "ready"[\s\S]*community_source_ingestion_body_required[\s\S]*args\.status === "failed"[\s\S]*community_source_ingestion_failed_body_forbidden[\s\S]*sourceIngestedAt: nowMs/,
  "source finalization should require readable ready content, forbid failed bodies, and own terminal timing",
);
assert.match(
  resources,
  /export const ingestCommunitySources(?:: any)? = action\(/,
  "source ingestion should expose one canonical combined action",
);
assert.doesNotMatch(
  resources,
  /export const ingestCommunitySource(?:Links|Files|GoogleDrive|GitHub)(?:: any)? = action\(/,
  "source ingestion must not retain duplicate source-kind action aliases",
);
assert.match(
  resources,
  /finalizeCommunitySourceIngestionInternal[\s\S]*sourceIngestionStatus: args\.status[\s\S]*sourceIngestionLeaseId: undefined[\s\S]*sourceOriginalFilename[\s\S]*writeCommunityResourceBodyContent[\s\S]*syncCommunityResourceMemoryProjection/,
  "source ingestion should persist extracted text and keep canonical memory projections in sync",
);
assert.match(
  resources,
  /compactCommunityResourceBodyStorage[\s\S]*writeCommunityResourceBodyContent[\s\S]*resourceUpdatedAt: row\.updatedAt/,
  "body-storage compaction should move legacy bodies without making old resources look newly edited",
);
assert.match(
  resources,
  /const nextSourceIngestionKind = Object\.prototype\.hasOwnProperty\.call\(payload, "source_ingestion_kind"\)[\s\S]*fileChanged[\s\S]*urlChanged[\s\S]*normalizeResourceSourceIngestionKind\(\{[\s\S]*\.\.\.existing[\s\S]*sourceRevisionChanged[\s\S]*sourceIngestionLeaseId: undefined[\s\S]*sourceIngestionAttempt: undefined/,
  "generic resource edits should preserve source kind while invalidating stale ingestion ownership when the source changes",
);
assert.doesNotMatch(
  resources,
  /buildPageDraftBodyFromSource/,
  "source ingestion must not retain the obsolete one-source page copier",
);
assert.doesNotMatch(
  http,
  /registerCommunitySourceIntegrationRoutes/,
  "the GitHub and Google Drive callback routes stay unmounted",
);

assert.match(
  gateway,
  /(?=[\s\S]*communityResources:generateCommunityResourceSourceUploadUrl)(?=[\s\S]*uploadCloudCommunityResourceSourceFile)(?=[\s\S]*getCloudCommunitySourceCrawlerStatus[\s\S]*client\.query\("communityResources:getCommunitySourceCrawlerStatus" as any)(?=[\s\S]*crawlCloudCommunitySourceRoot[\s\S]*client\.action\("communityResources:crawlCommunitySourceRoot" as any)(?=[\s\S]*getCloudCommunitySourceCrawlJob[\s\S]*client\.query\("communityResources:getCommunitySourceCrawlJob" as any)(?=[\s\S]*listCloudCommunitySourceCrawlJobs[\s\S]*communityResources:listCommunitySourceCrawlJobs)(?=[\s\S]*ingestCloudCommunitySources[\s\S]*client\.action\("communityResources:ingestCommunitySources" as any)(?=[\s\S]*listCloudCommunityLaunchKnowledgeSources[\s\S]*communityResources:listCommunityLaunchKnowledgeSources)/,
  "web gateway should call the source upload, crawler and ingestion actions",
);
assert.match(
  gateway,
  /ingestCloudCommunitySources[\s\S]*retryFailed\?: boolean[\s\S]*retryFailed: params\.retryFailed === true/,
  "the source gateway should make failed-source retry an explicit caller choice",
);
assert.match(
  resourceController,
  /ingestCloudCommunitySources\(\{[\s\S]*retryFailed: input\.retryExisting === true/,
  "only the explicit retry UI path should retry historical failed sources",
);
assert.match(
  sourceIntake,
  /const failedCount = result\.ingestion\?\.failed_sources \?\? 0/,
  "source intake feedback should use persisted failed-source truth",
);
console.log("community_source_ingestion_contract_proof: ok");
