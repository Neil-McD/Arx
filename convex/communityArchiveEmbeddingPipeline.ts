import { internal } from "./_generated/api";
import {
  ARCHIVE_EMBED_BATCH_LIMIT,
  ARCHIVE_EMBEDDING_DIMENSIONS,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  GEMINI_API_BASE_URL,
} from "./communityArchiveShared";
import {
  MAX_PDF_TEXT_LENGTH,
  buildArchiveSnippet,
  buildArchiveText,
  isPdfUrl,
  normalizeUrl,
  truncateText,
} from "./communityArchiveDocuments";
import type { PendingArchiveDocument } from "./communityArchiveDocuments";

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

async function fetchPdfTextFromUrl(rawUrl: string): Promise<string | null> {
  const url = normalizeUrl(rawUrl);
  if (!url || !isPdfUrl(url)) return null;
  const stripped = url.replace(/^https?:\/\//i, "");
  let response: Response;
  try {
    response = await fetch(`https://r.jina.ai/http://${stripped}`, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });
  } catch {
    return null;
  }
  const text = await response.text();
  if (!response.ok) return null;
  const normalized = truncateText(text, MAX_PDF_TEXT_LENGTH);
  return normalized || null;
}

export function resolveGeminiEmbeddingConfig():
  | { ok: true; apiKey: string; model: string }
  | { ok: false; reason: string } {
  const apiKey = readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_API_KEY");
  if (!apiKey) return { ok: false, reason: "missing_api_key" };
  const model = readEnv("GEMINI_EMBEDDING_MODEL") || DEFAULT_GEMINI_EMBEDDING_MODEL;
  return { ok: true, apiKey, model };
}

async function parseGeminiError(response: Response): Promise<string> {
  const text = await response.text();
  const fallback = `Gemini embeddings request failed (${response.status}).`;
  if (!text.trim()) return fallback;
  try {
    const parsed = JSON.parse(text) as any;
    const message = String(parsed?.error?.message ?? "").trim();
    return message || fallback;
  } catch {
    return text.slice(0, 500) || fallback;
  }
}

export async function embedGeminiQuery(args: {
  apiKey: string;
  model: string;
  text: string;
}): Promise<number[]> {
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(args.model)}:embedContent?key=${encodeURIComponent(args.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: `models/${args.model}`,
        content: { parts: [{ text: args.text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: ARCHIVE_EMBEDDING_DIMENSIONS,
      }),
    },
  );
  if (!response.ok) throw new Error(await parseGeminiError(response));
  const payload = (await response.json()) as any;
  const values = Array.isArray(payload?.embedding?.values)
    ? payload.embedding.values
    : Array.isArray(payload?.embedding)
      ? payload.embedding
      : [];
  if (!Array.isArray(values) || values.length !== ARCHIVE_EMBEDDING_DIMENSIONS) {
    throw new Error("Gemini query embedding returned an unexpected shape.");
  }
  return values.map((value) => Number(value));
}

async function embedGeminiDocuments(args: {
  apiKey: string;
  model: string;
  requests: Array<{ text: string; title?: string | null }>;
}): Promise<number[][]> {
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(args.model)}:batchEmbedContents?key=${encodeURIComponent(args.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requests: args.requests.map((request) => ({
          model: `models/${args.model}`,
          content: { parts: [{ text: request.text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          ...(request.title ? { title: request.title } : null),
          outputDimensionality: ARCHIVE_EMBEDDING_DIMENSIONS,
        })),
      }),
    },
  );
  if (!response.ok) throw new Error(await parseGeminiError(response));
  const payload = (await response.json()) as any;
  const rows = Array.isArray(payload?.embeddings) ? payload.embeddings : [];
  if (rows.length !== args.requests.length) {
    throw new Error("Gemini document embeddings returned an unexpected number of rows.");
  }
  return rows.map((row: any) => {
    const values = Array.isArray(row?.values)
      ? row.values
      : Array.isArray(row?.embedding?.values)
        ? row.embedding.values
        : Array.isArray(row)
          ? row
          : [];
    if (!Array.isArray(values) || values.length !== ARCHIVE_EMBEDDING_DIMENSIONS) {
      throw new Error("Gemini document embeddings returned an unexpected shape.");
    }
    return values.map((value) => Number(value));
  });
}

async function embedGeminiSingleDocument(args: {
  apiKey: string;
  model: string;
  text: string;
  title?: string | null;
}): Promise<number[]> {
  const [embedding] = await embedGeminiDocuments({
    apiKey: args.apiKey,
    model: args.model,
    requests: [{ text: args.text, title: args.title }],
  });
  return embedding;
}

