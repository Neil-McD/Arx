import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const community = read("convex/community.ts");
const experience = read("convex/communityExperience.ts");
const sourceIntegrationHttp = read("convex/httpCommunitySourceIntegrations.ts");
const http = read("convex/http.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const sourceCrawler = read("shared/communitySourceCrawler.ts");
const sourceCrawlerService = read("services/community-source-crawler/app.py");
const app = read("apps/web/src/App.tsx");
const sourceOAuth = read("apps/web/src/communityLaunchKnowledgeSourceOAuth.ts");
const launchSetupRoute = read("apps/web/src/communityLaunchSetupRoute.ts");
const modal = read("apps/web/src/components/WebCommunityLaunchSetupModal.tsx");
const architect = read("convex/communityWikiArchitect.ts");
const prompt = read("shared/communityWikiArchitectPrompt.ts");

assert.match(
  packageJson,
  /"check:community-source-ingestion-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_source_ingestion_contract_proof\.ts"/,
  "source ingestion proof should be wired into package scripts",
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
  /communitySourceCrawlJobs:[\s\S]*provider: v\.union\(v\.literal\("simple"\), v\.literal\("crawl4ai"\)\)[\s\S]*rootUrl: v\.string\(\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("queued"\)[\s\S]*v\.literal\("crawling"\)[\s\S]*v\.literal\("saving_sources"\)[\s\S]*v\.literal\("ready"\)[\s\S]*v\.literal\("failed"\)[\s\S]*sourceResourceIds:[\s\S]*\.index\("by_community_status_createdAt", \["communityId", "status", "createdAt"\]\)/,
  "source crawling should persist durable crawl job state with status, limits, counts, and saved source ids",
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
assert.match(
  sourceCrawlerService,
  /extract_virtual_sections[\s\S]*"unit_kind": "virtual_section"[\s\S]*"capture_method": "clickable_navigation"[\s\S]*source_units[\s\S]*virtual_page_count/,
  "SPA/course virtual navigation should return separate source units instead of only a merged page body",
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
  resources,
  /COMMUNITY_RESOURCE_SOURCE_INGESTION_DENIED_HOSTNAME_SUFFIXES[\s\S]*"\.internal"[\s\S]*"\.arpa"[\s\S]*"\.invalid"/,
  "URL ingestion should deny local-only hostname suffixes",
);
assert.match(
  resources,
  /requireSafeSourceIngestionUrl[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_https_required[\s\S]*parsed\.username \|\| parsed\.password[\s\S]*community_source_url_credentials_not_supported[\s\S]*parsed\.port && parsed\.port !== "443"[\s\S]*community_source_url_port_not_supported/,
  "URL ingestion should only fetch public-shaped HTTPS URLs without credentials or custom ports",
);
assert.match(
  resources,
  /isDeniedSourceIngestionHostname[\s\S]*localhost[\s\S]*metadata\.google\.internal[\s\S]*isLiteralIpv4[\s\S]*hasEmbeddedPrivateIpv4[\s\S]*COMMUNITY_RESOURCE_SOURCE_INGESTION_DENIED_HOSTNAME_SUFFIXES/,
  "URL ingestion must reject local, private, literal IP, and embedded-private-IP source targets",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV = "ARX_SOURCE_URL_FETCHER_ENDPOINT"[\s\S]*COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET"/,
  "URL ingestion should require a configured first-party fetcher endpoint",
);
assert.match(
  resources,
  /resolveSourceUrlFetcherEndpoint[\s\S]*community_source_url_fetcher_not_configured[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_fetcher_invalid/,
  "URL ingestion fetcher should fail closed unless a valid HTTPS broker is configured",
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
  /export type CommunitySourceCrawlerProvider = "simple" \| "crawl4ai"[\s\S]*export type CommunitySourceCrawlJobStatus = "queued" \| "crawling" \| "saving_sources" \| "ready" \| "failed"[\s\S]*export type CommunitySourcePageResult = \{[\s\S]*requested_url: string[\s\S]*final_url: string[\s\S]*canonical_url: string[\s\S]*root_url: string[\s\S]*parent_url: string \| null[\s\S]*depth: number[\s\S]*markdown: string[\s\S]*links: CommunitySourcePageLink\[\][\s\S]*status: CommunitySourcePageStatus[\s\S]*error: string \| null/,
  "source crawling should use a stable PolyNet-owned page result contract",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_SOURCE_CRAWLER_PROVIDER_ENV = "ARX_SOURCE_CRAWLER_PROVIDER"[\s\S]*COMMUNITY_RESOURCE_CRAWL4AI_ENDPOINT_ENV = "ARX_CRAWL4AI_ENDPOINT"[\s\S]*COMMUNITY_RESOURCE_CRAWL4AI_TOKEN_ENV = "ARX_CRAWL4AI_TOKEN"/,
  "source crawling should be configured through first-party provider and Crawl4AI env vars",
);
assert.match(
  resources,
  /normalizeSourceCrawlerProvider[\s\S]*raw === "simple"[\s\S]*raw === "crawl4ai"[\s\S]*community_source_crawler_provider_invalid/,
  "source crawler provider should default to simple and fail closed for unknown providers",
);
assert.match(
  resources,
  /getCommunitySourceCrawlerStatusValue[\s\S]*provider: "simple"[\s\S]*configured: true[\s\S]*full_site_crawl_available: false[\s\S]*default_max_pages: 1[\s\S]*max_depth: 0[\s\S]*provider: "crawl4ai"[\s\S]*configured[\s\S]*full_site_crawl_available: configured[\s\S]*default_max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES[\s\S]*max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES[\s\S]*community_source_crawl4ai_not_configured/,
  "source crawler status should expose explicit configured/full-site-crawl/capacity truth without leaking secrets",
);
assert.match(
  resources,
  /COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_RESPONSE_BYTES = 10_000_000[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES = 75[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES = 100[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH = 3[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH = 4/,
  "source crawler should use wiki-grade bounded defaults and a larger crawler response budget",
);
assert.match(
  resources,
  /resolveCrawl4AiEndpoint[\s\S]*community_source_crawl4ai_endpoint_not_configured[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_crawl4ai_endpoint_invalid[\s\S]*parsed\.port && parsed\.port !== "443"/,
  "Crawl4AI adapter should require a configured HTTPS backend endpoint",
);
assert.match(
  resources,
  /crawl4AiHeaders[\s\S]*COMMUNITY_RESOURCE_CRAWL4AI_TOKEN_ENV[\s\S]*community_source_crawl4ai_token_not_configured[\s\S]*authorization: `Bearer \$\{token\}`/,
  "Crawl4AI adapter should require backend bearer authentication",
);
assert.match(
  resources,
  /crawlSourceRootWithCrawl4AI[\s\S]*fetchSourceUrlViaConfiguredFetcher\(args\.rootUrl\)[\s\S]*crawlerRootUrl = requireSafeSourceIngestionUrl\(preflight\.finalUrl\)[\s\S]*sourceCrawlerEndpointUrl\("\/crawl"\)[\s\S]*urls: \[crawlerRootUrl\][\s\S]*"CrawlerRunConfig"[\s\S]*markdown_generator_options: \{ include_links: true \}[\s\S]*"BFSDeepCrawlStrategy"[\s\S]*max_depth: args\.maxDepth[\s\S]*max_pages: args\.maxPages[\s\S]*include_external: false/,
  "Crawl4AI adapter should preflight the root through the safe fetch broker, then use bounded same-origin BFS crawling and markdown output behind the backend",
);
assert.match(
  resources,
  /community_source_crawl4ai_failed_\$\{response\.status\}[\s\S]*readResponseTextBounded\([\s\S]*response,[\s\S]*COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_RESPONSE_BYTES/,
  "Crawl4AI adapter should allow larger bounded crawler payloads than single-page URL fetches",
);
assert.match(
  resources,
  /normalizeCrawl4AiLinks[\s\S]*communitySourceCrawlerUrlInRootScope\(\{[\s\S]*rootUrl,[\s\S]*candidateUrl: url,[\s\S]*normalizeUrl: maybeSafeSourceCrawlerUrl[\s\S]*normalizeCrawl4AiSourcePageResult[\s\S]*communitySourceCrawlerUrlInRootScope\(\{[\s\S]*rootUrl: args\.rootUrl,[\s\S]*candidateUrl: finalUrl,[\s\S]*parentUrl = communitySourceCrawlerUrlInRootScope/,
  "Crawl4AI result normalization should enforce same-origin plus root-path scope for pages, parents, and links",
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
  /saveCommunitySourceCrawlPagesInternal = internalMutation\(\{[\s\S]*communitySourceCrawlerPageArg[\s\S]*requireCommunityManager[\s\S]*by_community_role_status[\s\S]*communitySourceCrawlerUrlAliases\(maybeSafeSourceCrawlerUrl, source\.url\)[\s\S]*planCommunitySourceCrawlerPageSave[\s\S]*existingSourcesByAlias: existingByUrl[\s\S]*seenAliases: seenUrls[\s\S]*decision\.action === "skip"[\s\S]*decision\.action === "update_existing"[\s\S]*role: "source"[\s\S]*status: "review"[\s\S]*sourceIngestionStatus: "ready"[\s\S]*sourceIngestionKind: "url"[\s\S]*writeCommunityResourceBodyContent[\s\S]*upsertArchiveDocumentForResource/,
  "source crawl pages should dedupe root/redirect URL aliases and persist canonical ready URL source rows with large body content and archive sync",
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
assert.doesNotMatch(
  architect,
  /ctx\.db\.insert\("communityResourceModules"[\s\S]{0,500}descriptionMd:[^\n]*\?\?\s*null/,
  "wiki architect module creation must omit empty descriptions instead of writing null into an optional string field",
);
assert.match(
  resources,
  /patchCommunitySourceIngestionInternal = internalMutation\([\s\S]*if \(!existing\) return null[\s\S]*if \(!updated\) return null/,
  "source ingestion patching should tolerate source rows removed while an ingestion run is in flight",
);
assert.match(
  resources,
  /export const ingestCommunitySources(?:: any)? = action\([\s\S]*export const ingestCommunitySourceLinks(?:: any)? = action\([\s\S]*export const ingestCommunitySourceFiles(?:: any)? = action\(/,
  "source ingestion should expose combined, link-only, and file-only actions",
);
assert.match(
  resources,
  /sourceIngestionStatus: args\.status[\s\S]*sourceOriginalFilename[\s\S]*writeCommunityResourceBodyContent[\s\S]*upsertArchiveDocumentForResource/,
  "source ingestion should persist extracted text into content storage and keep archive projection in sync",
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
assert.match(
  resources,
  /createCommunityResourcePageDraftFromSource[\s\S]*communityResourceSourceHasReadyText\(source\)[\s\S]*community_source_resource_not_ready/,
  "page drafts from source should require ingested source text",
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
  experience,
  /(?=[\s\S]*generateCommunityResourceSourceUploadUrl)(?=[\s\S]*disconnectGoogleDriveSourceConnection)(?=[\s\S]*disconnectGitHubSourceConnection)(?=[\s\S]*crawlCommunitySourceRoot)(?=[\s\S]*getCommunitySourceCrawlJob)(?=[\s\S]*getCommunitySourceCrawlerStatus)(?=[\s\S]*ingestCommunitySourceFiles)(?=[\s\S]*ingestCommunitySourceGitHub)(?=[\s\S]*ingestCommunitySourceGoogleDrive)(?=[\s\S]*ingestCommunitySourceLinks)(?=[\s\S]*ingestCommunitySources)(?=[\s\S]*listCommunityLaunchKnowledgeSources)(?=[\s\S]*listCommunitySourceCrawlJobs)/,
  "community experience barrel should expose source ingestion",
);
assert.match(
  community,
  /(?=[\s\S]*generateCommunityResourceSourceUploadUrl as generateCommunityResourceSourceUploadUrlImpl)(?=[\s\S]*disconnectGoogleDriveSourceConnection as disconnectGoogleDriveSourceConnectionImpl)(?=[\s\S]*disconnectGitHubSourceConnection as disconnectGitHubSourceConnectionImpl)(?=[\s\S]*crawlCommunitySourceRoot as crawlCommunitySourceRootImpl)(?=[\s\S]*getCommunitySourceCrawlJob as getCommunitySourceCrawlJobImpl)(?=[\s\S]*getCommunitySourceCrawlerStatus as getCommunitySourceCrawlerStatusImpl)(?=[\s\S]*ingestCommunitySources as ingestCommunitySourcesImpl)(?=[\s\S]*ingestCommunitySourceLinks as ingestCommunitySourceLinksImpl)(?=[\s\S]*ingestCommunitySourceFiles as ingestCommunitySourceFilesImpl)(?=[\s\S]*ingestCommunitySourceGoogleDrive as ingestCommunitySourceGoogleDriveImpl)(?=[\s\S]*ingestCommunitySourceGitHub as ingestCommunitySourceGitHubImpl)(?=[\s\S]*listCommunityLaunchKnowledgeSources as listCommunityLaunchKnowledgeSourcesImpl)(?=[\s\S]*listCommunitySourceCrawlJobs as listCommunitySourceCrawlJobsImpl)(?=[\s\S]*export const beginGoogleDriveSourceOAuth)(?=[\s\S]*export const beginGitHubSourceOAuth)(?=[\s\S]*export const disconnectGoogleDriveSourceConnection)(?=[\s\S]*export const disconnectGitHubSourceConnection)(?=[\s\S]*export const finalizeGoogleDriveSourceOAuth)(?=[\s\S]*export const finalizeGitHubSourceOAuth)(?=[\s\S]*export const crawlCommunitySourceRoot(?:: any)? = crawlCommunitySourceRootImpl)(?=[\s\S]*export const getCommunitySourceCrawlJob)(?=[\s\S]*export const getCommunitySourceCrawlerStatus)(?=[\s\S]*export const listCommunityLaunchKnowledgeSources)(?=[\s\S]*export const listCommunitySourceCrawlJobs)(?=[\s\S]*export const listGoogleDriveSourceFiles)(?=[\s\S]*export const listGitHubSourceFiles)(?=[\s\S]*export const importGoogleDriveSourceFiles)(?=[\s\S]*export const importGitHubSourceFiles)(?=[\s\S]*export const ingestCommunitySourceGoogleDrive(?:: any)? = ingestCommunitySourceGoogleDriveImpl)(?=[\s\S]*export const ingestCommunitySourceGitHub(?:: any)? = ingestCommunitySourceGitHubImpl)/,
  "community API should expose source ingestion",
);
assert.match(
  gateway,
  /(?=[\s\S]*community:generateCommunityResourceSourceUploadUrl)(?=[\s\S]*uploadCloudCommunityResourceSourceFile)(?=[\s\S]*getCloudCommunitySourceCrawlerStatus[\s\S]*client\.query\("community:getCommunitySourceCrawlerStatus" as any)(?=[\s\S]*crawlCloudCommunitySourceRoot[\s\S]*client\.action\("community:crawlCommunitySourceRoot" as any)(?=[\s\S]*getCloudCommunitySourceCrawlJob[\s\S]*client\.query\("community:getCommunitySourceCrawlJob" as any)(?=[\s\S]*listCloudCommunitySourceCrawlJobs[\s\S]*community:listCommunitySourceCrawlJobs)(?=[\s\S]*ingestCloudCommunitySources[\s\S]*client\.action\("community:ingestCommunitySources" as any)(?=[\s\S]*listCloudCommunityLaunchKnowledgeSources[\s\S]*community:listCommunityLaunchKnowledgeSources)(?=[\s\S]*beginCloudCommunityGoogleDriveSourceOAuth[\s\S]*community:beginGoogleDriveSourceOAuth)(?=[\s\S]*beginCloudCommunityGitHubSourceOAuth[\s\S]*community:beginGitHubSourceOAuth)(?=[\s\S]*disconnectCloudCommunityGoogleDriveSourceConnection[\s\S]*community:disconnectGoogleDriveSourceConnection)(?=[\s\S]*disconnectCloudCommunityGitHubSourceConnection[\s\S]*community:disconnectGitHubSourceConnection)(?=[\s\S]*finalizeCloudCommunityGoogleDriveSourceOAuth[\s\S]*community:finalizeGoogleDriveSourceOAuth)(?=[\s\S]*finalizeCloudCommunityGitHubSourceOAuth[\s\S]*community:finalizeGitHubSourceOAuth)(?=[\s\S]*listCloudCommunityGoogleDriveSourceFiles[\s\S]*community:listGoogleDriveSourceFiles)(?=[\s\S]*listCloudCommunityGitHubSourceRepositories[\s\S]*community:listGitHubSourceRepositories)(?=[\s\S]*listCloudCommunityGitHubSourceFiles[\s\S]*community:listGitHubSourceFiles)(?=[\s\S]*file_limit:[\s\S]*payload\?\.file_limit)(?=[\s\S]*importCloudCommunityGoogleDriveSourceFiles[\s\S]*community:importGoogleDriveSourceFiles)(?=[\s\S]*importCloudCommunityGitHubSourceFiles[\s\S]*community:importGitHubSourceFiles)/,
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
assert.match(
  app,
  /handleAddCommunityLaunchKnowledgeLink[\s\S]*source_ingestion_status: "queued"[\s\S]*source_ingestion_kind: "url"[\s\S]*refreshCommunityLaunchKnowledgeProjectionBestEffort\(\{[\s\S]*includeResources: true/,
  "launch links should enter the source inbox as queued URL sources and refresh focused saved link rows",
);
assert.match(
  app,
  /refreshCommunityLaunchKnowledgeProjectionBestEffort[\s\S]*try \{[\s\S]*loadCommunityLaunchKnowledgeSources\(communityId, activeSession\)[\s\S]*catch \(error\) \{[\s\S]*console\.warn\("\[community-launch\] failed to refresh knowledge projection after source write:", error\);/,
  "launch source writes should not report successful saves/imports as failed when the follow-up projection refresh fails",
);
assert.match(
  app,
  /handleImportCommunityLaunchGoogleDriveFiles[\s\S]*const result = await importCloudCommunityGoogleDriveSourceFiles[\s\S]*refreshCommunityLaunchKnowledgeProjectionBestEffort\(\{[\s\S]*communityId: community\.id,[\s\S]*session,[\s\S]*\}\);[\s\S]*return result;/,
  "Drive imports should return the import result after a best-effort projection refresh",
);
assert.match(
  app,
  /handleImportCommunityLaunchGitHubFiles[\s\S]*const result = await importCloudCommunityGitHubSourceFiles[\s\S]*refreshCommunityLaunchKnowledgeProjectionBestEffort\(\{[\s\S]*communityId: community\.id,[\s\S]*session,[\s\S]*\}\);[\s\S]*return result;/,
  "GitHub imports should return the import result after a best-effort projection refresh",
);
assert.match(
  app,
  /handleAddCommunityLaunchKnowledgeLink[\s\S]*parsedUrl\.protocol !== "https:"[\s\S]*Add https source links\./,
  "launch links should only accept HTTPS because URL ingestion is HTTPS-only",
);
assert.doesNotMatch(
  app,
  /Add http or https source links\./,
  "launch links should not advertise HTTP support",
);
assert.match(
  app,
  /handleAddCommunityLaunchKnowledgeFile[\s\S]*uploadCloudCommunityResourceSourceFile[\s\S]*type: "file"[\s\S]*resource_role: "source"[\s\S]*source_ingestion_status: "queued"[\s\S]*source_ingestion_kind: "file"/,
  "launch files should upload and enter the source inbox as queued file sources",
);
const launchKnowledgeSourceSection =
  modal.match(/if \(activeStep === "knowledge"\)[\s\S]*?COMMUNITY_LAUNCH_MAX_KNOWLEDGE_LINKS[\s\S]*?Integrations/)?.[0] ?? "";
assert.match(
  launchKnowledgeSourceSection,
  /Text files, notes, and structured data/,
  "launch Knowledge source copy should match currently supported readable file ingestion",
);
assert.doesNotMatch(
  launchKnowledgeSourceSection,
  /PDFs|\.pdf|application\/pdf/,
  "launch Knowledge source upload should not advertise PDF support while PDFs fail closed",
);
assert.match(
  app,
  /handleIngestCommunityLaunchKnowledgeSources[\s\S]*ingestCloudCommunitySources[\s\S]*loadCommunityResources[\s\S]*refreshActiveCommunityLaunchSetupStatus/,
  "launch Knowledge Next should refresh resources after source ingestion",
);
assert.match(
  app,
  /handleIngestCommunityLaunchKnowledgeSources[\s\S]*listCloudCommunityLaunchKnowledgeSources[\s\S]*getCommunityLaunchSourceCrawlUrl[\s\S]*getCloudCommunitySourceCrawlerStatus[\s\S]*!crawlerStatus\?\.full_site_crawl_available[\s\S]*community_source_full_site_crawl_not_configured[\s\S]*crawlMaxPages[\s\S]*crawlerStatus\.max_pages[\s\S]*crawlMaxDepth[\s\S]*crawlerStatus\.max_depth[\s\S]*crawlCloudCommunitySourceRoot[\s\S]*waitForCommunityLaunchSourceCrawlJob[\s\S]*ingestCloudCommunitySources/,
  "launch Knowledge Next should require real full-site crawler availability and use crawler-reported capacity before regular source ingestion",
);
assert.doesNotMatch(
  app,
  /handleIngestCommunityLaunchKnowledgeSources[\s\S]*limit:\s*20/,
  "launch Knowledge Next should use the backend default ingestion window instead of truncating the provider-local source set",
);
assert.match(
  app,
  /handleLoadCommunityLaunchKnowledgeSources[\s\S]*loadCommunityLaunchKnowledgeSources\(community\.id, session\)[\s\S]*onLoadKnowledgeSources=\{handleLoadCommunityLaunchKnowledgeSources\}/,
  "launch Knowledge step should explicitly load saved source selections for onboarding display through the focused source-row query",
);
assert.match(
  modal,
  /onIngestKnowledgeSources[\s\S]*await onIngestKnowledgeSources\(\)[\s\S]*await onGenerateKnowledgePlan[\s\S]*await onApplyKnowledgePlan[\s\S]*await onDraftKnowledgeResources\(\)/,
  "launch Knowledge Next must run ingestion before source-driven architect planning and drafting",
);
assert.match(
  modal,
  /knowledgeIngestionCanContinue[\s\S]*ready_sources[\s\S]*countPendingKnowledgeIngestionSources[\s\S]*handlePrepareKnowledgeResources[\s\S]*!ingestionResult\?\.ok && !knowledgeIngestionCanContinue\(ingestionResult\)[\s\S]*formatKnowledgeIngestionResultError/,
  "launch Knowledge Next should continue after partial source ingestion failures when ready sources exist",
);
assert.match(
  modal,
  /formatKnowledgeIngestionFailureMessage[\s\S]*community_source_url_fetcher_failed_413[\s\S]*too large to read/,
  "launch Knowledge Next should not surface raw source URL fetcher 413 codes to founders",
);
assert.match(
  modal,
  /formatKnowledgeIngestionFailureMessage[\s\S]*community_source_crawl_failed[\s\S]*community_source_crawl_no_usable_sources[\s\S]*could not be crawled[\s\S]*community_source_crawl4ai_not_configured[\s\S]*community_source_full_site_crawl_not_configured[\s\S]*Full site crawling is not configured[\s\S]*community_source_crawler_provider_invalid[\s\S]*Source crawling is misconfigured/,
  "launch Knowledge Next should map crawl failures to founder-readable copy",
);
assert.match(
  modal,
  /sourceNeedsIntegrationReconnect[\s\S]*credential_status === "missing"[\s\S]*knowledgeMissingCredentialMessage[\s\S]*getKnowledgePreparationBlocker[\s\S]*return knowledgeMissingCredentialMessage[\s\S]*handlePrepareKnowledgeResources[\s\S]*setStepError\(preparationBlocker\)[\s\S]*return;[\s\S]*onIngestKnowledgeSources/,
  "launch Knowledge Next should refuse provider ingestion when queued Drive or GitHub sources are missing credentials",
);
assert.match(
  modal,
  /credential_message\?: string \| null[\s\S]*is-credential-missing[\s\S]*community-launch-knowledge-reconnect-required/,
  "launch Knowledge modal should keep missing-credential sources visible and explain reconnect without hiding delete controls",
);
assert.match(
  modal,
  /onAddKnowledgeFile[\s\S]*handleKnowledgeFileDrop[\s\S]*Drop files or choose files/,
  "launch Knowledge Sources should expose real file upload/drop wiring",
);
for (const snippet of [
  "SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES",
  "source_integration_provider",
  "source_integration_context",
  "return_context_kind",
  "community_launch_knowledge",
]) {
  assert.ok(sourceOAuth.includes(snippet), "source OAuth helper should define one-shot return params and explicit launch return context");
}
for (const snippet of [
  "COMMUNITY_LAUNCH_SETUP_ROUTE_PARAM_NAMES",
  "community_launch_step",
]) {
  assert.ok(launchSetupRoute.includes(snippet), "launch setup route helper should expose durable launch setup params");
}
for (const snippet of [
  "community_launch_community_id",
  "community_launch_community_slug",
  "COMMUNITY_LAUNCH_KNOWLEDGE_SOURCE_OAUTH_INTENT_STORAGE_PREFIX",
  "readCommunityLaunchKnowledgeOAuthContext",
  "mergeCommunityLaunchKnowledgeOAuthContext",
  "queueCommunityLaunchKnowledgeOAuthRestore(context)",
  "pendingCommunityLaunchKnowledgeOAuthContext",
  'setCommunityLaunchSetupInitialStep("knowledge")',
  "initialStep={communityLaunchSetupInitialStep}",
]) {
  assert.ok(
    (app + sourceOAuth + launchSetupRoute).includes(snippet),
    "source integration OAuth returns from launch should preserve URL/storage/server community context and reopen the launch modal on Knowledge",
  );
}
assert.match(
  app,
  /handleConnectCommunityLaunchGoogleDrive[\s\S]*beginCloudCommunityGoogleDriveSourceOAuth[\s\S]*returnToPath: buildCommunityLaunchKnowledgeSourceOAuthReturnToPath\(\{[\s\S]*communityId: community\.id,[\s\S]*communitySlug: community\.slug,[\s\S]*writeCommunityLaunchKnowledgeSourceOAuthIntent\(\{[\s\S]*provider: "google_drive"[\s\S]*window\.location\.assign\(result\.authorize_url\)[\s\S]*handleListCommunityLaunchGoogleDriveFiles[\s\S]*listCloudCommunityGoogleDriveSourceFiles[\s\S]*handleImportCommunityLaunchGoogleDriveFiles[\s\S]*importCloudCommunityGoogleDriveSourceFiles/,
  "launch Knowledge integration handlers should connect, list, and import Google Drive files",
);
assert.match(
  app,
  /handleConnectCommunityLaunchGitHub[\s\S]*beginCloudCommunityGitHubSourceOAuth[\s\S]*returnToPath: buildCommunityLaunchKnowledgeSourceOAuthReturnToPath\(\{[\s\S]*communityId: community\.id,[\s\S]*communitySlug: community\.slug,[\s\S]*writeCommunityLaunchKnowledgeSourceOAuthIntent\(\{[\s\S]*provider: "github"[\s\S]*window\.location\.assign\(result\.authorize_url\)[\s\S]*handleListCommunityLaunchGitHubRepositories[\s\S]*listCloudCommunityGitHubSourceRepositories[\s\S]*handleListCommunityLaunchGitHubFiles[\s\S]*listCloudCommunityGitHubSourceFiles[\s\S]*handleImportCommunityLaunchGitHubFiles[\s\S]*importCloudCommunityGitHubSourceFiles/,
  "launch Knowledge integration handlers should connect, list, and import GitHub files",
);
assert.match(
  app,
  /sourceIntegrationOAuthFinalizeInFlightRef[\s\S]*readCommunityLaunchKnowledgeSourceOAuthIntent[\s\S]*restoreLaunchKnowledgeContext\(\);[\s\S]*if \(!session\) return[\s\S]*finalizeCloudCommunityGitHubSourceOAuth[\s\S]*finalizeCloudCommunityGoogleDriveSourceOAuth[\s\S]*restoreLaunchKnowledgeContext\(result\)[\s\S]*clearCommunityLaunchKnowledgeSourceOAuthIntent[\s\S]*setCommunityLaunchKnowledgeIntegrationReloadKey\(\(key\) => key \+ 1\)/,
  "source integration OAuth finalize should restore launch context before session readiness, merge server identity, clear stored intent, and reload provider connection after success",
);
assert.match(
  app,
  /provider === "google_drive" \|\| provider === "github"[\s\S]*setCommunityLaunchKnowledgeAutoOpenProvider\(provider\)/,
  "source integration OAuth finalize should auto-open the just-connected launch Knowledge provider",
);
assert.match(
  app,
  /pendingCommunityLaunchKnowledgeOAuthContext[\s\S]*!pendingCommunityLaunchKnowledgeOAuthContext[\s\S]*setIsCommunityLaunchSetupModalOpen\(false\)[\s\S]*const context = pendingCommunityLaunchKnowledgeOAuthContext[\s\S]*!activeCommunity[\s\S]*!communityLaunchSetupStatus[\s\S]*setCommunityLaunchSetupInitialStep\("knowledge"\)[\s\S]*setIsCommunityLaunchSetupModalOpen\(true\)/,
  "launch Knowledge OAuth restore should not be erased by status hydration and should open only after community/status readiness",
);
assert.match(
  modal,
  /initialStep\?: CommunityLaunchSetupStep \| null[\s\S]*requestedInitialStep[\s\S]*setStepOverride\(requestedInitialStep\)[\s\S]*setActiveStep\(requestedInitialStep \?\?/,
  "launch setup modal should accept a one-shot initial step for OAuth return continuity",
);
assert.match(
  modal,
  /knowledgeIntegrationReloadKey\?: string \| number \| null[\s\S]*onLoadKnowledgeGoogleDriveConnectionRef[\s\S]*onLoadKnowledgeGitHubConnectionRef[\s\S]*const loadConnection = onLoadKnowledgeGitHubConnectionRef\.current[\s\S]*knowledgeIntegrationReloadKey/,
  "launch setup modal should reload source integration connection state after OAuth finalize without restarting on recreated callback props",
);
assert.match(
  modal,
  /onLoadKnowledgeSources[\s\S]*onLoadKnowledgeGoogleDriveConnection[\s\S]*onConnectKnowledgeGoogleDrive[\s\S]*onListKnowledgeGoogleDriveFiles[\s\S]*onImportKnowledgeGoogleDriveFiles[\s\S]*onRemoveKnowledgeGoogleDriveSource[\s\S]*onDisconnectKnowledgeGoogleDrive/,
  "launch Knowledge modal props should expose saved source loading and the Google Drive integration lifecycle",
);
assert.match(
  modal,
  /onLoadKnowledgeSourcesRef[\s\S]*activeStep !== "knowledge"[\s\S]*loadSources\(\)\.catch/,
  "launch Knowledge modal should hydrate saved source selections when the Knowledge step opens",
);
assert.match(
  modal,
  /knowledgeLinkSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*knowledgeFileSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*knowledgeGitHubSources\?: CommunityLaunchKnowledgeImportedSource\[\][\s\S]*onRemoveKnowledgeLinkSource[\s\S]*onRemoveKnowledgeFileSource[\s\S]*onLoadKnowledgeGitHubConnection[\s\S]*onConnectKnowledgeGitHub[\s\S]*onListKnowledgeGitHubRepositories[\s\S]*onListKnowledgeGitHubFiles[\s\S]*onImportKnowledgeGitHubFiles[\s\S]*onRemoveKnowledgeGitHubSource[\s\S]*onDisconnectKnowledgeGitHub/,
  "launch Knowledge modal props should expose saved link/file/GitHub sources and the GitHub integration lifecycle",
);
assert.match(
  modal,
  /(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeFileSources}[\s\S]*fallbackTitle="Source file")(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeLinkSources}[\s\S]*fallbackTitle="Source link")(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeGoogleDriveSources}[\s\S]*fallbackTitle="Drive source")(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeGitHubSources}[\s\S]*fallbackTitle="GitHub source")/,
  "launch Knowledge modal should show saved source rows under their source/link/Drive/GitHub lanes",
);
assert.match(
  modal,
  /(?=[\s\S]*loadGoogleDriveFiles[\s\S]*onListKnowledgeGoogleDriveFiles[\s\S]*setKnowledgeDriveFiles)(?=[\s\S]*knowledgeAutoOpenProvider)(?=[\s\S]*handleGoogleDrivePrimaryAction[\s\S]*onConnectKnowledgeGoogleDrive[\s\S]*loadGoogleDriveFiles)(?=[\s\S]*handleImportGoogleDriveFiles[\s\S]*onImportKnowledgeGoogleDriveFiles)/,
  "launch Knowledge modal should connect Drive, auto/load selectable files, and import selected files through the Drive-local action",
);
assert.match(
  modal,
  /importFileIds[\s\S]*Google Drive import is unavailable[\s\S]*onImportKnowledgeGoogleDriveFiles\(importFileIds\)[\s\S]*setStepError/,
  "launch Knowledge modal should surface Drive import failures from the Drive-local action",
);
assert.match(
  modal,
  /(?=[\s\S]*knowledgeDriveImportedExternalIds)(?=[\s\S]*handleDisconnectGoogleDrive[\s\S]*onDisconnectKnowledgeGoogleDrive)(?=[\s\S]*handleRemoveSavedKnowledgeSource[\s\S]*removeImportedKnowledgeSource[\s\S]*onRemoveKnowledgeGoogleDriveSource)(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeGoogleDriveSources}[\s\S]*fallbackTitle="Drive source"[\s\S]*onRemove={handleRemoveSavedKnowledgeSource})(?=[\s\S]*community-launch-knowledge-imported-source[\s\S]*community-launch-knowledge-source-action)(?=[\s\S]*alreadyAdded)/,
  "launch Knowledge modal should show saved Drive sources under Drive, mark imported Drive files as Added, delete individual sources, and disconnect credentials",
);
assert.match(
  modal,
  /(?=[\s\S]*loadGitHubRepositories[\s\S]*onListKnowledgeGitHubRepositories)(?=[\s\S]*knowledgeAutoOpenProvider !== "github")(?=[\s\S]*handleGitHubPrimaryAction[\s\S]*onConnectKnowledgeGitHub)(?=[\s\S]*handleSelectGitHubRepository[\s\S]*onListKnowledgeGitHubFiles)(?=[\s\S]*handleCloseGitHubPicker[\s\S]*handleDisconnectGitHub[\s\S]*onDisconnectKnowledgeGitHub)(?=[\s\S]*handleImportGitHubFiles[\s\S]*onImportKnowledgeGitHubFiles)/,
  "launch Knowledge modal should connect GitHub, auto-open/load repositories, load files, close the picker, disconnect credentials, and import selected files",
);
assert.match(
  modal,
  /(?=[\s\S]*knowledgeGitHubFilesTruncated)(?=[\s\S]*knowledgeGitHubFileLimit)(?=[\s\S]*knowledgeGitHubImportedRepoCounts)(?=[\s\S]*handleSelectAllGitHubFiles)(?=[\s\S]*community-launch-knowledge-github-repo-item[\s\S]*has-imported-sources[\s\S]*importedSourceCount)(?=[\s\S]*community-launch-knowledge-github-file-panel[\s\S]*community-launch-knowledge-github-file-truth[\s\S]*\$\{knowledgeGitHubFileLimit\}-file selector limit)(?=[\s\S]*community-launch-knowledge-github-file-list)(?=[\s\S]*Select first \$\{COMMUNITY_LAUNCH_MAX_GITHUB_FILES\})(?=[\s\S]*Select all)/,
  "launch Knowledge modal should highlight repos with imported files, show GitHub files inline under the selected repo, disclose selector limits, and support one-action capped file selection",
);
assert.match(
  modal,
  /(?=[\s\S]*knowledgeGitHubImportedExternalIds)(?=[\s\S]*handleRemoveSavedKnowledgeSource[\s\S]*removeImportedKnowledgeSource[\s\S]*onRemoveKnowledgeGitHubSource)(?=[\s\S]*<ImportedKnowledgeSourceRows[\s\S]*sources={effectiveKnowledgeGitHubSources}[\s\S]*fallbackTitle="GitHub source"[\s\S]*onRemove={handleRemoveSavedKnowledgeSource})(?=[\s\S]*community-launch-knowledge-imported-source)(?=[\s\S]*alreadyAdded = knowledgeGitHubImportedExternalIds\.has\(file\.id\))/,
  "launch Knowledge modal should show saved GitHub sources under GitHub, mark imported GitHub files as Added, and delete individual sources",
);
assert.match(
  modal,
  /alreadyAdded = knowledgeGitHubImportedExternalIds\.has\(file\.id\)[\s\S]*alreadyAdded \? "Added"/,
  "launch Knowledge modal should mark already imported GitHub files as Added in the repo picker",
);
assert.match(
  modal,
  /importFileIds[\s\S]*GitHub import is unavailable[\s\S]*onImportKnowledgeGitHubFiles\(importFileIds\)[\s\S]*setStepError/,
  "launch Knowledge modal should surface GitHub import failures from the GitHub-local action",
);

assert.match(
  architect,
  /const readySourceRows = allSources\.filter\(communityResourceSourceHasReadyText\)[\s\S]*COMMUNITY_WIKI_ARCHITECT_MAX_SOURCE_HYDRATION_CANDIDATES[\s\S]*hydrateCommunityResourceBody/,
  "architect context should filter source inbox to ready ingested sources and hydrate only bounded selected source text",
);
assert.match(
  architect,
  /ready_sources_total:[\s\S]*sources_pending_ingestion:[\s\S]*sources_failed_ingestion:/,
  "architect context should expose source ingestion counts",
);
assert.match(
  architect,
  /source_ingestion_status:[\s\S]*length_chars:[\s\S]*excerpt: buildSourceExcerpt/,
  "architect context should send bounded ready-source excerpts rather than URL metadata only",
);
assert.match(
  architect,
  /code: "no_ready_sources"[\s\S]*Source material must be ingested/,
  "architect action should refuse to draft from non-ready source metadata",
);
assert.match(
  architect,
  /const sources = resources\.filter\(\(row\) => communityResourceSourceHasReadyText\(row\)\)/,
  "architect apply validation should only accept ready source lineage",
);
assert.match(
  prompt,
  /ready ingested sources only[\s\S]*bounded excerpt/,
  "architect prompt should describe ready ingested source context, not metadata-only source context",
);

console.log("community_source_ingestion_contract_proof: ok");
