import { extractCommunityEvidenceUsedV1 } from "../../shared/communityEvidence";
import { CommunityEvidenceCitations } from "../../shared/CommunityEvidenceCitations";
import { formatChatTime } from "../../shared/contentFormatting";
import type {
  CommunityMemoryReviewActions,
  CommunityMemoryReviewState,
} from "./communityMembersContracts";

type CommunityMemoryReviewSectionProps = {
  state: CommunityMemoryReviewState;
  actions: CommunityMemoryReviewActions;
};

export function CommunityMemoryReviewSection(props: CommunityMemoryReviewSectionProps) {
  const { state, actions } = props;
  return (
    <>
      <div className="members-header-row">
        <div className="members-header">Memory review</div>
        <div className="members-count">{state.pendingCommunityMemoryCandidates.length}</div>
      </div>
      <div className="invites-card">
        {state.isLoadingCommunityMemoryCandidates ? (
          <div className="chat-empty">Loading memory candidates…</div>
        ) : state.communityMemoryCandidatesError ? (
          <div className="auth-error">{state.communityMemoryCandidatesError}</div>
        ) : state.pendingCommunityMemoryCandidates.length === 0 ? (
          <div className="chat-empty">No memory candidates waiting for review.</div>
        ) : (
          <div className="invite-list">
            {state.pendingCommunityMemoryCandidates.map((candidate) => {
              const candidateEvidence = extractCommunityEvidenceUsedV1(candidate.evidence_json);
              const rejectReason = state.communityMemoryRejectReasonById[candidate.id] ?? "";
              return (
                <div key={candidate.id} className="invite-row community-memory-review-row">
                  <div className="invite-main">
                    <div className="invite-code">
                      {(candidate.title ?? "").trim() || "Untitled candidate"}
                    </div>
                    <div className="invite-status">
                      by {actions.displayName(candidate.proposer_user_id)} • score {candidate.signal_score}
                    </div>
                    <div className="create-community-hint">
                      {actions.previewText(candidate.memory_text, 180)}
                    </div>
                    {candidateEvidence && candidateEvidence.items.length > 0 && (
                      <div className="community-memory-evidence-preview">
                        <CommunityEvidenceCitations items={candidateEvidence.items.slice(0, 3)} />
                      </div>
                    )}
                    <input
                      className="community-memory-reject-reason"
                      type="text"
                      placeholder="Reject reason (optional)"
                      value={rejectReason}
                      onChange={(event) => {
                        const value = event.target.value;
                        actions.setCommunityMemoryRejectReasonById((prev) => ({
                          ...prev,
                          [candidate.id]: value,
                        }));
                      }}
                      disabled={state.reviewingCommunityMemoryCandidateId === candidate.id}
                    />
                  </div>
                  <div className="invite-actions">
                    <button
                      className="secondary"
                      onClick={() => void actions.handlePromoteCommunityMemoryCandidate(candidate.id)}
                      disabled={state.reviewingCommunityMemoryCandidateId === candidate.id}
                    >
                      {state.reviewingCommunityMemoryCandidateId === candidate.id ? "Saving…" : "Promote"}
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        void actions.handleRejectCommunityMemoryCandidate(
                          candidate.id,
                          rejectReason.trim() ? rejectReason.trim() : null,
                        )
                      }
                      disabled={state.reviewingCommunityMemoryCandidateId === candidate.id}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="members-header-row">
        <div className="members-header">Review history</div>
        <div className="members-count">{state.reviewedCommunityMemoryCandidates.length}</div>
      </div>
      <div className="invites-card">
        {state.isLoadingCommunityMemoryCandidates ? (
          <div className="chat-empty">Loading review history…</div>
        ) : state.communityMemoryCandidatesError ? (
          <div className="auth-error">{state.communityMemoryCandidatesError}</div>
        ) : state.reviewedCommunityMemoryCandidates.length === 0 ? (
          <div className="chat-empty">No reviewed memory candidates yet.</div>
        ) : (
          <>
            <div className="invite-list">
              {state.reviewedCommunityMemoryCandidates.slice(0, 20).map((candidate) => {
                const routerState = candidate.router_state.trim().toLowerCase();
                const stateLabel =
                  routerState === "rejected"
                    ? "Rejected"
                    : routerState === "promoted"
                      ? "Promoted"
                      : routerState === "auto_promoted"
                        ? "Auto-promoted"
                        : routerState === "published"
                          ? "Published"
                          : routerState === "approved"
                            ? "Approved"
                            : routerState.replace(/_/g, " ");
                const reviewedAt = candidate.reviewed_at
                  ? formatChatTime(candidate.reviewed_at)
                  : formatChatTime(candidate.updated_at);
                const reviewedByLabel = candidate.reviewed_by
                  ? actions.displayName(candidate.reviewed_by)
                  : "router";
                const routerReason = (candidate.router_reason ?? "").trim();
                return (
                  <div key={candidate.id} className="invite-row community-memory-review-row">
                    <div className="invite-main">
                      <div className="invite-code">
                        {(candidate.title ?? "").trim() || "Untitled candidate"}
                      </div>
                      <div className="community-memory-review-history-meta">
                        <span className={`community-memory-review-state ${routerState}`}>
                          {stateLabel}
                        </span>
                        <span className="invite-status">
                          by {actions.displayName(candidate.proposer_user_id)} • score {candidate.signal_score}
                        </span>
                        <span className="invite-status">
                          reviewed {reviewedAt} by {reviewedByLabel}
                        </span>
                      </div>
                      <div className="create-community-hint">
                        {actions.previewText(candidate.memory_text, 180)}
                      </div>
                      {routerState === "rejected" && (
                        <div className="community-memory-review-reason">
                          Reject reason: {routerReason || "not provided"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {state.reviewedCommunityMemoryCandidates.length > 20 && (
              <div className="community-memory-review-history-note">
                Showing latest 20 reviewed candidates.
              </div>
            )}
            {state.rejectedReviewedCommunityMemoryCandidatesCount > 0 && (
              <div className="community-memory-review-history-note">
                Rejected: {state.rejectedReviewedCommunityMemoryCandidatesCount}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
