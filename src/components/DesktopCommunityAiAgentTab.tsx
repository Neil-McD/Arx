import type {
  MutableRefObject,
  Dispatch,
  SetStateAction
} from "react";
import {
  DEFAULT_EMPTY_THREAD_LANDING,
  type CommunityAgentLanding,
} from "../../shared/communityAgentLanding";
import type { CommunityAgentDraft } from "../../shared/communityTypes";

type CommunityAgentLandingEdit =
  | { kind: "title" }
  | { kind: "subtitle" }
  | { kind: "tab_label"; tabId: string }
  | { kind: "prompt"; tabId: string; index: number }
  | { kind: "add_prompt"; tabId: string };

const COMMUNITY_AGENT_PRIMARY_SLOT = 1;

type DesktopCommunityAiAgentTabProps = {
  showAiAgent: boolean;
  activeCommunity: { name: string } | null;
  supabaseSession: unknown | null;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityAgentDrafts: boolean;
  communityAgentDraftsError: string | null;
  isActiveCommunityOwner: boolean;
  setBuilderUpgradeContext: (value: "builder" | "create_community") => void;
  setIsBuilderUpgradeOpen: (value: boolean) => void;
  communityAgentDrafts: CommunityAgentDraft[];
  communityAgentDraftLanding: CommunityAgentLanding;
  communityAgentPreviewTabId: string;
  setCommunityAgentPreviewTabId: (value: string) => void;
  communityAgentDraftDirtyRef: MutableRefObject<boolean>;
  markCommunityAgentDraftDirty: () => void;
  communityAgentDraftSaveError: string | null;
  communityAgentLandingEdit: CommunityAgentLandingEdit | null;
  communityAgentLandingEditValue: string;
  setCommunityAgentLandingEditValue: (value: string) => void;
  setCommunityAgentDraftLanding: Dispatch<SetStateAction<CommunityAgentLanding>>;
  clearCommunityAgentLandingEdit: () => void;
  beginCommunityAgentLandingEdit: (edit: CommunityAgentLandingEdit, value: string) => void;
  handleSaveCommunityAgentDraft: () => Promise<void> | void;
  isSavingCommunityAgentDraft: boolean;
  handleSetLiveCommunityAgentDraft: () => Promise<void> | void;
  communityAgentDraftSystemPrompt: string;
  setCommunityAgentDraftSystemPrompt: (value: string) => void;
};

