import { hasBuilderTierPaidAccess } from "../../../../shared/builderBilling";

type CloudSessionLike = {
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
  cloudSession: CloudSessionLike;
  systemPromptDraft: string;
  setSystemPromptDraft: (value: string) => void;
  saveUserModelSettings: (payload: { system_prompt: string }) => Promise<void> | void;
  isLoadingUserModelSettings: boolean;
  isSavingUserModelSettings: boolean;
  userModelSettingsError: string | null;
  exportError: string | null;
  exportThreadsCsv: () => Promise<void> | void;
  exportMessagesCsv: () => Promise<void> | void;
  exportMemoryCsv: () => Promise<void> | void;
  isExporting: boolean;
  personalMemoryError: string | null;
  builderBillingStatus: BuilderBillingStatus;
  openBuilderUpgrade: (context: "builder" | "architect") => void;
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
};

export function WebAgentSettingsSection(props: WebAgentSettingsSectionProps) {
  const {
    cloudSession,
    systemPromptDraft,
    setSystemPromptDraft,
    saveUserModelSettings,
    isLoadingUserModelSettings,
    isSavingUserModelSettings,
    userModelSettingsError,
    exportError,
    exportThreadsCsv,
    exportMessagesCsv,
    exportMemoryCsv,
    isExporting,
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
  } = props;

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          Agent Soul
        </div>
        <div className="settings-section-desc">
          Shape the agent&apos;s personality, voice, and default way of thinking across every conversation.
        </div>
        <textarea
          className="exec-policy-input"
          value={systemPromptDraft}
          onChange={(event) => setSystemPromptDraft(event.target.value)}
          placeholder="e.g. You are Soul: incisive, imaginative, and calmly opinionated. See patterns early, turn ambiguity into crisp direction, and speak like a trusted strategist who can also build."
          disabled={!cloudSession || isLoadingUserModelSettings}
        />
        <div className="exec-policy-actions">
          <button
            className="platform-save-button"
            type="button"
            onClick={() => void saveUserModelSettings({ system_prompt: systemPromptDraft })}
            disabled={!cloudSession || isLoadingUserModelSettings || isSavingUserModelSettings}
          >
            {isSavingUserModelSettings ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSystemPromptDraft("");
              void saveUserModelSettings({ system_prompt: "" });
            }}
            disabled={!cloudSession || isLoadingUserModelSettings || isSavingUserModelSettings}
          >
            Clear
          </button>
          {userModelSettingsError && <div className="exec-policy-error">{userModelSettingsError}</div>}
        </div>
      </div>

      <div className="panel-title">Memory</div>
      <div className="memory-panel">
        {personalMemoryError &&
          !hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free") && (
            <div className="memory-error">{personalMemoryError}</div>
          )}
        {exportError && <div className="auth-error">{exportError}</div>}

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
              disabled={!cloudSession || isExporting}
            >
              Threads CSV
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => void exportMessagesCsv()}
              disabled={!cloudSession || isExporting}
            >
              Messages CSV
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => void exportMemoryCsv()}
              disabled={!cloudSession || isExporting}
            >
              Memory CSV
            </button>
          </div>
        </div>

        {(() => {
          const tier = builderBillingStatus?.builder_tier ?? "free";
          const hasPersonalMemoryAccess = hasBuilderTierPaidAccess(tier);
          if (!cloudSession) return null;
          if (!hasPersonalMemoryAccess) {
            return (
              <div className="settings-section">
                <div className="settings-section-title">
                  <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M20 2a10 10 0 0 1 0 10" /></svg>
                  Personal memory
                </div>
                <div className="settings-section-desc">
                  Personal memory is included with Builder and Architect.
                </div>
                <div className="auth-actions" style={{ paddingLeft: 0 }}>
                  <button type="button" onClick={() => openBuilderUpgrade("builder")}>
                    Upgrade plan
                  </button>
                </div>
              </div>
            );
          }

          return (
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
          );
        })()}
      </div>
    </>
  );
}
