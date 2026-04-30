import { useEffect, useState } from "react";
import { hasBuilderTierPaidAccess } from "../../../../shared/builderBilling";
import {
  WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD,
  WORKSPACE_CREDIT_TOPUP_CREDITS,
  WORKSPACE_CREDIT_TOPUP_PRICE_USD,
} from "../../../../shared/workspaceCredits";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type PersonalMemoryItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type BuilderBillingStatus = {
  builder_tier: "free" | "builder" | "architect";
} | null;

type WebAgentSettingsSectionProps = {
  session: SessionLike;
  exportError: string | null;
  exportThreadsCsv: () => Promise<void> | void;
  exportMessagesCsv: () => Promise<void> | void;
  exportMemoryCsv: () => Promise<void> | void;
  isExporting: boolean;
  userMemorySettings: {
    memory_mode: "off" | "suggest" | "auto";
    remember_intent_enabled: boolean;
    agent_soul: string;
  };
  isLoadingUserMemorySettings: boolean;
  saveUserMemorySettings: (next: {
    memory_mode: "off" | "suggest" | "auto";
    remember_intent_enabled: boolean;
    agent_soul: string;
  }) => Promise<void> | void;
  personalMemoryError: string | null;
  builderBillingStatus: BuilderBillingStatus;
  openBuilderUpgrade: (context: "builder") => void;
  isLoadingPersonalMemory: boolean;
  personalMemoryItems: PersonalMemoryItem[];
  personalMemoryQuery: string;
  setPersonalMemoryQuery: (value: string) => void;
  loadPersonalMemoryItems: () => Promise<void> | void;
  formatRelativeTime: (value: string) => string;
  handleTogglePersonalMemoryPinned: (item: PersonalMemoryItem) => Promise<void> | void;
  handleDeletePersonalMemoryItem: (id: string) => Promise<void> | void;
  setMemoryImportError: (value: string | null) => void;
  setIsMemoryImportModalOpen: (value: boolean) => void;
  newPersonalMemoryContent: string;
  setNewPersonalMemoryContent: (value: string) => void;
  setNewPersonalMemoryPinned: (value: boolean) => void;
  handleCreatePersonalMemoryItem: () => Promise<void> | void;
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  workspaceCreditTopupError: string | null;
  startWorkspaceCreditTopupCheckout: () => Promise<void> | void;
};

function formatCredits(value: number): string {
  const normalized = Math.max(0, Number(value) || 0);
  return normalized % 1 === 0 ? String(normalized) : normalized.toFixed(2);
}

