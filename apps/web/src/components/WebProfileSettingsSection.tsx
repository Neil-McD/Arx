import type { DragEvent } from "react";
import type { SocialProfileKind, SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebProfileSettingsSectionProps = {
  session: SessionLike;
  cloudProfile: unknown | null;
  profileAvatarUrl: string | null;
  profileAvatarFocusX: number;
  profileAvatarFocusY: number;
  profileAvatarZoom: number;
  profileName: string;
  profileHandle: string;
  profileBio: string;
  profileSocialLinks: SocialProfileLinks;
  isProfileAvatarDragOver: boolean;
  profileNeedsSave: boolean;
  isSavingProfile: boolean;
  isProfileDirty: boolean;
  profileSaveError: string | null;
  profileSaveSuccess: boolean;
  isProfileAvatarFocusModalOpen: boolean;
  setIsProfileAvatarDragOver: (value: boolean) => void;
  setProfileAvatarFocusX: (value: number) => void;
  setProfileAvatarFocusY: (value: number) => void;
  setProfileAvatarZoom: (value: number) => void;
  setIsProfileAvatarFocusModalOpen: (value: boolean) => void;
  handleProfileAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleProfileAvatarUpload: (file: File | null) => Promise<void> | void;
  onRemoveProfileAvatar: () => void;
  getInitials: (value: string) => string;
  setProfileName: (value: string) => void;
  setProfileHandle: (value: string) => void;
  setProfileBio: (value: string) => void;
  setProfileSocialLink: (kind: SocialProfileKind, value: string) => void;
  saveProfileToCloud: (options?: { socialLinks?: SocialProfileLinks }) => Promise<boolean | void> | boolean | void;
};

export function WebProfileSettingsSection(props: WebProfileSettingsSectionProps) {
  const {
    session,
    cloudProfile,
    profileAvatarUrl,
    profileAvatarFocusX,
    profileAvatarFocusY,
    profileAvatarZoom,
    profileName,
    profileHandle,
    profileBio,
    profileSocialLinks,
    isProfileAvatarDragOver,
    profileNeedsSave,
    isSavingProfile,
    isProfileDirty,
    profileSaveError,
    profileSaveSuccess,
    isProfileAvatarFocusModalOpen,
    setIsProfileAvatarDragOver,
    setProfileAvatarFocusX,
    setProfileAvatarFocusY,
    setProfileAvatarZoom,
    setIsProfileAvatarFocusModalOpen,
    handleProfileAvatarDrop,
    handleProfileAvatarUpload,
    onRemoveProfileAvatar,
    getInitials,
    setProfileName,
    setProfileHandle,
    setProfileBio,
    setProfileSocialLink,
    saveProfileToCloud,
  } = props;

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        Profile
      </div>
      <div className="settings-section-desc">
        {session
          ? "Profile details shown in communities. Save to sync across devices."
          : "Local profile details shown in communities on this device."}
      </div>
      <div className="profile-block">
        <div
          className={`profile-avatar-drop${isProfileAvatarDragOver ? " drag-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsProfileAvatarDragOver(true);
          }}
          onDragLeave={() => setIsProfileAvatarDragOver(false)}
          onDrop={handleProfileAvatarDrop}
        >
          {session ? (
            <UserAvatar
              className="profile-avatar-drop-avatar"
              readyClassName="has-image"
              name={(profileName || session.user.email || "AR").replace(/^@/, "")}
              imageUrl={profileAvatarUrl}
              focusX={profileAvatarFocusX}
              focusY={profileAvatarFocusY}
              zoom={profileAvatarZoom}
              alt="Profile avatar"
              fallback={
                <span>
                  {getInitials(
                    (profileName || session.user.email || "AR").replace(/^@/, ""),
                  )}
                </span>
              }
            />
          ) : (
            <span className="profile-avatar-placeholder" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4.2" />
                <path d="M4.5 20c1.8-4 5-6 7.5-6s5.7 2 7.5 6" />
              </svg>
            </span>
          )}
        </div>
        <div className="profile-avatar-actions">
          <label className="create-avatar-btn">
            Upload photo
            <input
              type="file"
              accept="image/*"
              onChange={(event) => void handleProfileAvatarUpload(event.target.files?.[0] ?? null)}
            />
          </label>
          {session && profileAvatarUrl && (
            <>
              <button
                className="create-avatar-btn"
                type="button"
                onClick={() => setIsProfileAvatarFocusModalOpen(true)}
              >
                Adjust
              </button>
              <button className="create-avatar-remove" type="button" onClick={onRemoveProfileAvatar}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
      <div className="profile-row">
        <input
          type="text"
          placeholder="Name"
          value={profileName}
          onChange={(event) => setProfileName(event.target.value)}
        />
      </div>
      <div className="profile-row profile-handle-row">
        <span className="profile-handle-prefix" aria-hidden="true">@</span>
        <input
          type="text"
          placeholder="handle"
          value={profileHandle}
          onChange={(event) => setProfileHandle(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>
      <textarea
        className="profile-bio"
        placeholder="Bio"
        value={profileBio}
        onChange={(event) => setProfileBio(event.target.value)}
        rows={3}
      />
      <div className="account-row">
        <div className="account-identity">
          <span>Sync</span>
          <strong>
            {session ? (cloudProfile ? "Synced" : "Not synced yet") : "Sign in to sync"}
          </strong>
        </div>
        <div className="auth-actions">
          <button
            className={profileNeedsSave ? "platform-save-button needs-save" : "platform-save-button synced"}
            type="button"
            onClick={() => void saveProfileToCloud()}
            disabled={!session || isSavingProfile || (!isProfileDirty && cloudProfile !== null)}
          >
            {isSavingProfile ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <WebSocialProfileLinksFields
        values={profileSocialLinks}
        disabled={!session || isSavingProfile}
        variant="settings"
        onChange={setProfileSocialLink}
        onSave={(nextLinks) => saveProfileToCloud({ socialLinks: nextLinks })}
      />
      {profileSaveError && <div className="auth-error">{profileSaveError}</div>}
      {profileSaveSuccess && <div className="auth-success">Saved.</div>}
      <WebUserAvatarEditorModal
        isOpen={isProfileAvatarFocusModalOpen}
        avatarUrl={profileAvatarUrl}
        focusX={profileAvatarFocusX}
        focusY={profileAvatarFocusY}
        zoom={profileAvatarZoom}
        title="Adjust profile photo"
        imageAlt="Profile photo preview"
        hint="Drag the image to frame it inside your profile avatar."
        onChangeFocusX={setProfileAvatarFocusX}
        onChangeFocusY={setProfileAvatarFocusY}
        onChangeZoom={setProfileAvatarZoom}
        onDirty={() => undefined}
        onClose={() => setIsProfileAvatarFocusModalOpen(false)}
      />
    </div>
  );
}
