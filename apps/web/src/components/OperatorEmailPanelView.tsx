import type {
  OperatorEmailAuthDiagnosticSnapshot,
  OperatorMonetizationSnapshot,
} from "../../../../shared/operatorTypes";
import {
  formatEventTime,
  formatPercent,
} from "./workspaceRightPanelOperatorShared";

type EmailOutboxSummaryRow =
  OperatorEmailAuthDiagnosticSnapshot["aggregate"]["outbox"]["recentRows"][number];

function formatDiagnosticBoolean(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "--";
}

function formatDiagnosticStatus(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "--";
  return normalized.replace(/_/g, " ");
}

function formatOptionalCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "--";
}

function formatOptionalTime(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? formatEventTime(value) : "--";
}

function formatAge(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const minutes = Math.floor(value / (60 * 1000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function topEntries(record: Record<string, number> | null | undefined, limit = 6): Array<[string, number]> {
  return Object.entries(record ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function EmailOutboxRows(props: { rows: EmailOutboxSummaryRow[]; empty: string }) {
  if (props.rows.length === 0) {
    return <div className="operator-dashboard__empty">{props.empty}</div>;
  }
  return (
    <>
      {props.rows.map((row, index) => (
        <div
          className="operator-dashboard__row operator-dashboard__event-row"
          key={`${row.status}:${row.templateKey}:${row.updatedAt ?? row.createdAt ?? index}`}
        >
          <div>
            <strong>{formatDiagnosticStatus(row.templateKey)}</strong>
            <span>
              {formatDiagnosticStatus(row.kind)} / age {formatAge(row.ageMs)}
            </span>
            {row.failureReason ? <span>{formatDiagnosticStatus(row.failureReason)}</span> : null}
          </div>
          <strong>{formatDiagnosticStatus(row.status)}</strong>
        </div>
      ))}
    </>
  );
}

export function OperatorEmailPanelView(props: {
  monetization: OperatorMonetizationSnapshot | null;
  emailAuth: OperatorEmailAuthDiagnosticSnapshot | null;
}) {
  const businessKpis = props.monetization?.businessKpis ?? null;
  const emailAuth = props.emailAuth;
  const sampledUsersWithEmail = emailAuth?.aggregate.users.withEmail ?? 0;
  const sampledVerifiedEmailUsers = emailAuth?.aggregate.users.withEmailVerifiedAt ?? 0;
  const sampledEmailVerificationRate =
    sampledUsersWithEmail > 0 ? sampledVerifiedEmailUsers / sampledUsersWithEmail : null;
  const outbox = emailAuth?.aggregate.outbox ?? null;
  const outboxTotals = outbox?.totals ?? null;
  const failedEmails = outboxTotals?.byStatus.failed ?? outbox?.byStatus.failed ?? 0;
  const suppressedEmails = outboxTotals?.byStatus.suppressed ?? outbox?.byStatus.suppressed ?? 0;
  const unverifiedSuppressions =
    outboxTotals?.failures.email_recipient_unverified ?? outbox?.failures.email_recipient_unverified ?? 0;
  const failureEntries = topEntries(outboxTotals?.failures ?? outbox?.failures);
  const deliveries = emailAuth?.aggregate.deliveries ?? null;
  const configuration = emailAuth?.configuration ?? null;

  return (
    <div className="operator-dashboard__grid">
      <section className="operator-dashboard__metrics" aria-label="Email operations overview">
        <div>
          <span>Pending due</span>
          <strong>{formatOptionalCount(outbox?.pendingDueNow)}</strong>
          <span className="operator-dashboard__metric-note">
            {!outbox
              ? "Queue snapshot unavailable."
              : outbox.pendingDueNowTruncated
                ? "250+ rows due now."
                : "Rows ready for the next worker run."}
          </span>
        </div>
        <div>
          <span>Failed</span>
          <strong>{failedEmails}</strong>
          <span className="operator-dashboard__metric-note">{outbox?.staleSending ?? 0} stale sending rows.</span>
        </div>
        <div>
          <span>Suppressed</span>
          <strong>{suppressedEmails}</strong>
          <span className="operator-dashboard__metric-note">{unverifiedSuppressions} unverified recipient suppressions total.</span>
        </div>
        <div>
          <span>Delivered</span>
          <strong>{businessKpis?.email.delivered ?? 0}</strong>
          <span className="operator-dashboard__metric-note">{businessKpis?.email.sent ?? 0} sent in the selected window.</span>
        </div>
        <div>
          <span>Verified coverage</span>
          <strong>{formatPercent(sampledEmailVerificationRate)}</strong>
          <span className="operator-dashboard__metric-note">{sampledVerifiedEmailUsers}/{sampledUsersWithEmail} sampled users with email.</span>
        </div>
        <div>
          <span>Last webhook</span>
          <strong>{formatOptionalTime(deliveries?.lastEventAt)}</strong>
          <span className="operator-dashboard__metric-note">{formatDiagnosticStatus(deliveries?.lastEventType)}</span>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Provider health</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Resend API key</span>
            <strong>{formatDiagnosticBoolean(configuration?.resendApiKeyConfigured)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sender configured</span>
            <strong>{formatDiagnosticBoolean(configuration?.senderConfigured)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Webhook secret</span>
            <strong>{formatDiagnosticBoolean(configuration?.webhookSecretConfigured)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>WorkOS lookup</span>
            <strong>{formatDiagnosticStatus(emailAuth?.workosUser.status)}</strong>
          </div>
          {!emailAuth ? (
            <div className="operator-dashboard__empty">Email diagnostics unavailable.</div>
          ) : emailAuth.workosUser.status === "skipped" ? (
            <div className="operator-dashboard__empty">WorkOS lookup skipped: {formatDiagnosticStatus(emailAuth.workosUser.reason)}.</div>
          ) : emailAuth.evidence.redacted ? (
            <div className="operator-dashboard__empty">Provider diagnostics are redacted and read-only.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Email engagement</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Sent</span>
            <strong>{businessKpis?.email.sent ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Delivered</span>
            <strong>{businessKpis?.email.delivered ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Opened</span>
            <strong>{businessKpis?.email.opened ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Clicked</span>
            <strong>{businessKpis?.email.clicked ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Email click rate</span>
            <strong>{formatPercent(businessKpis?.email.clickRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Email to conversion</span>
            <strong>{formatPercent(businessKpis?.email.conversionRate ?? null)}</strong>
          </div>
          {businessKpis && businessKpis.email.conversionAvailability !== "available" ? (
            <div className="operator-dashboard__empty">Checkout and signup attribution is not wired yet.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Email auth</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Current user verified</span>
            <strong>{formatDiagnosticBoolean(emailAuth?.aggregate.currentUser.emailVerifiedAtPresent)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Identity claim verified</span>
            <strong>{formatDiagnosticBoolean(emailAuth?.identity.emailVerifiedClaimValue)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>WorkOS user verified</span>
            <strong>{formatDiagnosticBoolean(emailAuth?.workosUser.emailVerified)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Verified email coverage</span>
            <strong>{formatPercent(sampledEmailVerificationRate)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Suppressed outbox total</span>
            <strong>{suppressedEmails}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unverified suppressions</span>
            <strong>{unverifiedSuppressions}</strong>
          </div>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Queue health</h2>
        <div className="operator-dashboard__table">
          {["pending", "sending", "sent", "failed", "suppressed"].map((status) => (
            <div className="operator-dashboard__row" key={status}>
              <span>{formatDiagnosticStatus(status)}</span>
              <strong>{outboxTotals?.byStatus[status] ?? outbox?.byStatus[status] ?? 0}</strong>
            </div>
          ))}
          <div className="operator-dashboard__row">
            <span>Oldest pending</span>
            <strong>{formatOptionalTime(outbox?.oldestPendingAt)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Recent deliveries linked</span>
            <strong>{deliveries?.withOutboxId ?? 0}/{deliveries?.sampled ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Failure reasons</h2>
        <div className="operator-dashboard__table">
          {failureEntries.length > 0 ? (
            failureEntries.map(([reason, count]) => (
              <div className="operator-dashboard__row" key={reason}>
                <span>{formatDiagnosticStatus(reason)}</span>
                <strong>{count}</strong>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No email failures.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Webhook events</h2>
        <div className="operator-dashboard__table">
          {topEntries(deliveries?.byEvent).length > 0 ? (
            topEntries(deliveries?.byEvent).map(([eventType, count]) => (
              <div className="operator-dashboard__row" key={eventType}>
                <span>{formatDiagnosticStatus(eventType)}</span>
                <strong>{count}</strong>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No sampled Resend webhooks.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>Recent outbox</h2>
        <div className="operator-dashboard__table">
          <EmailOutboxRows rows={outbox?.recentRows ?? []} empty="No sampled outbox rows." />
        </div>
      </section>

      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>Recent failures</h2>
        <div className="operator-dashboard__table">
          <EmailOutboxRows rows={outbox?.recentFailures ?? []} empty="No sampled failed outbox rows." />
        </div>
      </section>
    </div>
  );
}
