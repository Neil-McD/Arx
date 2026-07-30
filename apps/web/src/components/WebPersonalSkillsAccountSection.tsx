import { useState } from "react";

import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";

export type WebPersonalSkillsAccountSectionProps = {
  session: {
    user: {
      id: string;
      email?: string | null;
    };
  } | null;
  userPlatformSkills: UserPlatformInstalledSkill[];
  isLoadingUserPlatformSkills: boolean;
  userPlatformSkillError: string | null;
  userPlatformSkillMutationError: string | null;
  isCreatingUserPlatformSkill: boolean;
  updatingUserPlatformSkillInstallId: string | null;
  removingUserPlatformSkillInstallId: string | null;
  onCreateUserPlatformSkill: (
    input: CreateSkillPackageInput,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onSaveUserPlatformSkill: (
    userPlatformSkillInstallId: string,
    input: CreateSkillPackageInput,
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onUpdateUserPlatformSkill: (
    userPlatformSkillInstallId: string,
    patch: { enabled?: boolean },
  ) => Promise<void> | Promise<boolean> | boolean | void;
  onDeleteUserPlatformSkill: (
    userPlatformSkillInstallId: string,
  ) => Promise<void> | Promise<boolean> | boolean | void;
};

function buildInitialSkillDraft(): CreateSkillPackageInput {
  return {
    name: "",
    description: "",
    instructions_md: "",
  };
}

function buildSkillDraftFromInstall(
  install: UserPlatformInstalledSkill,
): CreateSkillPackageInput {
  return {
    name: install.skill.name,
    description: install.skill.description ?? "",
    instructions_md: install.skill.instructionsMd,
  };
}

function SkillDraftFields({
  draft,
  onChange,
}: {
  draft: CreateSkillPackageInput;
  onChange: (draft: CreateSkillPackageInput) => void;
}) {
  return (
    <>
      <label className="agent-capability-field">
        <span className="agent-capability-field-label">Skill name</span>
        <input
          className="agent-editor-inline-label-input"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Weekly research"
        />
      </label>
      <label className="agent-capability-field">
        <span className="agent-capability-field-label">
          Optional description
        </span>
        <textarea
          className="agent-editor-inline-prompt-input community-skill-description-input"
          rows={3}
          value={draft.description ?? ""}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
          placeholder="What this skill should help you do."
        />
      </label>
      <label className="agent-capability-field">
        <span className="agent-capability-field-label">Skill instructions</span>
        <textarea
          className="agent-editor-inline-prompt-input community-skill-instructions-input"
          rows={10}
          value={draft.instructions_md}
          onChange={(event) =>
            onChange({ ...draft, instructions_md: event.target.value })
          }
          placeholder={`Write the reusable skill instructions here.\n\nUse this skill when...\nSteps:\n1. ...\n2. ...`}
        />
      </label>
    </>
  );
}

export function WebPersonalSkillsAccountSection(
  props: WebPersonalSkillsAccountSectionProps,
) {
  const {
    session,
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    userPlatformSkillMutationError,
    isCreatingUserPlatformSkill,
    updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId,
    onCreateUserPlatformSkill,
    onSaveUserPlatformSkill,
    onUpdateUserPlatformSkill,
    onDeleteUserPlatformSkill,
  } = props;
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState<CreateSkillPackageInput>(
    buildInitialSkillDraft,
  );
  const [
    editingUserPlatformSkillInstallId,
    setEditingUserPlatformSkillInstallId,
  ] = useState<string | null>(null);
  const [editingSkillDraft, setEditingSkillDraft] =
    useState<CreateSkillPackageInput>(buildInitialSkillDraft);

  const handleCreatePersonalSkill = async () => {
    const ok = await onCreateUserPlatformSkill(skillDraft);
    if (!ok) return;
    setSkillDraft(buildInitialSkillDraft());
    setIsCreateSkillOpen(false);
  };

  const handleSavePersonalSkill = async () => {
    if (!editingUserPlatformSkillInstallId) return;
    const ok = await onSaveUserPlatformSkill(
      editingUserPlatformSkillInstallId,
      editingSkillDraft,
    );
    if (!ok) return;
    setEditingUserPlatformSkillInstallId(null);
    setEditingSkillDraft(buildInitialSkillDraft());
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">Personal skills</div>
      <div className="settings-section-desc">
        Create private behavior packages for your personal harness. Community
        skills are managed inside each community.
      </div>
      {!session ? (
        <div className="model-note">
          Sign in to create personal skills for your agent.
        </div>
      ) : (
        <>
          <div className="agent-capability-toolbar">
            <button
              type="button"
              onClick={() => setIsCreateSkillOpen((value) => !value)}
              disabled={isCreatingUserPlatformSkill}
            >
              {isCreateSkillOpen ? "Close" : "Create custom skill"}
            </button>
          </div>

          {isCreateSkillOpen ? (
            <div className="agent-capability-card community-skill-create-card">
              <div className="agent-canvas-target-kicker">
                Create personal skill package
              </div>
              <SkillDraftFields draft={skillDraft} onChange={setSkillDraft} />
              <div className="agent-capability-toolbar">
                <div className="model-note">
                  Personal skills apply only when explicitly mentioned, such as{" "}
                  <code>$weekly-research</code>.
                </div>
                <div className="agent-capability-toolbar-actions">
                  <button
                    type="button"
                    onClick={() => setIsCreateSkillOpen(false)}
                    disabled={isCreatingUserPlatformSkill}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="platform-save-button is-dirty"
                    onClick={() => void handleCreatePersonalSkill()}
                    disabled={isCreatingUserPlatformSkill}
                  >
                    {isCreatingUserPlatformSkill ? "Creating…" : "Create skill"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {userPlatformSkillError ? (
            <div className="auth-error">{userPlatformSkillError}</div>
          ) : null}
          {userPlatformSkillMutationError ? (
            <div className="auth-error">{userPlatformSkillMutationError}</div>
          ) : null}
          {isLoadingUserPlatformSkills ? (
            <div className="model-note">Loading personal skills…</div>
          ) : userPlatformSkills.length === 0 ? (
            <div className="model-note">
              No skills yet. Create the first personal skill here.
            </div>
          ) : (
            <div
              className="agent-capability-list"
              role="list"
              aria-label="Personal skills"
            >
              {userPlatformSkills.map((install) => {
                const isUpdating =
                  updatingUserPlatformSkillInstallId === install.id;
                const isRemoving =
                  removingUserPlatformSkillInstallId === install.id;
                const isEditing =
                  editingUserPlatformSkillInstallId === install.id;
                return (
                  <div
                    key={install.id}
                    className="agent-capability-card"
                    role="listitem"
                  >
                    <div className="agent-capability-card-header">
                      <div>
                        <div className="agent-capability-card-title-row">
                          <div className="settings-section-subtitle">
                            {install.skill.name}
                          </div>
                          <span
                            className={`community-app-status-badge${
                              install.enabled ? "" : " is-muted"
                            }`}
                          >
                            {install.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <div className="model-note">
                          ${install.skill.mentionToken}
                          {install.skill.description
                            ? ` · ${install.skill.description}`
                            : ""}
                        </div>
                      </div>
                      <div className="agent-capability-toolbar-actions">
                        <button
                          type="button"
                          disabled={isUpdating || isRemoving}
                          onClick={() => {
                            if (isEditing) {
                              setEditingUserPlatformSkillInstallId(null);
                              setEditingSkillDraft(buildInitialSkillDraft());
                              return;
                            }
                            setEditingUserPlatformSkillInstallId(install.id);
                            setEditingSkillDraft(
                              buildSkillDraftFromInstall(install),
                            );
                          }}
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                        <label
                          className={`members-switch${
                            isUpdating || isRemoving ? " is-disabled" : ""
                          }`}
                          title={
                            install.enabled ? "Disable skill" : "Enable skill"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={install.enabled}
                            disabled={isUpdating || isRemoving}
                            aria-label={`${
                              install.enabled ? "Disable" : "Enable"
                            } ${install.skill.name}`}
                            onChange={() =>
                              void onUpdateUserPlatformSkill(install.id, {
                                enabled: !install.enabled,
                              })
                            }
                          />
                          <span className="members-switch-track">
                            <span className="members-switch-thumb" />
                          </span>
                        </label>
                        <button
                          type="button"
                          className="danger"
                          disabled={isUpdating || isRemoving}
                          onClick={() =>
                            void onDeleteUserPlatformSkill(install.id)
                          }
                        >
                          {isRemoving ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="agent-capability-metadata">
                      <div className="agent-capability-metadata-item">
                        <span className="agent-capability-metadata-label">
                          Scope
                        </span>
                        <span className="agent-capability-metadata-value">
                          Personal
                        </span>
                      </div>
                      <div className="agent-capability-metadata-item">
                        <span className="agent-capability-metadata-label">
                          Invocation
                        </span>
                        <span className="agent-capability-metadata-value">
                          Explicit <code>${install.skill.mentionToken}</code>
                        </span>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="agent-capability-card community-skill-create-card">
                        <SkillDraftFields
                          draft={editingSkillDraft}
                          onChange={setEditingSkillDraft}
                        />
                        <div className="agent-capability-toolbar">
                          <div className="model-note">
                            Editing updates the canonical package and attached
                            community uses.
                          </div>
                          <div className="agent-capability-toolbar-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserPlatformSkillInstallId(null);
                                setEditingSkillDraft(buildInitialSkillDraft());
                              }}
                              disabled={isUpdating || isRemoving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="platform-save-button is-dirty"
                              onClick={() => void handleSavePersonalSkill()}
                              disabled={isUpdating || isRemoving}
                            >
                              {isUpdating ? "Saving…" : "Save skill"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
