// Fetching and reading sources: Polynet's URL fetcher, the simple crawler, and
// turning HTML, text and uploaded files into readable text.
import {
  type CommunityResourceLike,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeResourceSourceIngestionKind,
} from "./communityCore";
import {
  requireSafeCommunitySourceFetcherEndpoint,
  requireSafeCommunitySourceUrl,
} from "./communitySourceUrlPolicy";
import {
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
  COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV,
  COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV,
} from "./communityResourceConstants";

function normalizeSourceString(value: unknown, maxLength = 2_000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function isPlainUrlSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  return Boolean(String(row.url ?? "").trim()) &&
    kind !== "file";
}

export function isPlainFileSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  return Boolean(String(row.fileKey ?? "").trim()) &&
    kind !== "url";
}

export function isIngestibleCommunitySource(row: CommunityResourceLike): boolean {
  return isPlainUrlSource(row) || isPlainFileSource(row);
}

export function normalizeCommunitySourceIngestionAttempt(value: unknown): number {
  const attempt = Math.floor(Number(value ?? 0));
  return Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
}

export function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

export function requireSafeSourceIngestionUrl(raw: unknown): string {
  return requireSafeCommunitySourceUrl(raw);
}

function getHeaderNumber(headers: Headers, name: string): number | null {
  const value = Number(headers.get(name) ?? "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function readResponseTextBounded(
  response: Response,
  maxBytes = COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES,
): Promise<string> {
  const contentLength = getHeaderNumber(response.headers, "content-length");
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error("community_source_url_too_large");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error("community_source_url_too_large");
    }
    return text;
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = next.value;
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("community_source_url_too_large");
    }
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveSourceUrlFetcherEndpoint(): string {
  return requireSafeCommunitySourceFetcherEndpoint(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV));
}

function sourceUrlFetcherHeaders(): Record<string, string> {
  const secret = normalizeSourceString(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV), 4_000);
  if (!secret) throw new Error("community_source_url_fetcher_secret_not_configured");
  return {
    "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${secret}`,
  };
}

export async function fetchSourceUrlViaConfiguredFetcher(rawUrl: string): Promise<{
  finalUrl: string;
  title: string | null;
  text: string;
  contentType: string;
}> {
  const requestedUrl = requireSafeSourceIngestionUrl(rawUrl);
  const response = await fetchWithTimeout(resolveSourceUrlFetcherEndpoint(), {
    method: "POST",
    headers: sourceUrlFetcherHeaders(),
    body: JSON.stringify({
      url: requestedUrl,
      max_bytes: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES,
      max_chars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      timeout_ms: COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS,
      max_redirects: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS,
      accept: "text/html,text/plain,text/markdown,application/json,application/xml,text/xml,*/*;q=0.5",
    }),
  });
  if (!response.ok) throw new Error(`community_source_url_fetcher_failed_${response.status}`);
  const rawPayload = await readResponseTextBounded(response);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error("community_source_url_fetcher_invalid_response");
  }
  if (payload.ok === false) {
    throw new Error(normalizeSourceString(payload.error_code, 160) || "community_source_url_fetch_failed");
  }
  const finalUrl = requireSafeSourceIngestionUrl(payload.final_url || requestedUrl);
  const contentType = normalizeSourceString(payload.content_type, 180).toLowerCase() || "text/plain";
  if (contentType.includes("application/pdf") || finalUrl.toLowerCase().includes(".pdf")) {
    throw new Error("community_source_pdf_ingestion_not_supported");
  }
  if (
    contentType &&
    !contentType.includes("text/") &&
    !contentType.includes("application/json") &&
    !contentType.includes("application/xml") &&
    !contentType.includes("xml")
  ) {
    throw new Error("community_source_url_content_type_not_supported");
  }
  const text = normalizeExtractedText(String(payload.text ?? ""));
  if (!text) throw new Error("community_source_url_no_readable_content");
  return {
    finalUrl,
    title: normalizeOptionalText(payload.title, 240) ?? null,
    text,
    contentType,
  };
}

export function decodeBasicHtmlEntities(raw: string): string {
  const named: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return raw.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    const lower = String(entity).toLowerCase();
    if (lower.startsWith("#x")) {
      const value = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    if (lower.startsWith("#")) {
      const value = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    return named[lower] ?? " ";
  });
}

