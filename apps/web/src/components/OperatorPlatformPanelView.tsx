import { Loader2, Play } from "lucide-react";
import type {
  OperatorCodexBridgeRunReadback,
  OperatorCodexBridgeRunResult,
} from "../../../../shared/cloudCodexBridgeGateway";
import { buildOperatorPlatformHealthCards } from "../../../../shared/operatorPlatformHealth";
import type {
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "../../../../shared/operatorTypes";
import {
  formatAuditEventType,
  formatBoundedCount,
  formatDiagnosticEventType,
  formatEventTime,
  formatHealth,
  formatIsoEventTime,
  formatPercent,
  formatPlatformScore,
} from "./workspaceRightPanelOperatorShared";

type OperatorCodexBridgeAction = {
  canStart: boolean;
  projectId: string | null;
  threadId: string | null;
  isRunning: boolean;
  result: OperatorCodexBridgeRunResult | null;
  readback: OperatorCodexBridgeRunReadback | null;
  error: string | null;
  onStart: () => void;
};

function formatShortId(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 12) : "-";
}

function formatEvidenceSummary(result: OperatorCodexBridgeRunResult | null): string {
  const evidence = result?.evidence ?? null;
  if (!evidence) return "-";
  const values = Object.values(evidence);
  if (values.length === 0) return "-";
  const passed = values.filter((value) => value === true).length;
  return `${passed}/${values.length}`;
}