export function WebAgentSettingsSection(props: WebAgentSettingsSectionProps) {
  const {
    session,
    exportError,
    exportThreadsCsv,
    exportMessagesCsv,
    exportMemoryCsv,
    isExporting,
    userMemorySettings,
    isLoadingUserMemorySettings,
    saveUserMemorySettings,
    personalMemoryError,
    builderBillingStatus,
    openBuilderUpgrade,
    isLoadingPersonalMemory,
    personalMemoryItems,
    personalMemoryQuery,
    setPersonalMemoryQuery,
    loadPersonalMemoryItems,
    formatRelativeTime,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
    setMemoryImportError,
    setIsMemoryImportModalOpen,
    newPersonalMemoryContent,
    setNewPersonalMemoryContent,
    setNewPersonalMemoryPinned,
    handleCreatePersonalMemoryItem,
    workspaceCreditBalance,
    isLoadingWorkspaceCreditBalance,
    workspaceCreditBalanceError,
    isStartingWorkspaceCreditTopupCheckout,
    workspaceCreditTopupError,
    startWorkspaceCreditTopupCheckout,
  } = props;
  const [agentSoulDraft, setAgentSoulDraft] = useState(userMemorySettings.agent_soul);
  useEffect(() => {
    setAgentSoulDraft(userMemorySettings.agent_soul);
  }, [userMemorySettings.agent_soul]);
  const agentSoulNeedsSave = agentSoulDraft !== userMemorySettings.agent_soul;

  return (
    <>
      <div className="panel-title">Agent</div>
      <div className="memory-panel">
        {personalMemoryError && <div className="memory-error">{personalMemoryError}</div>}
        {exportError && <div className="auth-error">{exportError}</div>}

        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24"><path d="M12 3v18" /><path d="M5 8h14" /><path d="M7 16h10" /></svg>
            Agent Soul
          </div>
          <div className="settings-section-desc">
            Personal instructions for your agent. Community system prompts add on top when a community lens is active.
          </div>
          <textarea
            className="profile-bio"
            value={agentSoulDraft}
            onChange={(event) => setAgentSoulDraft(event.target.value)}
            placeholder="Tell your agent how to think, collaborate, and behave for you."
            disabled={!session || isLoadingUserMemorySettings}
            rows={6}
          />
          <div className="auth-actions" style={{ paddingLeft: 0, marginTop: 12 }}>
            <button
              className={agentSoulNeedsSave ? "platform-save-button needs-save" : "platform-save-button synced"}
              type="button"
              onClick={() =>
                void saveUserMemorySettings({
                  ...userMemorySettings,
                  agent_soul: agentSoulDraft,
                })
              }
              disabled={!session || isLoadingUserMemorySettings || !agentSoulNeedsSave}
            >
              {isLoadingUserMemorySettings ? "Saving…" : agentSoulNeedsSave ? "Save soul" : "Saved"}
            </button>
          </div>
          {!session ? (
            <div className="model-note">Sign in to save a personal agent soul.</div>
          ) : null}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export
          </div>
          <div className="settings-section-desc">
            Download your threads, messages, and personal memory as CSV.
          </div>
          <div className="export-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => void exportThreadsCsv()}
              disabled={!session || isExporting}
            >
              Threads CSV
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => void exportMessagesCsv()}
              disabled={!session || isExporting}
            >
              Messages CSV
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => void exportMemoryCsv()}
              disabled={!session || isExporting}
            >
              Memory CSV
            </button>
          </div>
        </div>

        {(() => {
          const tier = builderBillingStatus?.builder_tier ?? "free";
          const hasWorkspaceCreditAccess = hasBuilderTierPaidAccess(tier);
          if (!session) return null;

          return (
            <>
              <div className="settings-section">
                <div className="settings-section-title">
                  <svg viewBox="0 0 24 24"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /><path d="M18 4v16" /></svg>
                  Workspace credits
                </div>
                <div className="settings-section-desc">
                  Credits are only used when Builder tools spin up a Daytona sandbox. Community tools and web research do not consume them.
                </div>
                {!hasWorkspaceCreditAccess ? (
                  <div className="auth-actions" style={{ paddingLeft: 0 }}>
                    <button type="button" onClick={() => openBuilderUpgrade("builder")}>
                      Upgrade to Builder
                    </button>
                  </div>
                ) : isLoadingWorkspaceCreditBalance && !workspaceCreditBalance ? (
                  <div className="model-note">Checking workspace credits…</div>
                ) : workspaceCreditBalance ? (
                  <>
                    {workspaceCreditBalance.includedCreditsBalance +
                      workspaceCreditBalance.purchasedCreditsBalance <=
                    WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD ? (
                      <div className="auth-error" style={{ marginBottom: 12 }}>
                        You&apos;re running low on workspace credits. Buy another{" "}
                        {formatCredits(WORKSPACE_CREDIT_TOPUP_CREDITS)} credits to keep Builder tools available.
                      </div>
                    ) : null}
                    <div className="account-row">
                      <div className="account-identity">
                        <span>Remaining</span>
                        <strong>
                          {formatCredits(
                            workspaceCreditBalance.includedCreditsBalance +
                              workspaceCreditBalance.purchasedCreditsBalance,
                          )}{" "}
                          credits
                        </strong>
                      </div>
                      <div className="auth-status">
                        {formatCredits(workspaceCreditBalance.includedCycleCredits)} included this cycle
                      </div>
                    </div>
                    <div className="settings-section-desc">
                      {workspaceCreditBalance.purchasedCreditsBalance > 0
                        ? `${formatCredits(workspaceCreditBalance.purchasedCreditsBalance)} purchased credits are available in addition to your monthly Builder credits. `
                        : ""}
                      {workspaceCreditBalance.includedCycleEndsAt > 0
                        ? `Your included credits reset ${formatRelativeTime(new Date(workspaceCreditBalance.includedCycleEndsAt).toISOString())}.`
                        : "Your included Builder credits reset each paid billing cycle."}
                    </div>
                    <div className="auth-actions" style={{ paddingLeft: 0, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={() => void startWorkspaceCreditTopupCheckout()}
                        disabled={isStartingWorkspaceCreditTopupCheckout}
                      >
                        {isStartingWorkspaceCreditTopupCheckout
                          ? "Starting…"
                          : `Buy ${formatCredits(WORKSPACE_CREDIT_TOPUP_CREDITS)} credits ($${WORKSPACE_CREDIT_TOPUP_PRICE_USD})`}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="model-note">
                    Workspace credits will appear here after your Builder billing cycle is available.
                  </div>
                )}
                {workspaceCreditBalanceError && <div className="auth-error">{workspaceCreditBalanceError}</div>}
                {workspaceCreditTopupError && <div className="auth-error">{workspaceCreditTopupError}</div>}
              </div>

              <>
              <div className="memory-editor">
                <div className="memory-editor-header">
                  <div className="memory-editor-title">Personal memory</div>
                  <div className="memory-editor-meta">
                    {isLoadingPersonalMemory
                      ? "loading…"
                      : `${personalMemoryItems.length} item${personalMemoryItems.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                <input
                  value={personalMemoryQuery}
                  onChange={(event) => setPersonalMemoryQuery(event.target.value)}
                  placeholder="Search memory…"
                />
                <div className="memory-editor-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      setPersonalMemoryQuery("");
                      void loadPersonalMemoryItems();
                    }}
                    disabled={isLoadingPersonalMemory}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="memory-block-group">
                {personalMemoryItems.length === 0 ? (
                  <div className="memory-block-empty">No personal memory items yet.</div>
                ) : (
                  personalMemoryItems.map((item) => (
                    <div key={item.id} className="memory-block">
                      <div className="memory-block-header">
                        <div className="memory-block-label">{item.content}</div>
                        <div className="memory-block-actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => void handleTogglePersonalMemoryPinned(item)}
                            disabled={isLoadingPersonalMemory}
                          >
                            {item.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => void handleDeletePersonalMemoryItem(item.id)}
                            disabled={isLoadingPersonalMemory}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="memory-block-meta">
                        {item.scope}
                        {item.scope === "workspace" && item.scope_id ? ` · ${item.scope_id}` : ""}
                        {" · "}
                        updated {formatRelativeTime(item.updated_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="memory-import-launch">
                <button
                  className="memory-import-trigger"
                  type="button"
                  onClick={() => {
                    setMemoryImportError(null);
                    setIsMemoryImportModalOpen(true);
                  }}
                >
                  Upload import memory from other AI providers
                </button>
              </div>

              <div className="memory-editor">
                <div className="memory-editor-header">
                  <div className="memory-editor-title">Add memory</div>
                </div>
                <textarea
                  value={newPersonalMemoryContent}
                  onChange={(event) => setNewPersonalMemoryContent(event.target.value)}
                  placeholder="Write a durable preference/fact…"
                />
                <div className="memory-editor-actions">
                  <button
                    className="platform-save-button"
                    type="button"
                    onClick={() => void handleCreatePersonalMemoryItem()}
                    disabled={!newPersonalMemoryContent.trim()}
                  >
                    Save memory
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      setNewPersonalMemoryContent("");
                      setNewPersonalMemoryPinned(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              </>
            </>
          );
        })()}
      </div>
    </>
  );
}