export function normalizeExtractedText(raw: string, maxChars = COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS): string {
  const lines = raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const value = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeBasicHtmlEntities(String(match?.[1] ?? "").replace(/<[^>]+>/g, " "));
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function extractReadableTextFromHtml(html: string): { title: string | null; text: string } {
  const title = extractTitleFromHtml(html);
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
  const blockSeparated = withoutScripts
    .replace(/<\/(?:p|div|section|article|header|footer|main|aside|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = normalizeExtractedText(decodeBasicHtmlEntities(blockSeparated.replace(/<[^>]+>/g, " ")));
  return {
    title,
    text: normalizeExtractedText([title, text].filter(Boolean).join("\n\n")),
  };
}

export function extractReadableText(raw: string, contentType: string): { title: string | null; text: string } {
  const lowerContentType = contentType.toLowerCase();
  if (lowerContentType.includes("text/html") || /<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw)) {
    return extractReadableTextFromHtml(raw);
  }
  if (lowerContentType.includes("application/json")) {
    try {
      return {
        title: null,
        text: normalizeExtractedText(JSON.stringify(JSON.parse(raw), null, 2)),
      };
    } catch {
      return { title: null, text: normalizeExtractedText(raw) };
    }
  }
  return { title: null, text: normalizeExtractedText(raw) };
}

function getFileExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function isReadableTextFileType(contentType: string, filename: string): boolean {
  const lowerContentType = contentType.toLowerCase();
  const extension = getFileExtension(filename);
  if (lowerContentType.startsWith("text/")) return true;
  if (
    lowerContentType.includes("json") ||
    lowerContentType.includes("xml") ||
    lowerContentType.includes("csv") ||
    lowerContentType.includes("yaml") ||
    lowerContentType.includes("toml")
  ) {
    return true;
  }
  return [
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "jsonl",
    "xml",
    "html",
    "htm",
    "yaml",
    "yml",
    "toml",
    "log",
  ].includes(extension);
}

export function isPdfFileType(contentType: string, filename: string): boolean {
  return contentType.toLowerCase().includes("application/pdf") || getFileExtension(filename) === "pdf";
}

export async function extractSourceTextFromFile(args: {
  ctx: any;
  fileKey: string;
  filename: string;
}): Promise<{
  title: string | null;
  text: string;
  contentType: string;
  bytes: number | null;
}> {
  const storageId = normalizeOptionalFileKey(args.fileKey);
  if (!storageId) throw new Error("community_source_file_required");
  const downloadUrl = await args.ctx.storage.getUrl(storageId as any);
  if (!downloadUrl) throw new Error("community_source_file_missing");
  const response = await fetchWithTimeout(downloadUrl, {
    headers: {
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
      accept: "text/*,application/json,application/xml,text/xml,*/*;q=0.5",
    },
  });
  if (!response.ok) throw new Error(`community_source_file_fetch_failed_${response.status}`);
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = getHeaderNumber(response.headers, "content-length");
  if (isPdfFileType(contentType, args.filename)) {
    throw new Error("community_source_pdf_ingestion_not_supported");
  }
  if (!isReadableTextFileType(contentType, args.filename)) {
    throw new Error("community_source_file_content_type_not_supported");
  }
  const raw = await readResponseTextBounded(response);
  const extracted = extractReadableText(raw, contentType || "text/plain");
  if (!extracted.text) throw new Error("community_source_file_no_readable_content");
  return {
    title: extracted.title ?? args.filename ?? null,
    text: extracted.text,
    contentType: contentType || "text/plain",
    bytes,
  };
}

export async function extractSourceTextFromUrl(rawUrl: string): Promise<{
  finalUrl: string;
  title: string | null;
  text: string;
  contentType: string;
}> {
  return await fetchSourceUrlViaConfiguredFetcher(rawUrl);
}

export function buildIngestedSourceBody(args: {
  title: string | null;
  url: string;
  text: string;
}): string {
  return normalizeOptionalText(
    [
      args.title ? `# ${args.title}` : null,
      `Source URL: ${args.url}`,
      args.text,
    ].filter(Boolean).join("\n\n"),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}

export function buildIngestedFileSourceBody(args: {
  title: string | null;
  filename: string;
  contentType: string;
  text: string;
}): string {
  return normalizeOptionalText(
    [
      args.title ? `# ${args.title}` : null,
      args.filename ? `Uploaded file: ${args.filename}` : null,
      args.contentType ? `File type: ${args.contentType}` : null,
      args.text,
    ].filter(Boolean).join("\n\n"),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}