function OperatorCodexBridgePanel(props: {
  action: OperatorCodexBridgeAction | null;
}) {
  const action = props.action;
  if (!action) return null;
  const result = action.result;
  const readback = action.readback;
  const events = readback?.events.slice(-6) ?? [];
  const failures = result?.failures?.filter(Boolean) ?? [];
  return (
    <section className="operator-dashboard__panel">
      <h2>Codex bridge</h2>
      <div className="operator-dashboard__table">
        <div className="operator-dashboard__row">
          <span>Target project</span>
          <strong>{formatShortId(action.projectId)}</strong>
        </div>
        <div className="operator-dashboard__row">
          <span>Target thread</span>
          <strong>{formatShortId(action.threadId)}</strong>
        </div>
        <div className="operator-dashboard__row">
          <span>Last run</span>
          <strong>{formatShortId(result?.runId)}</strong>
        </div>
        <div className="operator-dashboard__row">
          <span>Status</span>
          <strong>{action.isRunning ? "Running" : result?.ok === true ? "Succeeded" : result?.ok === false ? "Failed" : "Idle"}</strong>
        </div>
        <div className="operator-dashboard__row">
          <span>Evidence</span>
          <strong>{formatEvidenceSummary(result)}</strong>
        </div>
        <div className="operator-dashboard__row">
          <span>Ledger events</span>
          <strong>{readback?.events.length ?? 0}</strong>
        </div>
        {events.map((event) => (
          <div className="operator-dashboard__row" key={`${event.run_id}:${event.seq}`}>
            <div>
              <strong>{event.event_type}</strong>
              <span>{formatEventTime(Date.parse(event.created_at))}</span>
            </div>
            <span>#{event.seq}</span>
          </div>
        ))}
        {action.error ? <div className="operator-dashboard__empty">{action.error}</div> : null}
        {failures.length > 0 ? (
          <div className="operator-dashboard__empty">{failures.slice(0, 3).join(", ")}</div>
        ) : null}
        <button
          type="button"
          className="operator-dashboard__action"
          disabled={!action.canStart || action.isRunning}
          onClick={action.onStart}
        >
          {action.isRunning ? <Loader2 size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          <span>{action.isRunning ? "Running Codex smoke" : "Run Codex smoke"}</span>
        </button>
      </div>
    </section>
  );
}

export function OperatorPlatformPanelView(props: {
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  frontendErrors: OperatorFrontendErrorDiagnosticsSnapshot | null;
  codexBridgeAction?: OperatorCodexBridgeAction | null;
}) {
  const healthCards = buildOperatorPlatformHealthCards(props);
  const securityTrust = props.securityAudit?.trustBoundary ?? null;
  const securityAuditActivity = props.securityAudit?.auditActivity ?? null;
  const securityAttentionItems = securityTrust?.attentionItems ?? props.securityAudit?.attentionItems ?? [];
  const runtimeExecution = props.runtimeTools?.executionAvailability ?? null;
  const runtimeTopFailureCodes = runtimeExecution?.topFailureCodes ?? props.runtimeTools?.topFailureCodes ?? [];
  return (
    <div className="workspace-right-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Platform health overview">
        {healthCards.map((card) => (
          <div className={`operator-platform-health-card is-${card.status}`} key={card.id}>
            <span className="operator-platform-health-card__label">{card.label}</span>
            <div className="operator-platform-health-card__score-row">
              <strong>{formatPlatformScore(card.score)}</strong>
              <span>{formatHealth(card.status)}</span>
            </div>
            <span className="operator-platform-health-card__primary">{card.primaryMetric}</span>
            <ul className="operator-platform-health-card__drivers" aria-label={`${card.label} health drivers`}>
              {card.drivers.map((driver) => (
                <li key={driver}>{driver}</li>
              ))}
            </ul>
            <span className="operator-dashboard__metric-note">{card.evidenceNote}</span>
          </div>
        ))}
      </section>

      <OperatorCodexBridgePanel action={props.codexBridgeAction ?? null} />

      <section className="operator-dashboard__panel">
        <h2>Web &amp; deploy</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Live web surface</span>
            <strong>{formatHealth(props.webDeploy?.liveSurface?.health ?? props.webDeploy?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Current build</span>
            <strong>{props.webDeploy?.currentBuild.buildId?.slice(0, 12) ?? "Unknown"}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Critical routes</span>
            <strong>
              {props.webDeploy?.liveSurface
                ? `${Math.max(0, props.webDeploy.liveSurface.criticalRoutes.total - props.webDeploy.liveSurface.criticalRoutes.failed)}/${props.webDeploy.liveSurface.criticalRoutes.total}`
                : "0/0"}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Important routes</span>
            <strong>
              {props.webDeploy?.liveSurface
                ? `${Math.max(0, props.webDeploy.liveSurface.importantRoutes.total - props.webDeploy.liveSurface.importantRoutes.failed)}/${props.webDeploy.liveSurface.importantRoutes.total}`
                : "0/0"}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Assets</span>
            <strong>
              {props.webDeploy?.liveSurface
                ? `${Math.max(0, props.webDeploy.liveSurface.assetChecks - props.webDeploy.liveSurface.assetFailures)}/${props.webDeploy.liveSurface.assetChecks}`
                : `${Math.max(0, (props.webDeploy?.totals.assetChecks ?? 0) - (props.webDeploy?.totals.assetFailures ?? 0))}/${props.webDeploy?.totals.assetChecks ?? 0}`}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>30d deploy events</span>
            <strong>{props.webDeploy?.totals.deployEvents ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>30d first-party crash events</span>
            <strong>{props.webDeploy?.totals.frontendCrashEvents ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>30d first-party recovery events</span>
            <strong>{props.webDeploy?.totals.moduleLoadRecoveries ?? 0}</strong>
          </div>
          {props.webDeploy?.routeChecks.length ? (
            props.webDeploy.routeChecks.map((check) => (
              <div className="operator-dashboard__row" key={check.path}>
                <div>
                  <strong>{check.label}</strong>
                  <span>
                    {[check.criticality, check.path, check.httpStatus ? `HTTP ${check.httpStatus}` : check.errorCode, check.latencyMs != null ? `${check.latencyMs} ms` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span>{check.status}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No web route probes returned.</div>
          )}
          {props.webDeploy?.assetChecks.length ? (
            props.webDeploy.assetChecks.map((check) => (
              <div className="operator-dashboard__row" key={check.path}>
                <div>
                  <strong>{check.label}</strong>
                  <span>
                    {[check.type, check.path, check.httpStatus ? `HTTP ${check.httpStatus}` : check.errorCode, check.latencyMs != null ? `${check.latencyMs} ms` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span>{check.status}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No web asset probes returned.</div>
          )}
          {props.webDeploy?.evidence.versionJsonReachable === false ? (
            <div className="operator-dashboard__empty">Build version evidence is unavailable.</div>
          ) : null}
          {props.webDeploy?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Web and deploy diagnostics are sampled for this window.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Frontend errors</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(props.frontendErrors?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Open issues shown</span>
            <strong>
              {formatBoundedCount(
                props.frontendErrors?.totals.unresolvedIssues,
                props.frontendErrors?.evidence.isTruncated,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Top issue events</span>
            <strong>
              {formatBoundedCount(props.frontendErrors?.totals.events, props.frontendErrors?.evidence.isTruncated)}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Affected users shown</span>
            <strong>
              {formatBoundedCount(
                props.frontendErrors?.totals.affectedUsers,
                props.frontendErrors?.evidence.isTruncated,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sentry release</span>
            <strong>{props.frontendErrors?.release.sentryRelease?.slice(0, 12) ?? "Unknown"}</strong>
          </div>
          {props.frontendErrors?.evidence.unavailableReason ? (
            <div className="operator-dashboard__empty">
              Sentry frontend diagnostics unavailable: {props.frontendErrors.evidence.unavailableReason}.
            </div>
          ) : props.frontendErrors?.topIssues.length ? (
            props.frontendErrors.topIssues.slice(0, 3).map((issue) => (
              <div className="operator-dashboard__row" key={issue.id}>
                <div>
                  <strong>{issue.shortId ? `${issue.shortId}: ${issue.title}` : issue.title}</strong>
                  <span>
                    {[issue.level, `${issue.count} events`, formatIsoEventTime(issue.lastSeen), issue.culprit]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span>{issue.status}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No unresolved frontend Sentry issues returned.</div>
          )}
          {props.frontendErrors?.release.matchesCurrentBuild === false ? (
            <div className="operator-dashboard__empty">Sentry release evidence does not match the current build id.</div>
          ) : null}
          {props.frontendErrors?.evidence.sampled ? (
            <div className="operator-dashboard__empty">
              Frontend error diagnostics show the top {props.frontendErrors.evidence.issueLimit} Sentry issues.
            </div>
          ) : null}
          {props.frontendErrors?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Sentry returned more issues than the operator panel displays.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Auth &amp; access</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Auth availability</span>
            <strong>{formatHealth(props.authAccess?.authAvailability?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>24h auth success</span>
            <strong>{formatPercent(props.authAccess?.authAvailability?.successRate)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>24h auth attempts</span>
            <strong>{props.authAccess?.authAvailability?.attempts ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>24h affected users</span>
            <strong>{props.authAccess?.authAvailability?.affectedUsers ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Access integrity</span>
            <strong>{formatHealth(props.authAccess?.accessIntegrity?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Access warnings</span>
            <strong>{props.authAccess?.accessIntegrity?.warnings ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>30d diagnostic events</span>
            <strong>{props.authAccess?.totals.events ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>30d auth failures</span>
            <strong>{props.authAccess?.totals.authFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>30d refresh failures</span>
            <strong>{props.authAccess?.totals.sessionRefreshFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Entitlement findings</span>
            <strong>{props.authAccess?.totals.entitlementFindings ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unknown auth errors</span>
            <strong>{props.authAccess?.totals.unknownAuthErrors ?? 0}</strong>
          </div>
          {props.authAccess?.latestEvents.length ? (
            props.authAccess.latestEvents.slice(0, 3).map((event) => (
              <div className="operator-dashboard__row" key={event.id}>
                <div>
                  <strong>{formatDiagnosticEventType(event.eventType)}</strong>
                  <span>{[event.status, event.errorCode, formatEventTime(event.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <span>{event.severity}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No auth or access diagnostics returned.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Trust boundary</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Trust health</span>
            <strong>{formatHealth(securityTrust?.health ?? props.securityAudit?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Trust findings</span>
            <strong>{securityTrust?.findings ?? props.securityAudit?.attentionItems.length ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Webhook failures</span>
            <strong>{securityTrust?.webhookFailures ?? props.securityAudit?.totals.webhookFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Operator access blocks</span>
            <strong>{securityTrust?.operatorAccessBlocks ?? props.securityAudit?.totals.operatorAccessBlocks ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Blocked boundary actions</span>
            <strong>{securityTrust?.blockedBoundaryActions ?? props.securityAudit?.totals.blockedActions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unknown security events</span>
            <strong>{securityTrust?.unknownSecurityEvents ?? props.securityAudit?.totals.unknownSecurityEvents ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Audit events</span>
            <strong>{securityAuditActivity?.events ?? props.securityAudit?.totals.events ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sensitive actions</span>
            <strong>{securityAuditActivity?.destructiveActions ?? props.securityAudit?.totals.destructiveActions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Operator role changes</span>
            <strong>{securityAuditActivity?.operatorRoleChanges ?? props.securityAudit?.totals.operatorRoleChanges ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Billing trust events</span>
            <strong>{securityAuditActivity?.billingTrustEvents ?? props.securityAudit?.totals.billingTrustEvents ?? 0}</strong>
          </div>
          {securityAttentionItems.length ? (
            securityAttentionItems.slice(0, 3).map((item) => (
              <div className="operator-dashboard__row" key={item.id}>
                <div>
                  <strong>{item.title || formatAuditEventType(item.eventType)}</strong>
                  <span>{[item.status, formatEventTime(item.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <span>{item.severity}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No trust-boundary findings returned.</div>
          )}
          {props.securityAudit?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Trust-boundary diagnostics are sampled for this window.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Runtime execution</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(runtimeExecution?.health ?? props.runtimeTools?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Turn success</span>
            <strong>{formatPercent(runtimeExecution?.turnSuccessRate ?? props.runtimeTools?.rates.turnSuccessRate)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Failed turns</span>
            <strong>{runtimeExecution?.turnsFailed ?? props.runtimeTools?.totals.turnsFailed ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Tool failure rate</span>
            <strong>{formatPercent(runtimeExecution?.toolFailureRate ?? props.runtimeTools?.rates.toolFailureRate)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Provider failures</span>
            <strong>{runtimeExecution?.providerFailures ?? props.runtimeTools?.totals.providerFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Rate limits</span>
            <strong>{runtimeExecution?.rateLimitFailures ?? props.runtimeTools?.totals.rateLimitFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sandbox create failures</span>
            <strong>{runtimeExecution?.sandboxCreateFailures ?? props.runtimeTools?.totals.sandboxCreateFailures ?? 0}</strong>
          </div>
          {runtimeTopFailureCodes.length ? (
            runtimeTopFailureCodes.slice(0, 3).map((bucket) => (
              <div className="operator-dashboard__row" key={bucket.key}>
                <div>
                  <strong>{bucket.label}</strong>
                  <span>{bucket.latestAt ? formatEventTime(bucket.latestAt) : bucket.key}</span>
                </div>
                <span>{bucket.count}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No runtime execution failures returned.</div>
          )}
          {props.runtimeTools?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Runtime diagnostics are sampled for this window.</div>
          ) : null}
        </div>
      </section>

    </div>
  );
}
