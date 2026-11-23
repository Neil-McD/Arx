import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";
import { SettingsGroup, SettingsNote, SettingsRow } from "./SettingsRows";

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
    <SettingsGroup label="Archived communities">
      {props.communities.map((community) => {
        const cleanupStatus = community.archive_billing_cleanup_status;
        const isActing = props.actionCommunityId === community.community_id;
        return (
          <SettingsRow
            key={community.community_id}
            label={community.community_name}
            help={
              cleanupStatus === "blocked"
                ? "Cleanup needs a retry before it can be restored."
                : cleanupStatus === "complete"
                  ? "Frozen. Content and settings are kept."
                  : "Finishing the archive…"
            }
          >
            {cleanupStatus === "blocked" ? (
              <button
                className="settings-v1-button"
                type="button"
                disabled={isActing}
                onClick={() => void props.retryCommunityArchive(community.community_id)}
              >
                {isActing ? "Retrying…" : "Retry"}
              </button>
            ) : cleanupStatus === "complete" ? (
              <button
                className="settings-v1-button"
                type="button"
                disabled={isActing}
                onClick={() =>
                  void props.restoreCommunityWithoutPayment(
                    community.community_id,
                    community.lifecycle_generation,
                  )
                }
              >
                {isActing ? "Restoring…" : "Restore"}
              </button>
            ) : null}
          </SettingsRow>
        );
      })}
      {props.error ? <SettingsNote tone="error">{props.error}</SettingsNote> : null}
    </SettingsGroup>
  );
}
