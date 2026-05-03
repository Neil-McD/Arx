import { useState } from "react";

import type {
  CommunityAttachedSkill,
  CreateSkillPackageInput,
  SkillPackageSummary,
} from "../../../../shared/communitySkillTypes";

function buildInitialDraft(): CreateSkillPackageInput {
  return {
    name: "",
    description: "",
    instructions_md: "",
  };
}

function toStatusLabel(value: string): string {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export type WebCommunityAiAgentSkillsEditorProps = {
  intro: string;
  emptyState: string;
  addButtonLabel: string;
  skills: CommunityAttachedSkill[];
  packages: SkillPackageSummary[];
  isLoading: boolean;
  isLoadingPackages: boolean;
  error: string | null;
  packagesError: string | null;
  mutationError: string | null;
  isCreatingSkill: boolean;
  attachingPackageId: string | null;
  updatingSkillId: string | null;
  removingSkillId: string | null;
  onCreateSkill: (input: CreateSkillPackageInput) => Promise<boolean> | boolean;
  onAttachPackage: (skillPackageId: string) => Promise<boolean> | boolean;
  onUpdateSkill: (
    communitySkillAttachmentId: string,
    patch: { enabled?: boolean },
  ) => Promise<boolean> | boolean;
  onDetachSkill: (communitySkillAttachmentId: string) => Promise<boolean> | boolean;
  onBrowseCatalog?: () => void;
};

export function WebCommunityAiAgentSkillsEditor(
  props: WebCommunityAiAgentSkillsEditorProps,
) {
  const {
    intro,
    emptyState,
    addButtonLabel,
    skills,
    packages,
    isLoading,
    isLoadingPackages,
    error,
    packagesError,
    mutationError,
    isCreatingSkill,
    attachingPackageId,
    updatingSkillId,
    removingSkillId,
    onCreateSkill,
    onAttachPackage,
    onUpdateSkill,
    onDetachSkill,
    onBrowseCatalog,
  } = props;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateSkillPackageInput>(buildInitialDraft);
  const attachedSkillPackageIds = new Set(skills.map((attachment) => attachment.skill.id));

  const handleCreate = async () => {
    const ok = await onCreateSkill(draft);
    if (!ok) return;
    setDraft(buildInitialDraft());
    setIsCreateOpen(false);
  };

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">{intro}</div>

      <div className="agent-capability-toolbar">
        <button
          type="button"
          onClick={
            onBrowseCatalog
              ? onBrowseCatalog
              : () => setIsCreateOpen((prev) => !prev)
          }
          disabled={isCreatingSkill}
        >
          {isCreateOpen ? "Close" : addButtonLabel}
        </button>
      </div>

      {isCreateOpen ? (
          <div className="agent-capability-card community-skill-create-card">
            <div className="agent-capability-card-header">
              <div className="agent-canvas-target-kicker">
                Create personal skill and attach it here
              </div>
            </div>

          <label className="agent-capability-field">
            <span className="agent-capability-field-label">Skill name</span>
            <input
              className="agent-editor-inline-label-input"
              value={draft.name}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Weekly research"
            />
          </label>

          <label className="agent-capability-field">
            <span className="agent-capability-field-label">Optional description</span>
            <textarea
              className="agent-editor-inline-prompt-input community-skill-description-input"
              rows={3}
              value={draft.description ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="What this skill does for the community."
            />
          </label>

          <label className="agent-capability-field">
            <span className="agent-capability-field-label">Skill instructions</span>
            <textarea
              className="agent-editor-inline-prompt-input community-skill-instructions-input"
              rows={10}
              value={draft.instructions_md}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  instructions_md: event.target.value,
                }))
              }
              placeholder={`Write the reusable skill instructions here.\n\nUse this skill when...\nSteps:\n1. ...\n2. ...`}
            />
          </label>

          <div className="agent-capability-toolbar">
            <div className="model-note">
              Attached skills are injected only when explicitly mentioned, like{" "}
              <code>$my-skill</code>.
            </div>
            <div className="agent-capability-toolbar-actions">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                disabled={isCreatingSkill}
              >
                Cancel
              </button>
              <button
                type="button"
                className="platform-save-button is-dirty"
                onClick={() => void handleCreate()}
                disabled={isCreatingSkill}
              >
                {isCreatingSkill ? "Creating…" : "Create and attach"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="auth-error">{error}</div> : null}
      {packagesError ? <div className="auth-error">{packagesError}</div> : null}
      {mutationError ? <div className="auth-error">{mutationError}</div> : null}

      <div className="agent-capability-list" role="list" aria-label="Skill packages">
        <div className="settings-section-subtitle">Available skill packages</div>
        {isLoadingPackages ? (
          <div className="chat-empty">Loading skill packages…</div>
        ) : packages.length === 0 ? (
          <div className="model-note">No reusable skill packages yet.</div>
        ) : (
          packages.map((skillPackage) => {
            const isAttached = attachedSkillPackageIds.has(skillPackage.id);
            const isAttaching = attachingPackageId === skillPackage.id;
            return (
              <div key={skillPackage.id} className="agent-capability-card" role="listitem">
                <div className="agent-capability-card-header">
                  <div>
                    <div className="settings-section-subtitle">{skillPackage.name}</div>
                    <div className="model-note">
                      ${skillPackage.mentionToken}
                      {skillPackage.description ? ` · ${skillPackage.description}` : ""}
                    </div>
                  </div>
                  <div className="agent-capability-toolbar-actions">
                    <button
                      type="button"
                      onClick={() => void onAttachPackage(skillPackage.id)}
                      disabled={isAttached || isAttaching}
                    >
                      {isAttached ? "Attached" : isAttaching ? "Attaching…" : "Attach"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isLoading ? (
        <div className="chat-empty">Loading skills…</div>
      ) : skills.length === 0 ? (
        <div className="agent-capability-empty">
          <div className="agent-capability-empty-title">No skills attached yet</div>
          <div className="model-note">{emptyState}</div>
        </div>
      ) : (
        <div className="agent-capability-list" role="list" aria-label="Community skills">
          {skills.map((attachment) => {
            const isUpdating = updatingSkillId === attachment.id;
            const isRemoving = removingSkillId === attachment.id;
            return (
              <div key={attachment.id} className="agent-capability-card" role="listitem">
                <div className="agent-capability-card-header">
                  <div>
                    <div className="agent-capability-card-title-row">
                      <div className="settings-section-subtitle">
                        {attachment.skill.name}
                      </div>
                      <span
                        className={`community-app-status-badge${
                          attachment.enabled ? "" : " is-muted"
                        }`}
                      >
                        {attachment.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="model-note">
                      ${attachment.skill.mentionToken}
                      {attachment.skill.description
                        ? ` · ${attachment.skill.description}`
                        : ""}
                    </div>
                  </div>
                  <div className="agent-capability-toolbar-actions">
                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateSkill(attachment.id, {
                          enabled: !attachment.enabled,
                        })
                      }
                      disabled={isUpdating || isRemoving}
                    >
                      {isUpdating
                        ? "Saving…"
                        : attachment.enabled
                          ? "Disable"
                          : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void onDetachSkill(attachment.id)}
                      disabled={isRemoving || isUpdating}
                    >
                      {isRemoving ? "Removing…" : "Detach"}
                    </button>
                  </div>
                </div>

                <div className="agent-capability-metadata">
                  <div className="agent-capability-metadata-item">
                    <span className="agent-capability-metadata-label">Status</span>
                    <span className="agent-capability-metadata-value">
                      {toStatusLabel(attachment.enabled ? "enabled" : "disabled")}
                    </span>
                  </div>
                  <div className="agent-capability-metadata-item">
                    <span className="agent-capability-metadata-label">Invocation</span>
                    <span className="agent-capability-metadata-value">
                      Explicit <code>${attachment.skill.mentionToken}</code>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
