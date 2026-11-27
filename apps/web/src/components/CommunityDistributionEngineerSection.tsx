// Per-community Distribution Engineer connection inside Settings -> Your app.
// Owners connect their Distribution Engineer workspace (Workspace ID + Funnel
// Webhook Key) so member joins and Stripe checkouts attribute back cleanly.
import { useCallback, useEffect, useState } from "react";
import {
  disconnectCloudCommunityDistributionConnection,
  fetchCloudCommunityDistributionConnection,
  retryCloudCommunityDistributionDeliveries,
  saveCloudCommunityDistributionConnection,
  type CloudCommunityDistributionConnection,
} from "../../../../shared/cloudDistributionConnectionGateway";
import { SettingsButton, SettingsGroup, SettingsNote, SettingsRow } from "./SettingsRows";

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorLabel(code: string | null): string {
  if (!code) return "Some leads could not be delivered.";
  if (code.includes("401") || code.includes("403")) {
    return "Distribution Engineer rejected the saved webhook key. Update the key and click Retry.";
  }
  if (code.includes("404")) {
    return "A click or visitor ID was not found in this Distribution Engineer workspace.";
  }
  if (code.includes("unconfigured")) {
    return "Connection credentials were missing when delivery ran.";
  }
  return "Some leads paused after delivery errors. Check your credentials and retry.";
}

export function CommunityDistributionEngineerSection(props: {
  communityId: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
}) {
  const [state, setState] = useState<CloudCommunityDistributionConnection | null>(null);
  const [editing, setEditing] = useState<{ accountId: string; webhookKey: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const withSession = async <T,>(work: (session: any) => Promise<T>): Promise<T | null> => {
    const session = await props.ensureSession(props.session);
    return session ? await work(session) : null;
  };

  const load = useCallback(async () => {
    try {
      const next = await withSession((session) =>
        fetchCloudCommunityDistributionConnection({ session, communityId: props.communityId }),
      );
      setState(next);
    } catch {
      setState(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      await load();
    } catch (failure) {
      const code = String((failure as Error)?.message ?? "");
      setError(
        code.includes("distribution_account_id_invalid")
          ? "Enter a valid Distribution Engineer Workspace ID."
          : code.includes("distribution_webhook_key_invalid")
            ? "Enter a valid Funnel Webhook Key from Distribution Engineer (at least 16 characters, no spaces)."
            : "Couldn't save your Distribution Engineer connection. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;

  const { stats } = state;
  const lastDelivered = formatShortDate(stats.last_delivered_at);
  const deliverySummary = stats.delivered_count
    ? `${stats.delivered_count} lead${stats.delivered_count === 1 ? "" : "s"} delivered${lastDelivered ? ` · last ${lastDelivered}` : ""}`
    : stats.pending_count
      ? `${stats.pending_count} lead${stats.pending_count === 1 ? "" : "s"} queued for delivery`
      : "Ready — leads and Stripe checkouts will attribute automatically.";

  return (
    <SettingsGroup label="Distribution Engineer">
      {state.connected && !editing ? (
        <>
          <SettingsRow
            label="Connected workspace"
            help={deliverySummary}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="settings-v1-value is-mono">{state.account_id}</span>
              {state.webhook_key_hint ? (
                <span className="settings-v1-value is-mono">{state.webhook_key_hint}</span>
              ) : null}
              <SettingsButton
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setConfirmDisconnect(false);
                  setEditing({ accountId: state.account_id ?? "", webhookKey: "" });
                }}
              >
                Update
              </SettingsButton>
              {confirmDisconnect ? (
                <>
                  <SettingsButton
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await withSession((session) =>
                          disconnectCloudCommunityDistributionConnection({
                            session,
                            communityId: props.communityId,
                          }),
                        );
                        setConfirmDisconnect(false);
                        setNotice("Disconnected Distribution Engineer from this community.");
                      })
                    }
                  >
                    Confirm disconnect
                  </SettingsButton>
                  <SettingsButton disabled={busy} onClick={() => setConfirmDisconnect(false)}>
                    Cancel
                  </SettingsButton>
                </>
              ) : (
                <SettingsButton disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                  Disconnect
                </SettingsButton>
              )}
            </div>
          </SettingsRow>
          {stats.needs_attention_count > 0 ? (
            <SettingsRow
              label={`${stats.needs_attention_count} lead${stats.needs_attention_count === 1 ? "" : "s"} need attention`}
              help={errorLabel(stats.last_error_code)}
            >
              <SettingsButton
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await withSession((session) =>
                      retryCloudCommunityDistributionDeliveries({
                        session,
                        communityId: props.communityId,
                      }),
                    );
                    if (result && result.resumed_count > 0) {
                      setNotice(
                        `Queued ${result.resumed_count} lead${result.resumed_count === 1 ? "" : "s"} to retry.`,
                      );
                    }
                  })
                }
              >
                Retry failed
              </SettingsButton>
            </SettingsRow>
          ) : null}
        </>
      ) : null}

      {!state.connected && !editing ? (
        <SettingsRow
          label="Connect Distribution Engineer"
          help="Attribute community joins, Stripe checkouts, renewals, and paid pods back to the exact videos and links that brought each member in."
        >
          <SettingsButton
            variant="secondary"
            onClick={() => {
              setError(null);
              setNotice(null);
              setEditing({ accountId: "", webhookKey: "" });
            }}
          >
            Connect
          </SettingsButton>
        </SettingsRow>
      ) : null}

      {editing ? (
        <>
          <SettingsRow
            label="Workspace ID"
            help="Copy the Account / Workspace ID from your Distribution Engineer settings."
            htmlFor="de-account-id"
            stacked
          >
            <input
              id="de-account-id"
              type="text"
              className="settings-v1-input"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={editing.accountId}
              onChange={(event) => setEditing({ ...editing, accountId: event.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </SettingsRow>
          <SettingsRow
            label="Funnel Webhook Key"
            help={
              state.connected
                ? "Leave blank to keep your saved key, or paste a new key to rotate it. Stored encrypted and never shown again."
                : "Paste your workspace's Funnel Webhook Key from Distribution Engineer. Stored encrypted and never shown again."
            }
            htmlFor="de-webhook-key"
            stacked
          >
            <input
              id="de-webhook-key"
              type="password"
              className="settings-v1-input"
              placeholder={state.connected ? "Leave blank to keep current key" : "Paste webhook key"}
              value={editing.webhookKey}
              onChange={(event) => setEditing({ ...editing, webhookKey: event.target.value })}
              autoComplete="new-password"
              spellCheck={false}
            />
          </SettingsRow>
          <SettingsRow label="">
            <div style={{ display: "flex", gap: 8 }}>
              <SettingsButton
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
              >
                Cancel
              </SettingsButton>
              <SettingsButton
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await withSession((session) =>
                      saveCloudCommunityDistributionConnection({
                        session,
                        communityId: props.communityId,
                        accountId: editing.accountId.trim(),
                        ...(editing.webhookKey.trim()
                          ? { webhookKey: editing.webhookKey.trim() }
                          : {}),
                      }),
                    );
                    setEditing(null);
                    setNotice("Distribution Engineer connection saved.");
                  })
                }
              >
                Save connection
              </SettingsButton>
            </div>
          </SettingsRow>
        </>
      ) : null}

      {error ? <SettingsNote tone="error">{error}</SettingsNote> : null}
      {notice ? <SettingsNote>{notice}</SettingsNote> : null}
    </SettingsGroup>
  );
}