async function saveEmbeddedArchiveDocument(args: {
  ctx: any;
  archiveDocumentId: string;
  embedding: number[];
  embeddingModel: string;
  text: string;
  pdfText: string | null;
  snippet: string;
}) {
  await args.ctx.runMutation(internal.communityArchive.saveArchiveDocumentEmbeddingInternal as any, {
    archiveDocumentId: args.archiveDocumentId,
    embedding: args.embedding,
    embeddingModel: args.embeddingModel,
    embeddingDimensions: ARCHIVE_EMBEDDING_DIMENSIONS,
    embeddingUpdatedAt: Date.now(),
    text: args.text,
    pdfText: args.pdfText,
    snippet: args.snippet,
  });
}

async function markArchiveDocumentEmbeddingFailed(args: {
  ctx: any;
  archiveDocumentId: string;
  errorMessage: string;
}) {
  await args.ctx.runMutation(internal.communityArchive.markArchiveDocumentEmbeddingFailedInternal as any, {
    archiveDocumentId: args.archiveDocumentId,
    errorMessage: args.errorMessage,
    embeddingUpdatedAt: Date.now(),
  });
}

export async function processPendingArchiveDocuments(args: {
  ctx: any;
  communityId: any;
}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  pdf_extraction_attempted: number;
  pdf_extraction_succeeded: number;
  embedding_model: string | null;
  error: string | null;
}> {
  const config = resolveGeminiEmbeddingConfig();
  if (!config.ok) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      pdf_extraction_attempted: 0,
      pdf_extraction_succeeded: 0,
      embedding_model: null,
      error: config.reason,
    };
  }
  const pendingDocs = (await args.ctx.runQuery(
    internal.communityArchive.listPendingCommunityArchiveDocumentsInternal as any,
    {
      communityId: args.communityId,
      limit: ARCHIVE_EMBED_BATCH_LIMIT,
    },
  )) as PendingArchiveDocument[];
  if (pendingDocs.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      pdf_extraction_attempted: 0,
      pdf_extraction_succeeded: 0,
      embedding_model: config.model,
      error: null,
    };
  }

  let pdfExtractionAttempted = 0;
  let pdfExtractionSucceeded = 0;
  const prepared = await Promise.all(
    pendingDocs.map(async (doc) => {
      let pdfText = doc.pdf_text;
      if (doc.is_pdf && doc.url && !pdfText) {
        pdfExtractionAttempted += 1;
        const extracted = await fetchPdfTextFromUrl(doc.url);
        if (extracted) {
          pdfText = extracted;
          pdfExtractionSucceeded += 1;
        }
      }
      const nextText = buildArchiveText([doc.source_text, pdfText ?? ""]);
      return {
        id: doc.id,
        title: doc.title,
        text: nextText,
        pdfText,
        snippet: buildArchiveSnippet(doc.title, nextText),
      };
    }),
  );

  try {
    const embeddings = await embedGeminiDocuments({
      apiKey: config.apiKey,
      model: config.model,
      requests: prepared.map((doc) => ({
        text: doc.text,
        title: doc.title,
      })),
    });
    await Promise.all(
      embeddings.map((embedding, index) =>
        saveEmbeddedArchiveDocument({
          ctx: args.ctx,
          archiveDocumentId: pendingDocs[index].id,
          embedding,
          embeddingModel: config.model,
          text: prepared[index].text,
          pdfText: prepared[index].pdfText,
          snippet: prepared[index].snippet,
        }),
      ),
    );
    return {
      processed: embeddings.length,
      succeeded: embeddings.length,
      failed: 0,
      pdf_extraction_attempted: pdfExtractionAttempted,
      pdf_extraction_succeeded: pdfExtractionSucceeded,
      embedding_model: config.model,
      error: null,
    };
  } catch (error) {
    const batchMessage = error instanceof Error ? error.message : "Archive embedding failed.";
    let succeeded = 0;
    let failed = 0;
    let firstDocumentError: string | null = null;

    for (let index = 0; index < prepared.length; index += 1) {
      try {
        const embedding = await embedGeminiSingleDocument({
          apiKey: config.apiKey,
          model: config.model,
          text: prepared[index].text,
          title: prepared[index].title,
        });
        await saveEmbeddedArchiveDocument({
          ctx: args.ctx,
          archiveDocumentId: pendingDocs[index].id,
          embedding,
          embeddingModel: config.model,
          text: prepared[index].text,
          pdfText: prepared[index].pdfText,
          snippet: prepared[index].snippet,
        });
        succeeded += 1;
      } catch (documentError) {
        const message =
          documentError instanceof Error ? documentError.message : "Archive embedding failed.";
        await markArchiveDocumentEmbeddingFailed({
          ctx: args.ctx,
          archiveDocumentId: pendingDocs[index].id,
          errorMessage: message,
        });
        failed += 1;
        if (!firstDocumentError) firstDocumentError = message;
      }
    }
    return {
      processed: pendingDocs.length,
      succeeded,
      failed,
      pdf_extraction_attempted: pdfExtractionAttempted,
      pdf_extraction_succeeded: pdfExtractionSucceeded,
      embedding_model: config.model,
      error: failed > 0 ? truncateText(firstDocumentError ?? batchMessage, 500) : null,
    };
  }
}
