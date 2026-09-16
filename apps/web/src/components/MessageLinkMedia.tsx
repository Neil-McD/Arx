import { youTubeEmbedsInText } from "../../../../shared/linkEmbedUi";
import { pdfLinksInText } from "../../../../shared/messagePdf";
import { DeferredYouTubeEmbed } from "./DeferredYouTubeEmbed";
import { PdfDocumentCard } from "./PdfDocumentCard";

export function MessageLinkMedia({ text }: { text: string }) {
  const videos = youTubeEmbedsInText(text);
  const documents = pdfLinksInText(text);
  if (!videos.length && !documents.length) return null;
  return <div className="message-link-media">
    {videos.length ? <div className="message-media-grid">
      {videos.map(({ embed }) => <DeferredYouTubeEmbed key={embed.id} embed={embed} showMetadata />)}
    </div> : null}
    {documents.map(({ href, name }) => <PdfDocumentCard key={href} url={href} name={name} />)}
  </div>;
}
