import { useState } from "react";

import type { EffectiveSkill } from "../../../../shared/effectiveSkills";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";

export type WebSkillsSettingsSectionProps = {
  session: {
    user: {
      id: string;
      email?: string | null;
    };
  } | null;
  effectiveSkills: EffectiveSkill[];
  isLoadingEffectiveSkills: boolean;
  effectiveSkillsError: string | null;
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
  showHeader?: boolean;
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
        <span className="agent-capability-field-label">Optional description</span>
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

export function WebSkillsSettingsSection(props: WebSkillsSettingsSectionProps) {
  const {
    session,
    effectiveSkills,
    isLoadingEffectiveSkills,
    effectiveSkillsError,
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
    showHeader = true,
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
    <>
      {showHeader ? (
        <div className="integrations-header">
          <div className="panel-title">Skills</div>
        </div>
      ) : null}
      <div className="settings-section">
        <div className="settings-section-title">Harness skills</div>
        <div className="settings-section-desc">
          Personal skills and selected-community skills are available through
          the same native harness context.
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
                    Personal skills apply only when explicitly mentioned, such
                    as <code>$weekly-research</code>.
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
                      {isCreatingUserPlatformSkill
                        ? "Creating…"
                        : "Create skill"}
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
            {effectiveSkillsError ? (
              <div className="auth-error">{effectiveSkillsError}</div>
            ) : null}

            {isLoadingEffectiveSkills || isLoadingUserPlatformSkills ? (
              <div className="model-note">Loading harness skills…</div>
            ) : effectiveSkills.length === 0 ? (
              <div className="model-note">
                No skills yet. Create the first personal skill here.
              </div>
            ) : (
              <div
                className="agent-capability-list"
                role="list"
                aria-label="Harness skills"
              >
                {effectiveSkills.map((effectiveSkill) => {
                  const install = effectiveSkill.personal_install;
                  const attachment = effectiveSkill.community_attachment;
                  const isPlatform = effectiveSkill.scope === "platform";
                  const isUpdating = install
                    ? updatingUserPlatformSkillInstallId === install.id
                    : false;
                  const isRemoving = install
                    ? removingUserPlatformSkillInstallId === install.id
                    : false;
                  const isEditing = install
                    ? editingUserPlatformSkillInstallId === install.id
                    : false;
                  const scopeLabel = isPlatform
                    ? "Platform default"
                    : attachment
                      ? install
                        ? "Personal + community"
                        : "Selected community"
                      : "Personal baseline";
                  const statusLabel = isPlatform
                    ? "Built in"
                    : effectiveSkill.enabled_for_current_context
                      ? "Enabled"
                      : "Disabled";
                  return (
                    <div
                      key={effectiveSkill.skill_identity_key}
                      className="agent-capability-card"
                      role="listitem"
                    >
                      <div className="agent-capability-card-header">
                        <div>
                          <div className="agent-capability-card-title-row">
                            <div className="settings-section-subtitle">
                              {effectiveSkill.skill.name}
                            </div>
                            <span
                              className={`community-app-status-badge${
                                effectiveSkill.enabled_for_current_context
                                  ? ""
                                  : " is-muted"
                              }`}
                            >
                              {statusLabel}
                            </span>
                            {isPlatform ? (
                              <span className="community-app-status-badge">
                                Platform
                              </span>
                            ) : null}
                            {attachment ? (
                              <span className="community-app-status-badge">
                                Community
                              </span>
                            ) : null}
                          </div>
                          <div className="model-note">
                            ${effectiveSkill.skill.mentionToken}
                            {effectiveSkill.skill.description
                              ? ` · ${effectiveSkill.skill.description}`
                              : ""}
                          </div>
                        </div>
                        {install && effectiveSkill.can_edit ? (
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
                                install.enabled
                                  ? "Disable skill"
                                  : "Enable skill"
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
                        ) : null}
                      </div>

                      <div className="agent-capability-metadata">
                        <div className="agent-capability-metadata-item">
                          <span className="agent-capability-metadata-label">
                            Scope
                          </span>
                          <span className="agent-capability-metadata-value">
                            {scopeLabel}
                          </span>
                        </div>
                        <div className="agent-capability-metadata-item">
                          <span className="agent-capability-metadata-label">
                            Invocation
                          </span>
                          <span className="agent-capability-metadata-value">
                            {isPlatform ? (
                              "Available by default"
                            ) : (
                              <>
                                Explicit{" "}
                                <code>
                                  ${effectiveSkill.skill.mentionToken}
                                </code>
                              </>
                            )}
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
                                  setEditingSkillDraft(
                                    buildInitialSkillDraft(),
                                  );
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
    </>
  );
}
