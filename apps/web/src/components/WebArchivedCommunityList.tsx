import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";

export type WebArchivedCommunityListProps = {
  communities: CloudFounderBillingCommunity[];
  actionCommunityId: string | null;
  error: string | null;
  retryCommunityArchive: (communityId: string) => Promise<void> | void;
  restoreCommunityWithoutPayment: (
    communityId: string,
    lifecycleGeneration: number,
  ) => Promise<void> | void;
};

export function WebArchivedCommunityList(props: WebArchivedCommunityListProps) {
  if (props.communities.length === 0) return null;

  return (
    <div className="settings-section archived-community-section">
      <div className="settings-section-title">Archived communities</div>
      <div className="settings-section-desc">
        Content and settings stay preserved until you restore a community.
      </div>
      <div className="builder-community-list archived-community-list">
        {props.communities.map((community) => {
          const cleanupStatus = community.archive_billing_cleanup_status;
          const isActing = props.actionCommunityId === community.community_id;

          return (
            <div className="builder-community-row" key={community.community_id}>
              <div className="builder-community-copy">
                <span>{community.community_name}</span>
                <strong>
                  {cleanupStatus === "blocked"
                    ? "Archive cleanup needs attention"
                    : cleanupStatus === "complete"
                      ? "Community archived"
                      : "Finishing archive"}
                </strong>
                <small>
                  {cleanupStatus === "blocked"
                    ? "Payments remain stopped. Retry cleanup before restoring."
                    : cleanupStatus === "complete"
                      ? "Member access is frozen; content and settings are preserved."
                      : "Stopping payments and freezing community access."}
                </small>
              </div>
              <div className="builder-community-actions">
                {cleanupStatus === "blocked" ? (
                  <button
                    className="settings-primary-action"
                    type="button"
                    disabled={isActing}
                    onClick={() => void props.retryCommunityArchive(community.community_id)}
                  >
                    {isActing ? "Retrying…" : "Retry cleanup"}
                  </button>
                ) : cleanupStatus !== "complete" ? (
                  <button className="secondary" type="button" disabled>
                    Finishing archive…
                  </button>
                ) : (
                  <button
                    className="settings-primary-action"
                    type="button"
                    disabled={isActing}
                    onClick={() => void props.restoreCommunityWithoutPayment(
                      community.community_id,
                      community.lifecycle_generation,
                    )}
                  >
                    {isActing ? "Restoring…" : "Restore community"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {props.error ? (
        <div className="billing-settings-error" role="alert">
          {props.error}
        </div>
      ) : null}
    </div>
  );
}
