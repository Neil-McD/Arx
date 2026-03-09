import type { DragEvent } from "react";

type CloudSessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebProfileSettingsSectionProps = {
  cloudSession: CloudSessionLike;
  cloudProfile: unknown | null;
  profileAvatarUrl: string | null;
  profileName: string;
  profileUsername: string;
  profileBio: string;
  isProfileAvatarDragOver: boolean;
  profileNeedsSave: boolean;
  isSavingProfile: boolean;
  isProfileDirty: boolean;
  profileSaveError: string | null;
  profileSaveSuccess: boolean;
  setIsProfileAvatarDragOver: (value: boolean) => void;
  handleProfileAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleProfileAvatarUpload: (file: File | null) => Promise<void> | void;
  setProfileAvatarUrl: (value: string | null) => void;
  getInitials: (value: string) => string;
  setProfileName: (value: string) => void;
  setProfileUsername: (value: string) => void;
  setProfileBio: (value: string) => void;
  saveProfileToCloud: () => Promise<void> | void;
};

export function WebProfileSettingsSection(props: WebProfileSettingsSectionProps) {
  const {
    cloudSession,
    cloudProfile,
    profileAvatarUrl,
    profileName,
    profileUsername,
    profileBio,
    isProfileAvatarDragOver,
    profileNeedsSave,
    isSavingProfile,
    isProfileDirty,
    profileSaveError,
    profileSaveSuccess,
    setIsProfileAvatarDragOver,
    handleProfileAvatarDrop,
    handleProfileAvatarUpload,
    setProfileAvatarUrl,
    getInitials,
    setProfileName,
    setProfileUsername,
    setProfileBio,
    saveProfileToCloud,
  } = props;

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        Profile
      </div>
      <div className="settings-section-desc">
        {cloudSession
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
          {cloudSession && profileAvatarUrl ? (
            <img src={profileAvatarUrl} alt="Profile avatar" draggable={false} />
          ) : cloudSession ? (
            <span>
              {getInitials(
                (profileName || profileUsername || cloudSession.user.email || "AR").replace(/^@/, ""),
              )}
            </span>
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
          {cloudSession && profileAvatarUrl && (
            <button className="create-avatar-remove" type="button" onClick={() => setProfileAvatarUrl(null)}>
              Remove
            </button>
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
        <input
          type="text"
          placeholder="Username"
          value={profileUsername}
          onChange={(event) => setProfileUsername(event.target.value)}
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
            {cloudSession ? (cloudProfile ? "Synced" : "Not synced yet") : "Sign in to sync"}
          </strong>
        </div>
        <div className="auth-actions">
          <button
            className={profileNeedsSave ? "platform-save-button needs-save" : "platform-save-button synced"}
            type="button"
            onClick={() => void saveProfileToCloud()}
            disabled={!cloudSession || isSavingProfile || (!isProfileDirty && cloudProfile !== null)}
          >
            {isSavingProfile ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {profileSaveError && <div className="auth-error">{profileSaveError}</div>}
      {profileSaveSuccess && <div className="auth-success">Saved.</div>}
    </div>
  );
}
