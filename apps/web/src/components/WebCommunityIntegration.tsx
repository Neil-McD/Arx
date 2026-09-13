import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plug, X } from "lucide-react";
import type {
  IntegrationGateway,
  IntegrationView,
} from "../controllers/useWebCommunityIntegrationGateway";
import "./WebCommunityIntegration.css";

export function WebCommunityIntegration({
  gateway,
  builder = false,
}: {
  gateway?: IntegrationGateway;
  builder?: boolean;
}) {
  return gateway ? (
    <IntegrationControl
      key={gateway.scopeKey}
      gateway={gateway}
      builder={builder}
    />
  ) : null;
}
function IntegrationControl({
  gateway,
  builder,
}: {
  gateway: IntegrationGateway;
  builder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<IntegrationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const locked = useRef(false);
  const loadSequence = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const reload = async () => {
    const sequence = ++loadSequence.current;
    const result = await gateway.load();
    if (alive.current && sequence === loadSequence.current) setView(result);
  };
  useEffect(() => {
    alive.current = true;
    if (builder || open)
      void reload().catch(() => {
        if (alive.current) setError("Unable to load connection. Try again.");
      });
    return () => {
      alive.current = false;
    };
  }, [gateway, builder, open]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      trigger.current?.focus();
    };
  }, [open]);
  const run = async (operation: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      await reload();
    } catch {
      if (alive.current) setError("Unable to update connection. Try again.");
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const status =
    view?.status === "active"
      ? "Connected"
      : view?.status === "pending"
        ? "Connecting…"
        : view?.status === "error"
          ? "Connection expired or failed"
          : "Not connected";
  return (
    <>
      {builder ? (
        <section className="community-integration-row resource-modal-actions">
          <div>
            <h2>HubSpot</h2>
            <p>
              Members connect their own account in Agent. Workflow access is not
              enabled.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            role="switch"
            aria-label="Enable HubSpot"
            aria-checked={view?.enabled ?? false}
            disabled={busy || !view?.canManage}
            onClick={() => void run(() => gateway.enable(!view?.enabled))}
          >
            {view?.enabled ? "Enabled" : "Enable"}
          </button>
          {!view?.canManage && view && (
            <p>Only the community owner can enable this integration.</p>
          )}
          {error && (
            <p role="alert">
              {error}{" "}
              <button type="button" onClick={() => void run(async () => {})}>
                Retry
              </button>
            </p>
          )}
        </section>
      ) : (
        <button
          ref={trigger}
          type="button"
          className="community-channel-header-menu-trigger"
          title="HubSpot connection"
          aria-label="HubSpot connection"
          onClick={() => setOpen(true)}
        >
          <Plug size={18} />
        </button>
      )}
      {open &&
        createPortal(
          <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
            <div
              ref={dialog}
              className="modal community-integration-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="integration-title"
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
                if (e.key === "Tab") {
                  const nodes = Array.from(
                    dialog.current!.querySelectorAll<HTMLButtonElement>(
                      "button:not(:disabled)",
                    ),
                  );
                  const first = nodes[0],
                    last = nodes[nodes.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                  }
                }
              }}
            >
              <div className="modal-header">
                <h2 className="modal-title" id="integration-title">
                  HubSpot
                </h2>
                <button
                  className="modal-close"
                  aria-label="Close connection"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body">
                <p>
                  Connect your account for use in this community. Your
                  connection is private to you.
                </p>
                <p role="status">{view ? status : "Loading…"}</p>
                {view && !view.enabled && (
                  <p>
                    Connections are not enabled for your current community
                    access.
                  </p>
                )}
                {error && <p role="alert">{error}</p>}
                {view?.reconciliationRequired && <p role="status">Provider connection outcome is unknown. An operator must reconcile it before you reconnect.</p>}
                {view?.cleanupPending && (
                  <p role="status">
                    Disconnected locally. Provider cleanup still needs
                    confirmation.
                  </p>
                )}
              </div>
              <div className="modal-footer resource-modal-actions">
                {!view ? (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(async () => {})}
                  >
                    Retry
                  </button>
                ) : view.actions.map(action => (
                  <button
                    key={action}
                    className={action === "connect" || action === "resume" ? "platform-save-button" : "secondary"}
                    disabled={busy}
                    onClick={() => void run(async () => {
                      if (action === "disconnect" || action === "retry_cleanup") {
                        await gateway.disconnect();
                        return;
                      }
                      const result = await gateway.connect();
                      if (result.authorizationUrl && alive.current) {
                        const destination = new URL(result.authorizationUrl);
                        if (destination.protocol !== "https:" || destination.hostname !== "connect.composio.dev" || destination.username || destination.password)
                          throw new Error("integration_invalid_link");
                        window.location.assign(destination.href);
                        return;
                      }
                      if (!result.available && alive.current)
                        setError("Connection unavailable. This integration is not connected to a provider yet.");
                    })}
                  >
                    {busy ? "Working…" : {connect: "Connect account", resume: "Resume connection", disconnect: "Disconnect", retry_cleanup: "Retry cleanup"}[action]}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
