import type { DragEvent } from "react";
import type { SocialProfileKind, SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import { WebUserAvatarEditorModal } from "./WebUserAvatarEditorModal";
import { WebCommunityProfilePanel } from "./WebCommunityProfilePanel";
import type { ProfileCommunityContext, UserProfile } from "../../../../shared/communityTypes";
import {
  PROFILE_BIO_MAX_CHARS,
  PROFILE_DISPLAY_NAME_MAX_CHARS,
} from "../../../../shared/profileText";

// The preview shows the profile itself; communities come from the server.
const PREVIEW_CONTEXT: ProfileCommunityContext = {
  owned_communities: [],
  mutual_communities: [],
  is_self: false,
  can_message: true,
  message_context_community_id: null,
  message_unavailable_reason: null,
};

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebProfileSettingsSectionProps = {
  // Your settings shows the links in a fold of their own.
  hideLinks?: boolean;
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

  const shownName = (profileName.trim() || session?.user.email || "Your name").replace(/^@/, "");
  const linksDisabled = !session || isSavingProfile || isInitialLoad || (!cloudProfile && props.profileLoadStatus === "error");
  // What people see when they click your name, with the edits not yet saved.
  const previewProfile = {
    handle: profileHandle,
    bio: profileBio,
    avatar_url: profileAvatarUrl,
    avatar_focus_x: profileAvatarFocusX,
    avatar_focus_y: profileAvatarFocusY,
    avatar_zoom: profileAvatarZoom,
    social_links: profileSocialLinks,
  } as unknown as UserProfile;

  return (
    <section className="settings-section pn-settings-card pn-profile-editor" aria-labelledby="profile-editor-title">
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title" id="profile-editor-title">About you</h2>
        <p className="settings-section-desc">
          {session ? "How you appear when people click your name, in every community." : "Shown in communities on this device."}
        </p>
      </header>
      <div className="pn-profile-editor-body">
        <div className="pn-profile-editor-form">
          <div
            className={`pn-profile-editor-photo${isProfileAvatarDragOver ? " is-drag-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsProfileAvatarDragOver(true);
            }}
            onDragLeave={() => setIsProfileAvatarDragOver(false)}
            onDrop={handleProfileAvatarDrop}
          >
            <UserAvatar
              identityPending={isInitialLoad && !profileAvatarUrl}
              className="pn-profile-editor-avatar"
              readyClassName="has-image"
              name={shownName}
              imageUrl={profileAvatarUrl}
              focusX={profileAvatarFocusX}
              focusY={profileAvatarFocusY}
              zoom={profileAvatarZoom}
              alt="Profile photo"
              fallback={<span>{getInitials(shownName)}</span>}
            />
            <div className="pn-profile-editor-photo-text">
              <span className="pn-settings-label">Profile photo</span>
              <span className="pn-settings-help">A square picture works best. Drop one here or upload.</span>
              <div className="pn-profile-editor-photo-actions">
                <label className="pn-settings-button pn-profile-editor-upload">
                  {profileAvatarUrl ? "Change" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleProfileAvatarUpload(event.target.files?.[0] ?? null)}
                  />
                </label>
                {session && profileAvatarUrl ? (
                  <>
                    <button className="pn-settings-button" type="button" onClick={() => setIsProfileAvatarFocusModalOpen(true)}>Adjust</button>
                    <button className="pn-settings-button is-danger" type="button" onClick={onRemoveProfileAvatar}>Remove</button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <label className="pn-profile-editor-field">
            <span className="pn-profile-editor-field-head">
              <span className="pn-settings-label">Name</span>
            </span>
            <input
              className="pn-settings-input"
              type="text"
              placeholder="Your name"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              maxLength={PROFILE_DISPLAY_NAME_MAX_CHARS}
            />
          </label>

          <label className="pn-profile-editor-field">
            <span className="pn-profile-editor-field-head">
              <span className="pn-settings-label">Handle</span>
              <span className="pn-settings-help">How people mention you</span>
            </span>
            <span className="pn-settings-affix">
              <span aria-hidden="true">@</span>
              <input
                className="pn-settings-input"
                type="text"
                placeholder="handle"
                value={profileHandle}
                onChange={(event) => setProfileHandle(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </span>
          </label>

          <label className="pn-profile-editor-field">
            <span className="pn-profile-editor-field-head">
              <span className="pn-settings-label">Bio</span>
              <span className="pn-settings-help" aria-live="polite">{profileBio.length}/{PROFILE_BIO_MAX_CHARS}</span>
            </span>
            <textarea
              className="pn-settings-input pn-profile-editor-bio"
              placeholder="A line or two about you and what you're working on"
              value={profileBio}
              onChange={(event) => setProfileBio(event.target.value)}
              rows={4}
              maxLength={PROFILE_BIO_MAX_CHARS}
            />
          </label>

          {props.hideLinks ? null : (
            <WebSocialProfileLinksFields
              values={profileSocialLinks}
              disabled={linksDisabled}
              variant="settings"
              onChange={setProfileSocialLink}
              onSave={(nextLinks) => saveProfileToCloud({ socialLinks: nextLinks })}
            />
          )}
        </div>

        <div className="pn-profile-editor-preview" aria-label="Preview of your profile">
          <span className="pn-profile-editor-preview-label">How people see you</span>
          <div className="pn-profile-editor-preview-card" {...({ inert: "" } as object)}>
            <WebCommunityProfilePanel
              profile={previewProfile}
              displayName={shownName}
              avatarColor="var(--bg-button)"
              communityContext={PREVIEW_CONTEXT}
              isSelfProfile={false}
              onMessage={() => undefined}
              getInitials={getInitials}
              docked
            />
          </div>
        </div>
      </div>

      {props.profileLoadStatus === "error" ? <div className="pn-settings-inline-error pn-profile-editor-error" role="alert">Your profile could not be loaded. Your edits are kept. <button type="button" className="pn-settings-link" onClick={props.reloadProfile}>Retry</button></div> : null}
      {profileSaveError ? <div className="pn-settings-inline-error pn-profile-editor-error" role="alert">{profileSaveError}</div> : null}

      <footer className="pn-settings-card-footer">
        <span className={`pn-profile-editor-status${isProfileDirty ? " is-dirty" : ""}`} role="status">{syncLabel}</span>
        <button
          className="pn-settings-button is-primary platform-save-button"
          type="button"
          onClick={() => void saveProfileToCloud()}
          disabled={!session || isSavingProfile || !profileNeedsSave}
        >
          {isSavingProfile ? "Saving…" : "Save"}
        </button>
      </footer>
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
    </section>
  );
}
