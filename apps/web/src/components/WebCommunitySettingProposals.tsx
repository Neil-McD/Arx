import { useCallback, useEffect, useState } from "react";
import {
  applyCloudCommunitySettingProposal,
  listCloudCommunitySettingProposals,
  rejectCloudCommunitySettingProposal,
  type CommunitySettingProposal,
} from "../../../../shared/cloudCommunitySettingProposalsGateway";

// Hard-to-undo changes an agent proposed over the MCP (pricing, archive,
// removing people, deletes). Nothing happens until a manager taps Apply here.
const REFRESH_MS = 20_000;

function expiresIn(iso: string): string {
  const hours = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));
  return hours <= 1 ? "Expires within the hour" : `Expires in ${hours} hours`;
}

export function WebCommunitySettingProposals(props: { communityId: string; session: unknown }) {
  const [pending, setPending] = useState<CommunitySettingProposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; text: string; failed: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listCloudCommunitySettingProposals(props.session, props.communityId);
      // Workflow stage changes are reviewed in Workflows › Recent changes.
      setPending(result.pending.filter(proposal => !proposal.workflow));
    } catch {
      // Not a manager, or offline: show nothing rather than a broken card.
      setPending([]);
    }
  }, [props.communityId, props.session]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function decide(proposal: CommunitySettingProposal, apply: boolean) {
    if (busyId) return;
    setBusyId(proposal.proposal_id);
    setOutcome(null);
    try {
      const result = apply
        ? await applyCloudCommunitySettingProposal(props.session, props.communityId, proposal.proposal_id)
        : await rejectCloudCommunitySettingProposal(props.session, props.communityId, proposal.proposal_id);
      const failed = result.status === "failed";
      setOutcome({ id: proposal.proposal_id, failed,
        text: failed ? `${proposal.summary} didn't go through: ${result.error ?? "refused"}.`
          : result.status === "applied" ? `${proposal.summary}: applied.` : `${proposal.summary}: rejected.` });
    } catch (error) {
      setOutcome({ id: proposal.proposal_id, failed: true,
        text: `${proposal.summary} didn't go through: ${error instanceof Error ? error.message : "refused"}.` });
    } finally {
      setBusyId(null);
      void refresh();
    }
  }

  if (pending.length === 0 && !outcome) return null;
  return (
    <section className="settings-section pn-settings-card pn-setting-proposals" aria-labelledby="pn-setting-proposals-title">
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title" id="pn-setting-proposals-title">Changes your agent proposed</h2>
        <p className="settings-section-desc">These are hard to undo, so they wait for you. Nothing changes until you tap Apply.</p>
      </header>
      <div className="pn-settings-card-body">
        {pending.map(proposal => (
          <div key={proposal.proposal_id} className="pn-settings-row pn-setting-proposal">
            <div className="pn-settings-row-head">
              <div className="pn-settings-row-text">
                <span className="pn-settings-label">{proposal.summary}</span>
                {proposal.details.length ? (
                  <dl className="pn-setting-proposal-details">
                    {proposal.details.map(detail => (
                      <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>
                    ))}
                  </dl>
                ) : null}
                {proposal.note ? <span className="pn-settings-help">“{proposal.note}”</span> : null}
                <span className="pn-settings-help">{expiresIn(proposal.expires_at)}</span>
              </div>
              <div className="pn-settings-row-control">
                <button type="button" className="pn-settings-button" disabled={busyId !== null}
                  onClick={() => void decide(proposal, false)}>Reject</button>
                <button type="button" className="pn-settings-button is-primary" disabled={busyId !== null}
                  onClick={() => void decide(proposal, true)}>
                  {busyId === proposal.proposal_id ? "Applying…" : "Apply"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {outcome ? (
          <p className={`pn-settings-note${outcome.failed ? " pn-settings-inline-error" : ""}`} role="status">{outcome.text}</p>
        ) : null}
      </div>
    </section>
  );
}
