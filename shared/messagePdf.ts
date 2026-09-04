import { extractCommunityInteractionLinkSources } from "./communityInteractionLinkExtraction";

export function safeDocumentUrl(raw: string | null | undefined): string | null {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function isPdfDocument(name: string, mime?: string | null): boolean {
  return mime?.split(";")[0]?.trim().toLowerCase() === "application/pdf" || /\.pdf$/i.test(name);
}

export function pdfLinksInText(text: string) {
  return extractCommunityInteractionLinkSources(text, (raw) => {
    const href = safeDocumentUrl(raw);
    return href && /\.pdf$/i.test(new URL(href).pathname) ? href : null;
  }, 12).map((href) => {
    const filename = new URL(href).pathname.split("/").pop() || "Document.pdf";
    let name = filename;
    try { name = decodeURIComponent(filename); } catch { /* Preserve malformed escaped names. */ }
    return { href, name };
  });
}
