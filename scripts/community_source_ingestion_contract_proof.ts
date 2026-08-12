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
const sourceIntegrationHttp = read("convex/httpCommunitySourceIntegrations.ts");
const http = read("convex/http.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const sourceCrawler = read("shared/communitySourceCrawler.ts");
const sourceCrawlerServicePath = join(root, "services/community-source-crawler/app.py");
const app = read("apps/web/src/App.tsx");

assert.match(
  packageJson,
  /"check:community-source-ingestion-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_source_ingestion_contract_proof\.ts"/,
  "source ingestion proof should be wired into package scripts",
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
  /userSourceIntegrationConnections:[\s\S]*provider: v\.union\(v\.literal\("google_drive"\), v\.literal\("github"\)\)[\s\S]*authKind: v\.literal\("oauth_tokens"\)[\s\S]*encryptedSecretHex:[\s\S]*secretIvHex:[\s\S]*secretVersion:[\s\S]*accountLogin:[\s\S]*accessTokenExpiresAt:[\s\S]*\.index\("by_user_provider", \["userId", "provider"\]\)/,
  "source integrations should store Drive and GitHub OAuth tokens as encrypted per-user connections",
);
assert.match(
  schema,
  /userSourceIntegrationAuthStates:[\s\S]*provider: v\.union\(v\.literal\("google_drive"\), v\.literal\("github"\)\)[\s\S]*communityId:[\s\S]*codeVerifier:[\s\S]*redirectUri:[\s\S]*callbackCodeEncryptedHex:[\s\S]*callbackCodeIvHex:[\s\S]*finalizeTokenHash:[\s\S]*\.index\("by_state", \["state"\]\)/,
  "source integration OAuth state should persist verifier and callback evidence without storing plaintext codes",
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
  /saveCommunitySourceCrawlPagesInternal = internalMutation\(\{[\s\S]*communitySourceCrawlerPageArg[\s\S]*requireCommunityManager[\s\S]*by_community_role_status[\s\S]*communitySourceCrawlerUrlAliases\(maybeSafeSourceCrawlerUrl, source\.url\)[\s\S]*planCommunitySourceCrawlerPageSave[\s\S]*existingSourcesByAlias: existingByUrl[\s\S]*seenAliases: seenUrls[\s\S]*decision\.action === "skip"[\s\S]*decision\.action === "update_existing"[\s\S]*role: "source"[\s\S]*status: "review"[\s\S]*sourceIngestionStatus: "ready"[\s\S]*sourceIngestionKind: "url"[\s\S]*writeCommunityResourceBodyContent[\s\S]*syncCommunityResourceMemoryProjection/,
  "source crawl pages should dedupe root/redirect URL aliases and persist canonical ready URL source rows through the memory lifecycle",
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
assert.match(
  resources,
  /const urlSources = sources\.filter\(isPlainUrlSource\)[\s\S]*const fileSources = sources\.filter\(isPlainFileSource\)[\s\S]*if \(sourceKind === "url"\) return isPlainUrlSource\(row\)[\s\S]*if \(sourceKind === "file"\) return isPlainFileSource\(row\)/,
  "link-only and file-only ingestion should use exclusive manual source filters",
);
assert.match(
  resources,
  /function countPendingSourceIngestion[\s\S]*pending_url_sources[\s\S]*pending_file_sources[\s\S]*pending_google_drive_sources[\s\S]*pending_github_sources/,
  "source ingestion should count pending work in the requested source scope",
);
assert.match(
  resources,
  /runCommunitySourceIngestion[\s\S]*const invalidMessage[\s\S]*status: "failed"[\s\S]*const remainingPendingSources = countPendingSourceIngestion\(after, args\.sourceKind\)[\s\S]*const ok = readySources > 0 && failed === 0 && remainingPendingSources === 0[\s\S]*source_ingestion_partial_failure[\s\S]*source_ingestion_incomplete/,
  "source ingestion should fail the action result when selected sources fail or remain pending",
);
assert.match(
  resources,
  /export const patchCommunitySourceIngestionInternal = internalMutation\(/,
  "source ingestion should patch readiness through an internal mutation",
);
assert.doesNotMatch(
  resources,
  /ctx\.db\.insert\("communityResourceModules"[\s\S]{0,500}descriptionMd:\s*null/,
  "community resource module scaffolds must omit empty descriptions instead of writing null into an optional string field",
);
assert.match(
  resources,
  /patchCommunitySourceIngestionInternal = internalMutation\([\s\S]*if \(!existing\) return null[\s\S]*if \(!updated\) return null/,
  "source ingestion patching should tolerate source rows removed while an ingestion run is in flight",
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
  /sourceIngestionStatus: args\.status[\s\S]*sourceOriginalFilename[\s\S]*writeCommunityResourceBodyContent[\s\S]*syncCommunityResourceMemoryProjection/,
  "source ingestion should persist extracted text and keep canonical memory projections in sync",
);
assert.match(
  resources,
  /compactCommunityResourceBodyStorage[\s\S]*writeCommunityResourceBodyContent[\s\S]*resourceUpdatedAt: row\.updatedAt/,
  "body-storage compaction should move legacy bodies without making old resources look newly edited",
);
assert.match(
  resources,
  /const nextSourceIngestionKind = Object\.prototype\.hasOwnProperty\.call\(payload, "source_ingestion_kind"\)[\s\S]*fileChanged[\s\S]*urlChanged[\s\S]*normalizeResourceSourceIngestionKind\(\{[\s\S]*\.\.\.existing/,
  "generic resource edits should preserve existing integration ingestion kind unless the source payload changes",
);
assert.doesNotMatch(
  resources,
  /buildPageDraftBodyFromSource/,
  "source ingestion must not retain the obsolete one-source page copier",
);
assert.match(
  resources,
  /GOOGLE_DRIVE_OAUTH_AUTHORIZE_URL = "https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth"[\s\S]*GOOGLE_DRIVE_OAUTH_TOKEN_URL = "https:\/\/oauth2\.googleapis\.com\/token"[\s\S]*GOOGLE_DRIVE_API_BASE_URL = "https:\/\/www\.googleapis\.com\/drive\/v3"[\s\S]*https:\/\/www\.googleapis\.com\/auth\/drive\.readonly/,
  "Google Drive source integration should use Google's OAuth and Drive API endpoints with readonly scope",
);
assert.match(
  resources,
  /ARX_GOOGLE_DRIVE_OAUTH_CALLBACK_BASE_URL[\s\S]*ARX_APP_OAUTH_CALLBACK_BASE_URL[\s\S]*CONVEX_SITE_URL[\s\S]*\/source-integrations\/google-drive\/callback/,
  "Google Drive OAuth should resolve an explicit Convex HTTP callback origin",
);
assert.match(
  resources,
  /beginGoogleDriveSourceOAuth = action\([\s\S]*resolveAuthenticatedActionUserId[\s\S]*requireCommunityManagerForAction[\s\S]*code_challenge[\s\S]*code_challenge_method", "S256"[\s\S]*access_type", "offline"/,
  "starting Google Drive OAuth should be authenticated, manager-gated, and PKCE/offline-token based",
);
assert.match(
  resources,
  /completeGoogleDriveSourceOAuthCallbackInternal = internalAction\([\s\S]*encryptSecret\(code\)[\s\S]*finalizeTokenHash: await sha256HexText\(finalizeToken\)[\s\S]*buildSourceIntegrationRedirectUrl/,
  "Google Drive OAuth callback should encrypt the authorization code and return only a one-shot finalize token",
);
assert.match(
  resources,
  /finalizeGoogleDriveSourceOAuth = action\([\s\S]*sourceCommunityId[\s\S]*decryptStoredSecret[\s\S]*exchangeGoogleDriveCodeForTokens[\s\S]*encryptSecret\(encodeStoredGoogleDriveAuth\(tokenBundle\)\)[\s\S]*upsertGoogleDriveSourceConnectionInternal[\s\S]*community_id: sourceCommunityId/,
  "Google Drive OAuth finalize should exchange, encrypt, store tokens server-side only, and return source community identity",
);
assert.match(
  resources,
  /resolveFreshGoogleDriveAccessToken[\s\S]*decryptStoredSecret\(row\)[\s\S]*refreshGoogleDriveTokens[\s\S]*encryptSecret\(encodeStoredGoogleDriveAuth\(refreshed\)\)/,
  "Google Drive API calls should refresh expiring encrypted tokens without exposing raw tokens to the web",
);
assert.match(
  resources,
  /disconnectGoogleDriveSourceConnection = mutation\([\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityManagerForAction\(ctx, userId, args\.communityId\)[\s\S]*getGoogleDriveConnectionRow\(ctx, userId\)[\s\S]*ctx\.db\.delete\(row\._id as any\)[\s\S]*toPublicGoogleDriveConnection\(null\)/,
  "Google Drive disconnect should be manager-gated and delete only the stored credential connection",
);
assert.match(
  resources,
  /disconnectGitHubSourceConnection = mutation\([\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityManagerForAction\(ctx, userId, args\.communityId\)[\s\S]*getGitHubConnectionRow\(ctx, userId\)[\s\S]*ctx\.db\.delete\(row\._id as any\)[\s\S]*toPublicGitHubConnection\(null\)/,
  "GitHub disconnect should be manager-gated and delete only the stored credential connection",
);
assert.match(
  resources,
  /listGoogleDriveSourceFiles = action\([\s\S]*requireCommunityManagerForAction[\s\S]*supportsAllDrives[\s\S]*includeItemsFromAllDrives[\s\S]*isSupportedGoogleDriveSourceMimeType/,
  "Google Drive file listing should be manager-gated, shared-drive aware, and limited to readable source types",
);
assert.match(
  resources,
  /listGoogleDriveSourceFiles = action\([\s\S]*folderId: v\.optional\(v\.string\(\)\)[\s\S]*pageToken: v\.optional\(v\.string\(\)\)[\s\S]*nextPageToken,files\(id,name,mimeType,webViewLink,modifiedTime,size\)[\s\S]*if \(pageToken\) url\.searchParams\.set\("pageToken", pageToken\)[\s\S]*kind: isGoogleDriveFolderMimeType\(file\.mimeType\) \? "folder" : "file"[\s\S]*importable:[\s\S]*next_page_token:/,
  "Google Drive file listing should expose folder navigation, cursor pagination, and file-only importability",
);
assert.match(
  gateway,
  /CloudGoogleDriveSourceFile = \{[\s\S]*kind: "file" \| "folder"[\s\S]*importable: boolean[\s\S]*CloudGoogleDriveSourceFileListResult = \{[\s\S]*folder_id: string \| null[\s\S]*query: string \| null[\s\S]*next_page_token: string \| null[\s\S]*listCloudCommunityGoogleDriveSourceFiles[\s\S]*folderId\?: string \| null[\s\S]*pageToken\?: string \| null[\s\S]*folderId: String\(params\.folderId[\s\S]*pageToken: String\(params\.pageToken/,
  "Google Drive gateway should preserve folder, query, pagination, and importability metadata",
);
assert.match(
  resources,
  /importGoogleDriveSourceFiles = action\([\s\S]*requireCommunityManagerForAction[\s\S]*for \(const fileId of fileIds\)[\s\S]*try \{[\s\S]*getCommunitySourceByExternalIdInternal[\s\S]*insertGoogleDriveSourceResourceInternal[\s\S]*catch \(error\)[\s\S]*failures\.push[\s\S]*ok: failed === 0/,
  "Google Drive file import should be manager-gated, dedupe by external file identity, and report per-file failures",
);
const googleDriveImportSection =
  resources.match(/export const importGoogleDriveSourceFiles[\s\S]*?\n}\);\n\nexport const getGitHubSourceConnectionStatus/)?.[0] ?? "";
assert.doesNotMatch(
  googleDriveImportSection,
  /const resources: unknown\[\]|resources\.push|resources,\s*\n/,
  "Google Drive import should not return dead resource payloads that the web gateway ignores",
);
assert.match(
  resources,
  /insertGoogleDriveSourceResourceInternal[\s\S]*role: "source"[\s\S]*status: "review"[\s\S]*sourceIngestionStatus: "queued"[\s\S]*sourceIngestionKind: "google_drive"[\s\S]*sourceExternalProvider: GOOGLE_DRIVE_SOURCE_PROVIDER[\s\S]*sourceExternalConnectionUserId: args\.userId[\s\S]*sourceExternalId:/,
  "Google Drive imports should create canonical queued source resources with external identity and credential authority",
);
assert.match(
  resources,
  /getCommunitySourceIngestionStateInternal[\s\S]*google_drive_sources:[\s\S]*pending_google_drive_sources:[\s\S]*sourceExternalProvider:[\s\S]*sourceExternalConnectionUserId: normalizeIdValue\(row\.sourceExternalConnectionUserId \?\? row\.createdByUserId\)[\s\S]*sourceExternalId:[\s\S]*sourceExternalMimeType:/,
  "source ingestion state should count and return queued Google Drive source candidates",
);
assert.match(
  resources,
  /runCommunitySourceIngestion[\s\S]*externalConnectionUserId[\s\S]*kind === "google_drive"[\s\S]*extractSourceTextFromGoogleDrive[\s\S]*userId: externalConnectionUserId \|\| actingUserId[\s\S]*buildIngestedGoogleDriveSourceBody[\s\S]*kind: "google_drive"[\s\S]*pending_google_drive_sources:/,
  "source ingestion should read Drive file text with stored credential authority and persist ready Google Drive source bodies",
);
assert.match(
  resources,
  /GITHUB_OAUTH_AUTHORIZE_URL = "https:\/\/github\.com\/login\/oauth\/authorize"[\s\S]*GITHUB_OAUTH_TOKEN_URL = "https:\/\/github\.com\/login\/oauth\/access_token"[\s\S]*GITHUB_API_BASE_URL = "https:\/\/api\.github\.com"[\s\S]*Alpha-only OAuth fallback[\s\S]*GITHUB_SOURCE_SCOPES = \["read:user", "user:email", "repo"\]/,
  "GitHub source integration should flag broad repository OAuth as alpha-only",
);
assert.match(
  resources,
  /ARX_GITHUB_OAUTH_CALLBACK_BASE_URL[\s\S]*ARX_APP_OAUTH_CALLBACK_BASE_URL[\s\S]*CONVEX_SITE_URL[\s\S]*\/source-integrations\/github\/callback/,
  "GitHub OAuth should resolve an explicit Convex HTTP callback origin",
);
assert.match(
  resources,
  /beginGitHubSourceOAuth = action\([\s\S]*resolveAuthenticatedActionUserId[\s\S]*requireCommunityManagerForAction[\s\S]*codeVerifier[\s\S]*codeChallenge[\s\S]*GITHUB_SOURCE_SCOPES[\s\S]*code_challenge[\s\S]*code_challenge_method", "S256"[\s\S]*allow_signup/,
  "starting GitHub OAuth should be authenticated, manager-gated, and PKCE based",
);
assert.match(
  resources,
  /completeGitHubSourceOAuthCallbackInternal = internalAction\([\s\S]*encryptSecret\(code\)[\s\S]*finalizeTokenHash: await sha256HexText\(finalizeToken\)[\s\S]*buildSourceIntegrationRedirectUrl/,
  "GitHub OAuth callback should encrypt the authorization code and return only a one-shot finalize token",
);
assert.match(
  resources,
  /finalizeGitHubSourceOAuth = action\([\s\S]*sourceCommunityId[\s\S]*decryptStoredSecret[\s\S]*exchangeGitHubCodeForToken[\s\S]*codeVerifier: row\.codeVerifier[\s\S]*fetchGitHubViewer[\s\S]*encryptSecret\(encodeStoredGitHubAuth\(tokenBundle\)\)[\s\S]*upsertGitHubSourceConnectionInternal[\s\S]*community_id: sourceCommunityId/,
  "GitHub OAuth finalize should exchange, validate, encrypt, store tokens server-side only, and return source community identity",
);
assert.match(
  resources,
  /listGitHubSourceRepositories = action\([\s\S]*requireCommunityManagerForAction[\s\S]*\/user\/repos[\s\S]*affiliation", "owner,collaborator,organization_member"/,
  "GitHub repository listing should be manager-gated and scoped to repositories the connected user can access",
);
assert.match(
  resources,
  /listGitHubSourceFiles = action\([\s\S]*requireCommunityManagerForAction[\s\S]*\/git\/trees\/[\s\S]*recursive", "1"[\s\S]*const readableFiles[\s\S]*mapGitHubFileCandidate[\s\S]*slice\(0, GITHUB_SOURCE_FILE_LIST_LIMIT\)[\s\S]*truncated: payload\.truncated === true \|\| readableFiles\.length > GITHUB_SOURCE_FILE_LIST_LIMIT[\s\S]*file_limit: GITHUB_SOURCE_FILE_LIST_LIMIT/,
  "GitHub file listing should be manager-gated, limited to readable source file paths, and disclose tree/list truncation",
);
assert.match(
  resources,
  /importGitHubSourceFiles = action\([\s\S]*requireCommunityManagerForAction[\s\S]*for \(const externalId of fileIds\)[\s\S]*try \{[\s\S]*getCommunitySourceByExternalIdInternal[\s\S]*insertGitHubSourceResourceInternal[\s\S]*catch \(error\)[\s\S]*failures\.push[\s\S]*ok: failed === 0/,
  "GitHub file import should be manager-gated, dedupe by external file identity, and report per-file failures",
);
assert.match(
  resources,
  /insertGitHubSourceResourceInternal[\s\S]*role: "source"[\s\S]*status: "review"[\s\S]*sourceIngestionStatus: "queued"[\s\S]*sourceIngestionKind: "github"[\s\S]*sourceExternalProvider: GITHUB_SOURCE_PROVIDER[\s\S]*sourceExternalConnectionUserId: args\.userId[\s\S]*sourceExternalId:/,
  "GitHub imports should create canonical queued source resources with external identity and credential authority",
);
assert.match(
  resources,
  /getCommunitySourceIngestionStateInternal[\s\S]*github_sources:[\s\S]*pending_github_sources:[\s\S]*parseGitHubFileExternalId/,
  "source ingestion state should count and return queued GitHub source candidates",
);
assert.match(
  resources,
  /runCommunitySourceIngestion[\s\S]*kind === "github"[\s\S]*extractSourceTextFromGitHub[\s\S]*userId: externalConnectionUserId \|\| actingUserId[\s\S]*buildIngestedGitHubSourceBody[\s\S]*kind: "github"[\s\S]*pending_github_sources:/,
  "source ingestion should read GitHub file text with stored credential authority and persist ready GitHub source bodies",
);
const publicGoogleDriveConnectionSection =
  resources.match(/function toPublicGoogleDriveConnection[\s\S]*?function toPublicGitHubConnection/)?.[0] ?? "";
assert.match(
  publicGoogleDriveConnectionSection,
  /connected:[\s\S]*email:[\s\S]*account_id:[\s\S]*scope:[\s\S]*access_token_expires_at:/,
  "Google Drive public connection status should expose only connection metadata",
);
assert.doesNotMatch(
  publicGoogleDriveConnectionSection,
  /\b(accessToken|refreshToken|encryptedSecretHex|secretIvHex)\b/,
  "Google Drive public connection status must not return raw or encrypted OAuth tokens",
);
const publicGitHubConnectionSection =
  resources.match(/function toPublicGitHubConnection[\s\S]*?async function resolveCommunityLaunchKnowledgeSourceCredentialStatus/)?.[0] ?? "";
assert.match(
  publicGitHubConnectionSection,
  /connected:[\s\S]*email:[\s\S]*account_id:[\s\S]*login:[\s\S]*scope:[\s\S]*access_token_expires_at:/,
  "GitHub public connection status should expose only connection metadata",
);
assert.doesNotMatch(
  publicGitHubConnectionSection,
  /\b(accessToken|encryptedSecretHex|secretIvHex)\b/,
  "GitHub public connection status must not return raw or encrypted OAuth tokens",
);
assert.match(
  sourceIntegrationHttp,
  /path: "\/source-integrations\/google-drive\/callback"[\s\S]*completeGoogleDriveSourceOAuthCallbackInternal[\s\S]*redirectResponse/,
  "Convex HTTP should register the Google Drive OAuth callback and redirect back to the app",
);
assert.match(
  sourceIntegrationHttp,
  /path: "\/source-integrations\/github\/callback"[\s\S]*completeGitHubSourceOAuthCallbackInternal[\s\S]*redirectResponse/,
  "Convex HTTP should register the GitHub OAuth callback and redirect back to the app",
);
assert.match(
  http,
  /registerCommunitySourceIntegrationRoutes\(\{[\s\S]*http,[\s\S]*httpAction/,
  "main Convex HTTP router should mount source integration callback routes",
);

assert.match(
  gateway,
  /(?=[\s\S]*communityResources:generateCommunityResourceSourceUploadUrl)(?=[\s\S]*uploadCloudCommunityResourceSourceFile)(?=[\s\S]*getCloudCommunitySourceCrawlerStatus[\s\S]*client\.query\("communityResources:getCommunitySourceCrawlerStatus" as any)(?=[\s\S]*crawlCloudCommunitySourceRoot[\s\S]*client\.action\("communityResources:crawlCommunitySourceRoot" as any)(?=[\s\S]*getCloudCommunitySourceCrawlJob[\s\S]*client\.query\("communityResources:getCommunitySourceCrawlJob" as any)(?=[\s\S]*listCloudCommunitySourceCrawlJobs[\s\S]*communityResources:listCommunitySourceCrawlJobs)(?=[\s\S]*ingestCloudCommunitySources[\s\S]*client\.action\("communityResources:ingestCommunitySources" as any)(?=[\s\S]*listCloudCommunityLaunchKnowledgeSources[\s\S]*communityResources:listCommunityLaunchKnowledgeSources)(?=[\s\S]*beginCloudCommunityGoogleDriveSourceOAuth[\s\S]*communityResources:beginGoogleDriveSourceOAuth)(?=[\s\S]*beginCloudCommunityGitHubSourceOAuth[\s\S]*communityResources:beginGitHubSourceOAuth)(?=[\s\S]*disconnectCloudCommunityGoogleDriveSourceConnection[\s\S]*communityResources:disconnectGoogleDriveSourceConnection)(?=[\s\S]*disconnectCloudCommunityGitHubSourceConnection[\s\S]*communityResources:disconnectGitHubSourceConnection)(?=[\s\S]*finalizeCloudCommunityGoogleDriveSourceOAuth[\s\S]*communityResources:finalizeGoogleDriveSourceOAuth)(?=[\s\S]*finalizeCloudCommunityGitHubSourceOAuth[\s\S]*communityResources:finalizeGitHubSourceOAuth)(?=[\s\S]*listCloudCommunityGoogleDriveSourceFiles[\s\S]*communityResources:listGoogleDriveSourceFiles)(?=[\s\S]*listCloudCommunityGitHubSourceRepositories[\s\S]*communityResources:listGitHubSourceRepositories)(?=[\s\S]*listCloudCommunityGitHubSourceFiles[\s\S]*communityResources:listGitHubSourceFiles)(?=[\s\S]*file_limit:[\s\S]*payload\?\.file_limit)(?=[\s\S]*importCloudCommunityGoogleDriveSourceFiles[\s\S]*communityResources:importGoogleDriveSourceFiles)(?=[\s\S]*importCloudCommunityGitHubSourceFiles[\s\S]*communityResources:importGitHubSourceFiles)/,
  "web gateway should call source ingestion and Drive/GitHub integration actions",
);
assert.match(
  gateway,
  /finalizeCloudCommunityGoogleDriveSourceOAuth[\s\S]*community_id:[\s\S]*payload\?\.community_id[\s\S]*finalizeCloudCommunityGitHubSourceOAuth[\s\S]*community_id:[\s\S]*payload\?\.community_id/,
  "web gateway should preserve source integration OAuth source community identity",
);
assert.match(
  gateway,
  /importCloudCommunityGoogleDriveSourceFiles[\s\S]*failed:[\s\S]*failures: Array\.isArray\(payload\?\.failures\)[\s\S]*importCloudCommunityGitHubSourceFiles[\s\S]*failed:[\s\S]*failures: Array\.isArray\(payload\?\.failures\)/,
  "web gateway should preserve Drive/GitHub per-file import failures",
);
console.log("community_source_ingestion_contract_proof: ok");
