import { useEffect, useRef, type DragEvent } from "react";
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

// Profile as rows, saving as you go (a field saves when you leave it; a photo when it changes).
export function WebProfileSettingsSection(props: WebProfileSettingsSectionProps) {
  const { session, cloudProfile, profileNeedsSave, isSavingProfile, saveProfileToCloud } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isInitialLoad = Boolean(session && !cloudProfile && (props.profileLoadStatus === "idle" || props.profileLoadStatus === "loading"));
  const latest = useRef({
    profileNeedsSave,
    isSavingProfile,
    profileSaveError: props.profileSaveError,
    saveProfileToCloud,
  });
  latest.current = {
    profileNeedsSave,
    isSavingProfile,
    profileSaveError: props.profileSaveError,
    saveProfileToCloud,
  };
  const trySave = (options?: { allowRetryAfterError?: boolean }) => {
    const now = latest.current;
    if (!session || !now.profileNeedsSave || now.isSavingProfile) return;
    if (!options?.allowRetryAfterError && now.profileSaveError) return;
    const active = document.activeElement;
    if (active && rootRef.current?.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && (active as HTMLInputElement).type !== "file") return;
    void now.saveProfileToCloud();
  };
  // A new or adjusted photo saves at once, and a save that finishes while edits
  // are still unsaved goes again (unless the previous save failed).
  const photo = [props.profileAvatarUrl, props.profileAvatarFocusX, props.profileAvatarFocusY, props.profileAvatarZoom, props.isProfileAvatarFocusModalOpen, isSavingProfile].join("|");
  const prevPhotoRef = useRef(photo);
  useEffect(() => {
    if (prevPhotoRef.current === photo) return;
    prevPhotoRef.current = photo;
    if (props.isProfileAvatarFocusModalOpen) return;
    const timer = window.setTimeout(() => trySave(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, props.isProfileAvatarFocusModalOpen]);
  const name = (props.profileName || session?.user.email || "AR").replace(/^@/, "");
  return (
    <div ref={rootRef} className="settings-v1-page-body" onBlur={() => window.setTimeout(() => trySave({ allowRetryAfterError: true }), 0)}>
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
      {props.profileSaveError ? (
        <p className="settings-v1-error" role="alert">{props.profileSaveError}</p>
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
