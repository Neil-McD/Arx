import { useEffect, useRef, type DragEvent } from "react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { SettingsGroup, SettingsRow } from "./SettingsRows";
import type { SocialProfileKind, SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";
import {
  PROFILE_BIO_MAX_CHARS,
  PROFILE_DISPLAY_NAME_MAX_CHARS,
} from "../../../../shared/profileText";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebProfileSettingsSectionProps = {
  profileLoadStatus?: "idle" | "loading" | "ready" | "missing" | "error";
  reloadProfile?: () => void;
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
  return isDesignV1Active() ? <ProfileSettingsV1 {...props} /> : <ProfileSettingsClassic {...props} />;
}

// Design v1, one Settings page: Profile as rows, saving as you go (a field
// saves when you leave it; a photo when it changes).
function ProfileSettingsV1(props: WebProfileSettingsSectionProps) {
  const { session, cloudProfile, profileNeedsSave, isSavingProfile, saveProfileToCloud } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isInitialLoad = Boolean(session && !cloudProfile && (props.profileLoadStatus === "idle" || props.profileLoadStatus === "loading"));
  const latest = useRef({ profileNeedsSave, isSavingProfile, saveProfileToCloud });
  latest.current = { profileNeedsSave, isSavingProfile, saveProfileToCloud };
  const trySave = () => {
    const now = latest.current;
    if (!session || !now.profileNeedsSave || now.isSavingProfile) return;
    const active = document.activeElement;
    if (active && rootRef.current?.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && (active as HTMLInputElement).type !== "file") return;
    void now.saveProfileToCloud();
  };
  // A new or adjusted photo saves at once.
  // ...and a save that finishes while edits are still unsaved goes again.
  const photo = [props.profileAvatarUrl, props.profileAvatarFocusX, props.profileAvatarFocusY, props.profileAvatarZoom, props.isProfileAvatarFocusModalOpen, isSavingProfile].join("|");
  useEffect(() => { if (!props.isProfileAvatarFocusModalOpen) window.setTimeout(trySave, 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [photo]);
  const name = (props.profileName || session?.user.email || "AR").replace(/^@/, "");
  return (
    <div ref={rootRef} className="settings-v1-page-body" onBlur={() => window.setTimeout(trySave, 0)}>
      <SettingsGroup>
        <SettingsRow label="Photo">
          <div
            className={`settings-v1-photo${props.isProfileAvatarDragOver ? " is-drag" : ""}`}
            onDragOver={(event) => { event.preventDefault(); props.setIsProfileAvatarDragOver(true); }}
            onDragLeave={() => props.setIsProfileAvatarDragOver(false)}
            onDrop={props.handleProfileAvatarDrop}
          >
            <UserAvatar
              identityPending={isInitialLoad && !props.profileAvatarUrl}
              className="settings-v1-logo is-round"
              readyClassName="has-image"
              name={name}
              imageUrl={props.profileAvatarUrl}
              focusX={props.profileAvatarFocusX}
              focusY={props.profileAvatarFocusY}
              zoom={props.profileAvatarZoom}
              alt="Your photo"
              fallback={<span>{props.getInitials(name)}</span>}
            />
          </div>
          <label className="settings-v1-button">
            {props.profileAvatarUrl ? "Change" : "Upload"}
            <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void props.handleProfileAvatarUpload(file); }} />
          </label>
          {session && props.profileAvatarUrl ? (
            <>
              <button className="settings-v1-button" type="button" onClick={() => props.setIsProfileAvatarFocusModalOpen(true)}>Adjust</button>
              <button className="settings-v1-button is-quiet" type="button" onClick={props.onRemoveProfileAvatar}>Remove</button>
            </>
          ) : null}
        </SettingsRow>
        <SettingsRow label="Name" htmlFor="settings-profile-name">
          <input id="settings-profile-name" className="settings-v1-input" type="text" value={props.profileName}
            maxLength={PROFILE_DISPLAY_NAME_MAX_CHARS} onChange={(event) => props.setProfileName(event.target.value)} />
        </SettingsRow>
        <SettingsRow label="Handle" htmlFor="settings-profile-handle" help="How people mention you.">
          <span className="settings-v1-prefixed">
            <span aria-hidden="true">@</span>
            <input id="settings-profile-handle" className="settings-v1-input" type="text" value={props.profileHandle}
              autoCapitalize="none" autoCorrect="off" onChange={(event) => props.setProfileHandle(event.target.value)} />
          </span>
        </SettingsRow>
        <SettingsRow label="Bio" htmlFor="settings-profile-bio" stacked>
          <textarea id="settings-profile-bio" className="settings-v1-input" rows={3} value={props.profileBio}
            maxLength={PROFILE_BIO_MAX_CHARS} placeholder="A line or two about you." onChange={(event) => props.setProfileBio(event.target.value)} />
        </SettingsRow>
        <SettingsRow label="Links" help="Shown on your profile.">
          <WebSocialProfileLinksFields
            values={props.profileSocialLinks}
            disabled={!session || isSavingProfile || isInitialLoad || (!cloudProfile && props.profileLoadStatus === "error")}
            variant="settings"
            onChange={props.setProfileSocialLink}
            onSave={(nextLinks) => saveProfileToCloud({ socialLinks: nextLinks })}
          />
        </SettingsRow>
      </SettingsGroup>
      {props.profileLoadStatus === "error" ? (
        <p className="settings-v1-error" role="alert">Your profile couldn't be loaded. Your edits are kept. <button type="button" className="settings-v1-button is-quiet" onClick={props.reloadProfile}>Retry</button></p>
      ) : null}
      <WebUserAvatarEditorModal
        isOpen={props.isProfileAvatarFocusModalOpen}
        avatarUrl={props.profileAvatarUrl}
        focusX={props.profileAvatarFocusX}
        focusY={props.profileAvatarFocusY}
        zoom={props.profileAvatarZoom}
        title="Adjust your photo"
        imageAlt="Your photo"
        hint="Drag the image to frame it."
        onChangeFocusX={props.setProfileAvatarFocusX}
        onChangeFocusY={props.setProfileAvatarFocusY}
        onChangeZoom={props.setProfileAvatarZoom}
        onDirty={() => undefined}
        onClose={() => props.setIsProfileAvatarFocusModalOpen(false)}
      />
    </div>
  );
}

function ProfileSettingsClassic(props: WebProfileSettingsSectionProps) {
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
  const isInitialLoad = Boolean(session && !cloudProfile && (props.profileLoadStatus === "idle" || props.profileLoadStatus === "loading"));
  const syncLabel = !session ? "Sign in to sync" : isSavingProfile ? "Saving…" : props.profileLoadStatus === "error" ? "Could not refresh profile" : isInitialLoad ? "Loading profile…" : isProfileDirty ? "Unsaved changes" : cloudProfile ? "Saved" : "Not saved yet";

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
              identityPending={isInitialLoad && !profileAvatarUrl}
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
          aria-label="Name"
          value={profileName}
          onChange={(event) => setProfileName(event.target.value)}
          maxLength={PROFILE_DISPLAY_NAME_MAX_CHARS}
        />
      </div>
      <div className="profile-row profile-handle-row">
        <span className="profile-handle-prefix" aria-hidden="true">@</span>
        <input
          type="text"
          placeholder="handle"
          aria-label="Handle"
          value={profileHandle}
          onChange={(event) => setProfileHandle(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>
      <textarea
        className="profile-bio"
        placeholder="Bio"
        aria-label="Bio"
        value={profileBio}
        onChange={(event) => setProfileBio(event.target.value)}
        rows={3}
        maxLength={PROFILE_BIO_MAX_CHARS}
      />
      <div className="account-row">
        <div className="account-identity">
          <span>Sync</span>
          <strong role="status">{syncLabel}</strong>
        </div>
        <div className="auth-actions">
          <button
            className={profileNeedsSave ? "platform-save-button needs-save" : "platform-save-button synced"}
            type="button"
            onClick={() => void saveProfileToCloud()}
            disabled={!session || isSavingProfile || !profileNeedsSave}
          >
            {isSavingProfile ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <WebSocialProfileLinksFields
        values={profileSocialLinks}
        disabled={!session || isSavingProfile || isInitialLoad || (!cloudProfile && props.profileLoadStatus === "error")}
        variant="settings"
        onChange={setProfileSocialLink}
        onSave={(nextLinks) => saveProfileToCloud({ socialLinks: nextLinks })}
      />
      {props.profileLoadStatus === "error" && <div className="auth-error" role="alert">Your profile could not be loaded. Your edits are preserved. <button type="button" onClick={props.reloadProfile}>Retry</button></div>}
      {profileSaveError && <div className="auth-error" role="alert">{profileSaveError}</div>}
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