export function DesktopCommunityAiAgentTab(props: DesktopCommunityAiAgentTabProps) {
  const {
    showAiAgent,
    activeCommunity,
    supabaseSession,
    canManageMembersActiveCommunity,
    isLoadingCommunityAgentDrafts,
    communityAgentDraftsError,
    isActiveCommunityOwner,
    setBuilderUpgradeContext,
    setIsBuilderUpgradeOpen,
    communityAgentDrafts,
    communityAgentDraftLanding,
    communityAgentPreviewTabId,
    setCommunityAgentPreviewTabId,
    communityAgentDraftDirtyRef,
    markCommunityAgentDraftDirty,
    communityAgentDraftSaveError,
    communityAgentLandingEdit,
    communityAgentLandingEditValue,
    setCommunityAgentLandingEditValue,
    setCommunityAgentDraftLanding,
    clearCommunityAgentLandingEdit,
    beginCommunityAgentLandingEdit,
    handleSaveCommunityAgentDraft,
    isSavingCommunityAgentDraft,
    handleSetLiveCommunityAgentDraft,
    communityAgentDraftSystemPrompt,
    setCommunityAgentDraftSystemPrompt,
  } = props;

  return (
    <>
              {showAiAgent && (
                <div className="settings-panel community-settings-panel">
                  {!activeCommunity ? (
                    <div className="chat-empty">Select a community to configure the AI agent.</div>
                  ) : !supabaseSession ? (
                    <div className="chat-empty">Sign in to configure the AI agent.</div>
                  ) : !canManageMembersActiveCommunity ? (
                    <div className="chat-empty">Only owners and admins can configure the AI agent.</div>
                  ) : isLoadingCommunityAgentDrafts ? (
                    <div className="chat-empty">Loading…</div>
                  ) : communityAgentDraftsError &&
                    communityAgentDraftsError.toLowerCase().includes("pro_plan_required") ? (
                    <>
                      {(() => {
                        const previewLanding = DEFAULT_EMPTY_THREAD_LANDING;
                        const previewTab = previewLanding.tabs[0];
                        const previewPrompts = previewTab?.prompts ?? [];

                        return (
                          <div className="premium-gate-shell">
                            <div className="premium-gate-blur" aria-hidden="true">
                              <div className="agent-editor-grid">
                                <div className="settings-section">
                                  <div className="settings-section-title">Templates</div>
                                  <label className="create-community-field" style={{ marginTop: 10 }}>
                                    <span>Template</span>
                                    <select className="select-styled" disabled>
                                      <option>Template 1 (Live)</option>
                                      <option>Template 2</option>
                                      <option>Template 3</option>
                                    </select>
                                  </label>
                                  <div className="model-note" style={{ marginTop: 12 }}>
                                    Set your empty-thread landing prompts and a community system prompt.
                                  </div>
                                  <div className="model-list" style={{ marginTop: 12 }}>
                                    <label className="model-field">
                                      <span>System prompt</span>
                                      <textarea value={"You are the community assistant."} readOnly rows={3} />
                                    </label>
                                  </div>
                                </div>

                                <div className="agent-editor-preview">
                                  <div className="agent-preview-shell" aria-label="Preview">
                                    <div className="web-empty-thread-title">{previewLanding.title}</div>
                                    <div className="web-empty-thread-subtitle">{previewLanding.subtitle}</div>
                                    {previewLanding.tabs.length > 1 && (
                                      <div className="web-starter-tabs" role="tablist" aria-label="Preview tabs">
                                        {previewLanding.tabs.map((tab) => (
                                          <button
                                            key={tab.id}
                                            type="button"
                                            className={`web-starter-tab${tab.id === previewTab?.id ? " active" : ""}`}
                                            aria-pressed={tab.id === previewTab?.id}
                                          >
                                            {tab.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="web-starter-list" role="list">
                                      {previewPrompts.map((prompt) => (
                                        <div key={prompt} className="web-starter-row is-preview" role="listitem">
                                          <span className="web-starter-row-text">{prompt}</span>
                                          <span className="web-starter-row-arrow" aria-hidden="true">
                                            <svg viewBox="0 0 24 24">
                                              <path d="M9 18l6-6-6-6" />
                                            </svg>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="premium-gate-overlay">
                              <div className="premium-gate-card">
                                <div className="premium-gate-eyebrow">ARCHITECT</div>
                                <div className="premium-gate-title">For Architect members only</div>
                                <div className="model-note" style={{ marginTop: 8 }}>
                                  Upgrade to Architect ($100/mo) to customize the empty-thread landing page and a
                                  community system prompt.
                                </div>
                                {isActiveCommunityOwner ? (
                                  <div className="create-community-actions" style={{ marginTop: 12 }}>
                                    <button
                                      className="premium-gate-cta"
                                      type="button"
                                      onClick={() => {
                                        setBuilderUpgradeContext("builder");
                                        setIsBuilderUpgradeOpen(true);
                                      }}
                                    >
                                      Upgrade to Architect
                                    </button>
                                  </div>
                                ) : (
                                  <div className="model-note" style={{ marginTop: 12 }}>
                                    Ask the community owner to upgrade to Architect.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : communityAgentDraftsError ? (
                    <div className="auth-error">{communityAgentDraftsError}</div>
                  ) : (
                    <>
                      {(() => {
                        const savedRow =
                          communityAgentDrafts.find((d) => d.slot === COMMUNITY_AGENT_PRIMARY_SLOT) ?? null;
                        const canSetLive = Boolean(savedRow && !savedRow.is_active);
                        const previewLanding = communityAgentDraftLanding;
                        const previewTitle = previewLanding.title.trim()
                          ? previewLanding.title
                          : DEFAULT_EMPTY_THREAD_LANDING.title;
                        const previewSubtitle = previewLanding.subtitle.trim()
                          ? previewLanding.subtitle
                          : DEFAULT_EMPTY_THREAD_LANDING.subtitle;
                        const previewTabs = previewLanding.tabs.length
                          ? previewLanding.tabs
                          : DEFAULT_EMPTY_THREAD_LANDING.tabs;
                        const previewActiveTab =
                          previewTabs.find((t) => t.id === communityAgentPreviewTabId) ??
                          previewTabs[0];
                        const previewPrompts = previewActiveTab?.prompts ?? [];

                        return (
                          <>
                            <div className="agent-header-row">
                              <div className="model-note">
                                Customize what members see on a fresh chat (no messages) and set a community-wide
                                system prompt.
                              </div>
                            </div>

                            {communityAgentDraftSaveError && (
                              <div className="auth-error" style={{ marginTop: 10 }}>
                                {communityAgentDraftSaveError}
                              </div>
                            )}

                            <div className="settings-section">
                              <div className="settings-section-title">Landing page (empty chat)</div>
                              <div className="agent-preview-editor">
                                <div className="agent-preview-actions">
                                  {(() => {
                                    const row =
                                      communityAgentDrafts.find((d) => d.slot === COMMUNITY_AGENT_PRIMARY_SLOT) ??
                                      null;
                                    const isUnsaved = !row || communityAgentDraftDirtyRef.current;
                                    if (!isUnsaved) return null;
                                    return <span className="agent-unsaved-badge">UNSAVED</span>;
                                  })()}
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveCommunityAgentDraft()}
                                    disabled={isSavingCommunityAgentDraft}
                                  >
                                    {isSavingCommunityAgentDraft ? "Saving…" : "Save draft"}
                                  </button>
                                  <button
                                    className="secondary"
                                    type="button"
                                    disabled={!savedRow || !canSetLive || isSavingCommunityAgentDraft}
                                    onClick={() => {
                                      const ok = window.confirm("Set this draft live for all members?");
                                      if (!ok) return;
                                      void handleSetLiveCommunityAgentDraft();
                                    }}
                                  >
                                    {savedRow?.is_active ? "Live" : "Set live"}
                                  </button>
                                </div>

                                <div
                                  className="agent-preview-shell agent-preview-shell-editable"
                                  aria-label="Preview"
                                >
                                  {communityAgentLandingEdit?.kind === "title" ? (
                                    <input
                                      className="web-empty-thread-title-input"
                                      type="text"
                                      autoFocus
                                      value={communityAgentLandingEditValue}
                                      placeholder={DEFAULT_EMPTY_THREAD_LANDING.title}
                                      onChange={(event) =>
                                        setCommunityAgentLandingEditValue(event.target.value)
                                      }
                                      onBlur={() => {
                                        const next = communityAgentLandingEditValue;
                                        if (next !== previewLanding.title) {
                                          setCommunityAgentDraftLanding((prev) => ({
                                            ...prev,
                                            title: next,
                                          }));
                                          markCommunityAgentDraftDirty();
                                        }
                                        clearCommunityAgentLandingEdit();
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          (event.currentTarget as HTMLInputElement).blur();
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          clearCommunityAgentLandingEdit();
                                        }
                                      }}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className={`web-empty-thread-title web-empty-thread-editable${
                                        previewLanding.title.trim() ? "" : " is-placeholder"
                                      }`}
                                      title="Click to edit"
                                      onClick={() =>
                                        beginCommunityAgentLandingEdit({ kind: "title" }, previewLanding.title)
                                      }
                                    >
                                      {previewTitle}
                                    </button>
                                  )}

                                  {communityAgentLandingEdit?.kind === "subtitle" ? (
                                    <input
                                      className="web-empty-thread-subtitle-input"
                                      type="text"
                                      autoFocus
                                      value={communityAgentLandingEditValue}
                                      placeholder={DEFAULT_EMPTY_THREAD_LANDING.subtitle}
                                      onChange={(event) =>
                                        setCommunityAgentLandingEditValue(event.target.value)
                                      }
                                      onBlur={() => {
                                        const next = communityAgentLandingEditValue;
                                        if (next !== previewLanding.subtitle) {
                                          setCommunityAgentDraftLanding((prev) => ({
                                            ...prev,
                                            subtitle: next,
                                          }));
                                          markCommunityAgentDraftDirty();
                                        }
                                        clearCommunityAgentLandingEdit();
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          (event.currentTarget as HTMLInputElement).blur();
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          clearCommunityAgentLandingEdit();
                                        }
                                      }}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className={`web-empty-thread-subtitle web-empty-thread-editable${
                                        previewLanding.subtitle.trim() ? "" : " is-placeholder"
                                      }`}
                                      title="Click to edit"
                                      onClick={() =>
                                        beginCommunityAgentLandingEdit(
                                          { kind: "subtitle" },
                                          previewLanding.subtitle,
                                        )
                                      }
                                    >
                                      {previewSubtitle}
                                    </button>
                                  )}

                                  <div className="web-starter-tabs" role="tablist" aria-label="Preview tabs">
                                    {previewTabs.map((tab, index) => {
                                      const isActive = communityAgentPreviewTabId === tab.id;
                                      const isEditingLabel =
                                        communityAgentLandingEdit?.kind === "tab_label" &&
                                        communityAgentLandingEdit.tabId === tab.id;
                                      const labelText = tab.label.trim() ? tab.label : `Tab ${index + 1}`;

                                      return (
                                        <button
                                          key={tab.id}
                                          type="button"
                                          className={`web-starter-tab${isActive ? " active" : ""}`}
                                          aria-pressed={isActive}
                                          onClick={() => {
                                            if (isEditingLabel) return;
                                            if (!isActive) {
                                              setCommunityAgentPreviewTabId(tab.id);
                                              return;
                                            }
                                            beginCommunityAgentLandingEdit(
                                              { kind: "tab_label", tabId: tab.id },
                                              tab.label,
                                            );
                                          }}
                                        >
                                          {isEditingLabel ? (
                                            <input
                                              className="web-starter-tab-input"
                                              type="text"
                                              autoFocus
                                              value={communityAgentLandingEditValue}
                                              placeholder={labelText}
                                              onClick={(event) => event.stopPropagation()}
                                              onChange={(event) =>
                                                setCommunityAgentLandingEditValue(event.target.value)
                                              }
                                              onBlur={() => {
                                                const next = communityAgentLandingEditValue.trim();
                                                if (next && next !== tab.label.trim()) {
                                                  setCommunityAgentDraftLanding((prev) => ({
                                                    ...prev,
                                                    tabs: prev.tabs.map((t, idx) =>
                                                      t.id === tab.id ? { ...t, label: next || `Tab ${idx + 1}` } : t,
                                                    ),
                                                  }));
                                                  markCommunityAgentDraftDirty();
                                                }
                                                clearCommunityAgentLandingEdit();
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                  event.preventDefault();
                                                  (event.currentTarget as HTMLInputElement).blur();
                                                }
                                                if (event.key === "Escape") {
                                                  event.preventDefault();
                                                  clearCommunityAgentLandingEdit();
                                                }
                                              }}
                                            />
                                          ) : (
                                            <>
                                              <span className="web-starter-tab-label">{labelText}</span>
                                              {previewTabs.length > 1 && (
                                                <span
                                                  role="button"
                                                  tabIndex={0}
                                                  className="web-starter-tab-remove"
                                                  aria-label="Remove tab"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    setCommunityAgentDraftLanding((prev) => ({
                                                      ...prev,
                                                      tabs: prev.tabs.filter((t) => t.id !== tab.id),
                                                    }));
                                                    markCommunityAgentDraftDirty();
                                                    clearCommunityAgentLandingEdit();
                                                  }}
                                                  onKeyDown={(event) => {
                                                    if (event.key !== "Enter" && event.key !== " ") return;
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setCommunityAgentDraftLanding((prev) => ({
                                                      ...prev,
                                                      tabs: prev.tabs.filter((t) => t.id !== tab.id),
                                                    }));
                                                    markCommunityAgentDraftDirty();
                                                    clearCommunityAgentLandingEdit();
                                                  }}
                                                >
                                                  ×
                                                </span>
                                              )}
                                            </>
                                          )}
                                        </button>
                                      );
                                    })}
                                    {previewTabs.length < 4 && (
                                      <button
                                        type="button"
                                        className="web-starter-tab web-starter-tab-add"
                                        title="Add tab"
                                        onClick={() => {
                                          const nextId = crypto.randomUUID();
                                          const nextLabel = `Tab ${previewTabs.length + 1}`;
                                          setCommunityAgentDraftLanding((prev) => ({
                                            ...prev,
                                            tabs:
                                              prev.tabs.length >= 4
                                                ? prev.tabs
                                                : [...prev.tabs, { id: nextId, label: nextLabel, prompts: [] }],
                                          }));
                                          markCommunityAgentDraftDirty();
                                          setCommunityAgentPreviewTabId(nextId);
                                          beginCommunityAgentLandingEdit(
                                            { kind: "tab_label", tabId: nextId },
                                            nextLabel,
                                          );
                                        }}
                                      >
                                        +
                                      </button>
                                    )}
                                  </div>

                                  <div className="web-starter-list web-starter-list-editable" role="list">
                                    {previewPrompts.map((prompt, idx) => {
                                      const isEditingPrompt =
                                        communityAgentLandingEdit?.kind === "prompt" &&
                                        communityAgentLandingEdit.tabId === previewActiveTab?.id &&
                                        communityAgentLandingEdit.index === idx;

                                      return (
                                        <div
                                          key={`${previewActiveTab?.id ?? "tab"}:${idx}`}
                                          className="web-starter-row is-preview web-starter-row-editable"
                                          role="listitem"
                                          onClick={() => {
                                            if (!previewActiveTab) return;
                                            beginCommunityAgentLandingEdit(
                                              { kind: "prompt", tabId: previewActiveTab.id, index: idx },
                                              prompt,
                                            );
                                          }}
                                        >
                                          {isEditingPrompt ? (
                                            <input
                                              className="web-starter-row-input"
                                              type="text"
                                              autoFocus
                                              value={communityAgentLandingEditValue}
                                              placeholder={prompt}
                                              onClick={(event) => event.stopPropagation()}
                                              onChange={(event) =>
                                                setCommunityAgentLandingEditValue(event.target.value)
                                              }
                                              onBlur={() => {
                                                if (!previewActiveTab) return;
                                                const next = communityAgentLandingEditValue.trim();
                                                if (next && next !== prompt.trim()) {
                                                  setCommunityAgentDraftLanding((prev) => ({
                                                    ...prev,
                                                    tabs: prev.tabs.map((t) =>
                                                      t.id === previewActiveTab.id
                                                        ? {
                                                            ...t,
                                                            prompts: t.prompts.map((p, i) =>
                                                              i === idx ? next : p,
                                                            ),
                                                          }
                                                        : t,
                                                    ),
                                                  }));
                                                  markCommunityAgentDraftDirty();
                                                }
                                                clearCommunityAgentLandingEdit();
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                  event.preventDefault();
                                                  (event.currentTarget as HTMLInputElement).blur();
                                                }
                                                if (event.key === "Escape") {
                                                  event.preventDefault();
                                                  clearCommunityAgentLandingEdit();
                                                }
                                              }}
                                            />
                                          ) : (
                                            <>
                                              <span className="web-starter-row-text">{prompt}</span>
                                              <span className="web-starter-row-actions" aria-hidden="true">
                                                <button
                                                  type="button"
                                                  className="web-starter-row-delete"
                                                  aria-label="Remove prompt"
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    if (!previewActiveTab) return;
                                                    setCommunityAgentDraftLanding((prev) => ({
                                                      ...prev,
                                                      tabs: prev.tabs.map((t) =>
                                                        t.id === previewActiveTab.id
                                                          ? {
                                                              ...t,
                                                              prompts: t.prompts.filter((_, i) => i !== idx),
                                                            }
                                                          : t,
                                                      ),
                                                    }));
                                                    markCommunityAgentDraftDirty();
                                                    clearCommunityAgentLandingEdit();
                                                  }}
                                                >
                                                  ×
                                                </button>
                                                <span className="web-starter-row-arrow" aria-hidden="true">
                                                  <svg viewBox="0 0 24 24">
                                                    <path d="M9 18l6-6-6-6" />
                                                  </svg>
                                                </span>
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}

                                    {(() => {
                                      const tabId = previewActiveTab?.id ?? "";
                                      const isAdding =
                                        communityAgentLandingEdit?.kind === "add_prompt" &&
                                        communityAgentLandingEdit.tabId === tabId;

                                      if (isAdding) {
                                        return (
                                          <div
                                            className="web-starter-row is-preview web-starter-row-editable"
                                            role="listitem"
                                          >
                                            <input
                                              className="web-starter-row-input"
                                              type="text"
                                              autoFocus
                                              value={communityAgentLandingEditValue}
                                              placeholder="New prompt…"
                                              onChange={(event) =>
                                                setCommunityAgentLandingEditValue(event.target.value)
                                              }
                                              onBlur={() => {
                                                const next = communityAgentLandingEditValue.trim();
                                                if (next && previewActiveTab) {
                                                  setCommunityAgentDraftLanding((prev) => ({
                                                    ...prev,
                                                    tabs: prev.tabs.map((t) =>
                                                      t.id === previewActiveTab.id
                                                        ? { ...t, prompts: [...t.prompts, next] }
                                                        : t,
                                                    ),
                                                  }));
                                                  markCommunityAgentDraftDirty();
                                                }
                                                clearCommunityAgentLandingEdit();
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                  event.preventDefault();
                                                  (event.currentTarget as HTMLInputElement).blur();
                                                }
                                                if (event.key === "Escape") {
                                                  event.preventDefault();
                                                  clearCommunityAgentLandingEdit();
                                                }
                                              }}
                                            />
                                          </div>
                                        );
                                      }

                                      return (
                                        <div
                                          className="web-starter-row is-preview web-starter-row-add"
                                          role="listitem"
                                          onClick={() => {
                                            if (!previewActiveTab) return;
                                            beginCommunityAgentLandingEdit(
                                              { kind: "add_prompt", tabId: previewActiveTab.id },
                                              "",
                                            );
                                          }}
                                        >
                                          <span className="web-starter-row-text">+ Add prompt</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>

                                <div className="model-note" style={{ marginTop: 10 }}>
                                  The "Download desktop app" card is always shown by Arx when desktop isn't installed.
                                </div>
                              </div>
                            </div>

                            <div className="settings-section agent-system-prompt">
                              <div className="settings-section-title">System prompt (community-wide)</div>
                              <textarea
                                className="system-prompt-input"
                                placeholder="Optional. This applies to every chat in this community."
                                value={communityAgentDraftSystemPrompt}
                                onChange={(event) => {
                                  setCommunityAgentDraftSystemPrompt(event.target.value);
                                  markCommunityAgentDraftDirty();
                                }}
                                rows={6}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}
    </>
  );
}
