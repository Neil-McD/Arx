import { useEffect, useState } from "react";
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

type OpenAiConnection = {
  connected: boolean;
  key_last_four?: string | null;
  updated_at?: string | null;
};

type WebAgentSettingsSectionProps = {
  session: SessionLike;
  isLoadingOpenAiConnection: boolean;
  openAiConnection: OpenAiConnection;
  openAiApiKeyDraft: string;
  setOpenAiApiKeyDraft: (value: string) => void;
  isSavingOpenAiConnection: boolean;
  openAiConnectionError: string | null;
  openAiConnectionSuccess: string | null;
  handleConnectOpenAi: () => Promise<void> | void;
  handleDisconnectOpenAi: () => Promise<void> | void;
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
    isLoadingOpenAiConnection,
    openAiConnection,
    openAiApiKeyDraft,
    setOpenAiApiKeyDraft,
    isSavingOpenAiConnection,
    openAiConnectionError,
    openAiConnectionSuccess,
    handleConnectOpenAi,
    handleDisconnectOpenAi,
    exportError,
    exportThreadsCsv,
    exportMessagesCsv,
    exportMemoryCsv,
    isExporting,
    userMemorySettings,
    isLoadingUserMemorySettings,
    saveUserMemorySettings,
    personalMemoryError,
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
            <svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /><circle cx="12" cy="12" r="9" /></svg>
            OpenAI API key
          </div>
          <div className="settings-section-desc">
            Add your own OpenAI API key for personal agent inference.
          </div>
          {!session ? (
            <div className="model-note">Sign in to connect an OpenAI API key.</div>
          ) : (
            <>
              <div className="account-row">
                <div className="account-identity">
                  <span>Status</span>
                  <strong>
                    {isLoadingOpenAiConnection
                      ? "Checking…"
                      : openAiConnection.connected
                        ? `Connected${openAiConnection.key_last_four ? ` · ••••${openAiConnection.key_last_four}` : ""}`
                        : "Not connected"}
                  </strong>
                </div>
                {openAiConnection.connected ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void handleDisconnectOpenAi()}
                    disabled={isSavingOpenAiConnection}
                  >
                    {isSavingOpenAiConnection ? "Disconnecting…" : "Disconnect"}
                  </button>
                ) : null}
              </div>
              <div className="provider-connection-actions">
                <input
                  className="provider-connection-input"
                  type="password"
                  value={openAiApiKeyDraft}
                  onChange={(event) => setOpenAiApiKeyDraft(event.target.value)}
                  placeholder="Paste OpenAI API key"
                  autoComplete="off"
                  disabled={isSavingOpenAiConnection}
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void handleConnectOpenAi()}
                  disabled={isSavingOpenAiConnection || openAiApiKeyDraft.trim().length === 0}
                >
                  {isSavingOpenAiConnection ? "Saving…" : openAiConnection.connected ? "Update key" : "Connect key"}
                </button>
              </div>
              {openAiConnection.connected && (
                <div className="auth-status">
                  {openAiConnection.updated_at
                    ? `Last validated ${formatRelativeTime(openAiConnection.updated_at)}.`
                    : "Ready for OpenAI API inference."}
                </div>
              )}
              {openAiConnectionError && <div className="auth-error">{openAiConnectionError}</div>}
              {openAiConnectionSuccess && <div className="auth-success">{openAiConnectionSuccess}</div>}
            </>
          )}
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
          if (!session) return null;
          const totalCredits = workspaceCreditBalance
            ? workspaceCreditBalance.includedCreditsBalance + workspaceCreditBalance.purchasedCreditsBalance
            : 0;
          const includedCredits = workspaceCreditBalance?.includedCreditsBalance ?? 0;
          const purchasedCredits = workspaceCreditBalance?.purchasedCreditsBalance ?? 0;

          return (
            <>
              <div className="settings-section">
                <div className="settings-section-title">
                  <svg viewBox="0 0 24 24"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /><path d="M18 4v16" /></svg>
                  Credits
                </div>
                <div className="settings-section-desc">
                  Credits are used for paid tools: Daytona workspaces, web research, and voice input. LLM inference still uses your connected ChatGPT account or OpenAI API key.
                </div>
                {isLoadingWorkspaceCreditBalance && !workspaceCreditBalance ? (
                  <div className="model-note">Checking credits…</div>
                ) : (
                  <>
                    {totalCredits <= WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD ? (
                      <div className="auth-error" style={{ marginBottom: 12 }}>
                        You&apos;re running low on credits. Buy another{" "}
                        {formatCredits(WORKSPACE_CREDIT_TOPUP_CREDITS)} credits to keep paid tools available.
                      </div>
                    ) : null}
                    <div className="account-row">
                      <div className="account-identity">
                        <span>Remaining</span>
                        <strong>
                          {formatCredits(totalCredits)} credits
                        </strong>
                      </div>
                      {includedCredits > 0 ? (
                        <div className="auth-status">
                          {formatCredits(workspaceCreditBalance?.includedCycleCredits ?? 0)} included this cycle
                        </div>
                      ) : null}
                    </div>
                    <div className="settings-section-desc">
                      {purchasedCredits > 0
                        ? `${formatCredits(purchasedCredits)} purchased credits are available. `
                        : ""}
                      {includedCredits > 0 && (workspaceCreditBalance?.includedCycleEndsAt ?? 0) > 0
                        ? `Your included credits reset ${formatRelativeTime(new Date(workspaceCreditBalance?.includedCycleEndsAt ?? 0).toISOString())}.`
                        : "Buy credits before using paid tools."}
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
