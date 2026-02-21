import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { DEFAULT_EMPTY_THREAD_LANDING } from "../../../../shared/communityAgentLanding";

const COMMUNITY_AGENT_PRIMARY_SLOT = 1;

export type WebCommunityAiAgentLandingEditorProps = {
  communityAgentDrafts: Array<{ slot: number; is_active?: boolean }>;
  communityAgentDraftDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityAgentDraft: () => Promise<void> | void;
  isSavingCommunityAgentDraft: boolean;
  handleSetLiveCommunityAgentDraft: () => Promise<void> | void;
  communityAgentDraftLanding: any;
  communityAgentLandingEdit: any;
  communityAgentLandingEditValue: string;
  setCommunityAgentLandingEditValue: Dispatch<SetStateAction<string>>;
  setCommunityAgentDraftLanding: Dispatch<SetStateAction<any>>;
  markCommunityAgentDraftDirty: () => void;
  clearCommunityAgentLandingEdit: () => void;
  beginCommunityAgentLandingEdit: (edit: any, value: string) => void;
  communityAgentPreviewTabId: string | null;
  setCommunityAgentPreviewTabId: Dispatch<SetStateAction<string>>;
  communityAgentDraftSystemPrompt: string;
  setCommunityAgentDraftSystemPrompt: Dispatch<SetStateAction<string>>;
};

export function WebCommunityAiAgentLandingEditor(props: WebCommunityAiAgentLandingEditorProps) {
  const {
    communityAgentDrafts,
    communityAgentDraftDirtyRef,
    handleSaveCommunityAgentDraft,
    isSavingCommunityAgentDraft,
    handleSetLiveCommunityAgentDraft,
    communityAgentDraftLanding,
    communityAgentLandingEdit,
    communityAgentLandingEditValue,
    setCommunityAgentLandingEditValue,
    setCommunityAgentDraftLanding,
    markCommunityAgentDraftDirty,
    clearCommunityAgentLandingEdit,
    beginCommunityAgentLandingEdit,
    communityAgentPreviewTabId,
    setCommunityAgentPreviewTabId,
    communityAgentDraftSystemPrompt,
    setCommunityAgentDraftSystemPrompt,
  } = props;

  const savedRow = communityAgentDrafts.find((d) => d.slot === COMMUNITY_AGENT_PRIMARY_SLOT) ?? null;
  const canSetLive = Boolean(savedRow && !savedRow.is_active);
  const previewLanding = communityAgentDraftLanding;
  const previewTitle = previewLanding.title.trim()
    ? previewLanding.title
    : DEFAULT_EMPTY_THREAD_LANDING.title;
  const previewSubtitle = previewLanding.subtitle.trim()
    ? previewLanding.subtitle
    : DEFAULT_EMPTY_THREAD_LANDING.subtitle;
  const previewTabs = previewLanding.tabs.length ? previewLanding.tabs : DEFAULT_EMPTY_THREAD_LANDING.tabs;
  const previewActiveTab =
    previewTabs.find((t: any) => t.id === communityAgentPreviewTabId) ??
    previewTabs[0];
  const previewPrompts = previewActiveTab?.prompts ?? [];

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">Landing page (empty chat)</div>
        <div className="agent-preview-editor">
          <div className="agent-preview-actions">
            {(() => {
              const row =
                communityAgentDrafts.find((d) => d.slot === COMMUNITY_AGENT_PRIMARY_SLOT) ?? null;
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
                onChange={(event) => setCommunityAgentLandingEditValue(event.target.value)}
                onBlur={() => {
                  const next = communityAgentLandingEditValue;
                  if (next !== previewLanding.title) {
                    setCommunityAgentDraftLanding((prev: any) => ({
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
                  beginCommunityAgentLandingEdit(
                    { kind: "title" },
                    previewLanding.title,
                  )
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
                onChange={(event) => setCommunityAgentLandingEditValue(event.target.value)}
                onBlur={() => {
                  const next = communityAgentLandingEditValue;
                  if (next !== previewLanding.subtitle) {
                    setCommunityAgentDraftLanding((prev: any) => ({
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
              {previewTabs.map((tab: any, index: number) => {
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
                            setCommunityAgentDraftLanding((prev: any) => ({
                              ...prev,
                              tabs: prev.tabs.map((t: any, idx: number) =>
                                t.id === tab.id
                                  ? { ...t, label: next || `Tab ${idx + 1}` }
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
                        <span className="web-starter-tab-label">{labelText}</span>
                        {previewTabs.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="web-starter-tab-remove"
                            aria-label="Remove tab"
                            onClick={(event) => {
                              event.stopPropagation();
                              setCommunityAgentDraftLanding((prev: any) => ({
                                ...prev,
                                tabs: prev.tabs.filter((t: any) => t.id !== tab.id),
                              }));
                              markCommunityAgentDraftDirty();
                              clearCommunityAgentLandingEdit();
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              event.stopPropagation();
                              setCommunityAgentDraftLanding((prev: any) => ({
                                ...prev,
                                tabs: prev.tabs.filter((t: any) => t.id !== tab.id),
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
                    setCommunityAgentDraftLanding((prev: any) => ({
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
              {previewPrompts.map((prompt: string, idx: number) => {
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
                            setCommunityAgentDraftLanding((prev: any) => ({
                              ...prev,
                              tabs: prev.tabs.map((t: any) =>
                                t.id === previewActiveTab.id
                                  ? {
                                      ...t,
                                      prompts: t.prompts.map((p: string, i: number) =>
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
                              setCommunityAgentDraftLanding((prev: any) => ({
                                ...prev,
                                tabs: prev.tabs.map((t: any) =>
                                  t.id === previewActiveTab.id
                                    ? {
                                        ...t,
                                        prompts: t.prompts.filter((_: string, i: number) => i !== idx),
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
                    <div className="web-starter-row is-preview web-starter-row-editable" role="listitem">
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
                            setCommunityAgentDraftLanding((prev: any) => ({
                              ...prev,
                              tabs: prev.tabs.map((t: any) =>
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
            The “Download desktop app” card is always shown by Arx when desktop isn’t
            installed.
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
}
