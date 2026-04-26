import { useMemo, useState } from "react";
import type { DaytonaWorkspaceTerminalRecord } from "../../../../shared/daytonaWorkspaceTerminals";

function StopGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.8" />
    </svg>
  );
}

function formatTerminalCount(count: number): string {
  return `${count} background terminal${count === 1 ? "" : "s"} running`;
}

function isTerminalActive(status: DaytonaWorkspaceTerminalRecord["status"]): boolean {
  return status === "starting" || status === "running";
}

function formatCommandLabel(command: string): string {
  const normalized = String(command ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 68) return normalized;
  return `${normalized.slice(0, 67).trimEnd()}…`;
}

function formatTerminalStatus(status: DaytonaWorkspaceTerminalRecord["status"]): string {
  if (status === "starting") return "Starting";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  if (status === "exited") return "Exited";
  return "Stopped";
}

export function WebBackgroundTerminalRail(props: {
  terminals: DaytonaWorkspaceTerminalRecord[];
  busyTerminalIds?: readonly string[];
  isStoppingAll?: boolean;
  onStopTerminal: (terminalSessionId: string) => void;
  onStopAll: () => void;
}): JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const busySet = useMemo(() => new Set(props.busyTerminalIds ?? []), [props.busyTerminalIds]);

  if (props.terminals.length === 0) return null;

  const activeCount = props.terminals.filter((terminal) => isTerminalActive(terminal.status)).length;
  const failedCount = props.terminals.length - activeCount;
  const title =
    activeCount > 0
      ? formatTerminalCount(activeCount)
      : `${failedCount} recent terminal ${failedCount === 1 ? "issue" : "issues"}`;
  const subtitle =
    activeCount > 0
      ? failedCount > 0
        ? "The agent has running terminals and recent terminal issues in this workspace."
        : "The agent still has background terminals running in this workspace."
      : "A background terminal exited before it became ready.";

  return (
    <div className="background-terminal-rail">
      <div className={`background-terminal-rail-card workspace-rail-card${isOpen ? " open" : ""}`}>
        <div className="background-terminal-rail-header">
          <button
            type="button"
            className="background-terminal-pill"
            onClick={() => setIsOpen((value) => !value)}
            aria-expanded={isOpen}
          >
            <span className="background-terminal-pill-copy workspace-rail-card-copy">
              <span className="background-terminal-pill-title workspace-rail-card-title">{title}</span>
              <span className="background-terminal-pill-subtitle workspace-rail-card-subtitle">{subtitle}</span>
            </span>
            <span className="background-terminal-pill-toggle" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>
          {activeCount > 0 ? (
            <button
              type="button"
              className="background-terminal-stop-all"
              onClick={props.onStopAll}
              disabled={props.isStoppingAll}
              aria-label={props.isStoppingAll ? "Stopping all background terminals" : "Stop all background terminals"}
              title={props.isStoppingAll ? "Stopping..." : "Stop all"}
            >
              <StopGlyph />
              <span>{props.isStoppingAll ? "Stopping..." : "All"}</span>
            </button>
          ) : null}
        </div>
        {isOpen ? (
          <div className="background-terminal-popover">
            <div className="background-terminal-popover-header">
              <div className="background-terminal-popover-title">Background terminals</div>
            </div>
            {props.terminals.length > 0 ? (
              <div className="background-terminal-list">
                {props.terminals.map((terminal) => {
                  const isActive = isTerminalActive(terminal.status);
                  const isBusy = props.isStoppingAll || busySet.has(terminal.id);
                  return (
                    <div key={terminal.id} className={`background-terminal-item${isActive ? "" : " recent"}`}>
                      <div className="background-terminal-item-copy">
                        <div className="background-terminal-item-command" title={terminal.command}>
                          {formatCommandLabel(terminal.command)}
                        </div>
                        <div className="background-terminal-item-meta">
                          <span className={`background-terminal-status ${terminal.status}`}>
                            {formatTerminalStatus(terminal.status)}
                          </span>
                          {terminal.cwd ? (
                            <span className="background-terminal-cwd" title={terminal.cwd}>
                              {terminal.cwd}
                            </span>
                          ) : null}
                          {!isActive && typeof terminal.exit_code === "number" ? (
                            <span className="background-terminal-cwd">exit {terminal.exit_code}</span>
                          ) : null}
                        </div>
                        {!isActive && terminal.output_tail ? (
                          <div className="background-terminal-item-output" title={terminal.output_tail}>
                            {terminal.output_tail}
                          </div>
                        ) : null}
                      </div>
                      {isActive ? (
                        <button
                          type="button"
                          className="background-terminal-stop icon-only"
                          onClick={() => props.onStopTerminal(terminal.id)}
                          disabled={isBusy}
                          aria-label={isBusy ? "Stopping background terminal" : "Stop background terminal"}
                          title={isBusy ? "Stopping..." : "Stop"}
                        >
                          <StopGlyph />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
