import type { CommunityEvidenceItem } from "./communityEvidence";
import {
  formatCommunityEvidenceTypeLabel,
  summarizeCommunityEvidenceSnippet,
} from "./communityEvidenceUi";

type CommunityEvidenceCitationsProps = {
  items: CommunityEvidenceItem[];
  onChipClick?: ((item: CommunityEvidenceItem) => void) | null;
  actionTitle?: string;
};

export function CommunityEvidenceCitations({
  items,
  onChipClick,
  actionTitle = "Open source details",
}: CommunityEvidenceCitationsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="message-citations" role="list" aria-label="Community evidence used">
      {items.map((item) => {
        const key = `${item.source_type}:${item.source_id}:${item.rank}`;
        const label = formatCommunityEvidenceTypeLabel(item.source_type);
        const snippet = summarizeCommunityEvidenceSnippet(item);

        if (!onChipClick) {
          return (
            <div key={key} className="message-citation-chip" role="listitem">
              <span className="message-citation-kind">{label}</span>
              <span className="message-citation-text">{snippet}</span>
            </div>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className="message-citation-chip"
            onClick={() => onChipClick(item)}
            title={actionTitle}
          >
            <span className="message-citation-kind">{label}</span>
            <span className="message-citation-text">{snippet}</span>
          </button>
        );
      })}
    </div>
  );
}
