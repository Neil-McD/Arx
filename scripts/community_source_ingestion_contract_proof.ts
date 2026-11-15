import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readCommunityResourceSources } from "./lib/communityResourceSources.ts";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const vercel = read("vercel.json");
const sourceUrlFetcher = read("api/source-url-fetch.js");
const schema = read("convex/schema.ts");
const core = read("convex/communityCore.ts");
const resources = readCommunityResourceSources();
const sourceUrlPolicy = read("convex/communitySourceUrlPolicy.ts");
const http = read("convex/http.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const resourceController = read("shared/useCommunityResourceController.ts");
const sourceIntake = read("apps/web/src/components/WebCommunityKnowledgeSourceIntake.tsx");
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
  "only manual link and file sources are ingested",
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
  vercel,
  /"functions":\s*\{[\s\S]*"api\/source-url-fetch\.js":\s*\{[\s\S]*"maxDuration":\s*10/,
  "source URL fetch broker should run as a bounded first-party Vercel function",
);
assert.match(
  vercel,
  /"handle": "filesystem"[\s\S]*"src": "\/\(\.\*\)", "dest": "\/index\.html"/,
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
  /sourceIngestionKind:[\s\S]*"url"[\s\S]*"file"/,
  "source ingestion should share one kind contract for links and files",
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
  /communityResourceContents:[\s\S]*resourceId: v\.id\("communityResources"\)[\s\S]*bodyMd: v\.string\(\)[\s\S]*bodyChars: v\.number\(\)[\s\S]*bodyHash: v\.string\(\)[\s\S]*\.index\("by_resource", \["resourceId"\]\)/,
  "large parsed source text should live in resource content rows, not only the hot communityResources metadata row",
);
assert.match(
  schema,
  /communitySourceUnitContents:[\s\S]*sourceUnitId: v\.id\("communitySourceUnits"\)[\s\S]*bodyMd: v\.string\(\)[\s\S]*bodyChars: v\.number\(\)[\s\S]*bodyHash: v\.string\(\)[\s\S]*\.index\("by_source_unit", \["sourceUnitId"\]\)/,
  "source unit bodies should be stored outside source unit metadata rows",
);
assert.equal(
  existsSync(sourceCrawlerServicePath),
  false,
  "legacy Fly/Crawl4AI community-source-crawler service must be deleted from the repo",
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
  resources,
  /(?=[\s\S]*listCommunityLaunchKnowledgeSources = query\(\{[\s\S]*by_community_role_status[\s\S]*isPlainUrlSource\(row\)[\s\S]*isPlainFileSource\(row\))(?=[\s\S]*source_ingestion_kind: normalizeResourceSourceIngestionKind\(row\))(?=[\s\S]*source_external_url:[\s\S]*normalizeOptionalUrl\(row\.url\))/,
  "launch Knowledge focused source query should return saved files and URL links with openable source URLs",
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
  sourceUrlPolicy,
  /requireSafeCommunitySourceFetcherEndpoint[\s\S]*community_source_url_fetcher_not_configured[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_fetcher_invalid/,
  "URL ingestion fetcher should fail closed unless a valid HTTPS broker is configured",
);
assert.match(
  resources,
  /resolveSourceUrlFetcherEndpoint[\s\S]*return requireSafeCommunitySourceFetcherEndpoint\(readEnv\(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV\)\)/,
  "community resource ingestion should validate the first-party fetcher endpoint through the shared source URL policy",
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
assert.doesNotMatch(
  resources,
  /ARX_SOURCE_CRAWLER_PROVIDER|ARX_CRAWL4AI|Crawl4AI|crawl4ai|resolveCrawl4AiEndpoint|crawl4AiHeaders|crawlSourceRootWithCrawl4AI|sourceCrawlerEndpointUrl|COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_RESPONSE_BYTES/,
  "source ingestion must not retain the deleted external Crawl4AI/Fly crawler adapter",
);
assert.doesNotMatch(
  app,
  /crawlCommunitySourceRoot|ARX_CRAWL4AI|Crawl4AI/,
  "Crawl4AI should not be called from the browser UI",
);
assert.match(
  resources,
  /extractSourceTextFromFile[\s\S]*ctx\.storage\.getUrl[\s\S]*isPdfFileType[\s\S]*community_source_pdf_ingestion_not_supported[\s\S]*isReadableTextFileType/,
  "file ingestion should read uploaded source files from storage and reject PDFs until a first-party parser exists",
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
assert.doesNotMatch(
  resources,
  /communitySourceMatchesIngestionKind|function countPendingSourceIngestion|sourceKind:|resultKind:/,
  "the combined ingestion path must not retain obsolete provider-specific generalization",
);
assert.doesNotMatch(
  resources,
  /ctx\.db\.insert\("communityResourceModules"[\s\S]{0,500}descriptionMd:\s*null/,
  "community resource module scaffolds must omit empty descriptions instead of writing null into an optional string field",
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
  /finalizeCommunitySourceIngestionInternal[\s\S]*sourceIngestionStatus: args\.status[\s\S]*sourceIngestionLeaseId: undefined[\s\S]*sourceOriginalFilename[\s\S]*writeCommunityResourceBodyContent/,
  "source ingestion should persist extracted text and keep canonical memory projections in sync",
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
  /(?=[\s\S]*communityResources:generateCommunityResourceSourceUploadUrl)(?=[\s\S]*uploadCloudCommunityResourceSourceFile)(?=[\s\S]*ingestCloudCommunitySources[\s\S]*client\.action\("communityResources:ingestCommunitySources" as any)(?=[\s\S]*listCloudCommunityLaunchKnowledgeSources[\s\S]*communityResources:listCommunityLaunchKnowledgeSources)/,
  "web gateway should call the source upload and ingestion actions",
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
assert.equal(existsSync(join(root, "shared/communitySourceCrawler.ts")), false, "the crawl pipeline stays deleted");
assert.doesNotMatch(resources, /crawlWebRoot|crawlCommunitySourceRoot|CommunitySourceCrawlJob|saveCommunitySourceUnitsForPage/, "the crawl pipeline stays deleted");
console.log("community_source_ingestion_contract_proof: ok");
