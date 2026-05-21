import { useEffect, useState } from "react";
import {
  SOCIAL_PROFILE_KINDS,
  normalizeSocialProfileUrl,
  type SocialProfileKind,
  type SocialProfileLinks,
} from "../../../../shared/socialProfileLinks";
import { SocialProfileIcon } from "./SocialProfileIcon";

type WebSocialProfileLinksFieldsProps = {
  values: SocialProfileLinks;
  disabled?: boolean;
  variant?: "onboarding" | "settings";
  onChange: (kind: SocialProfileKind, value: string) => void;
  onSave?: (values: SocialProfileLinks) => Promise<void> | void;
};

const SOCIAL_PROFILE_LABELS: Record<SocialProfileKind, string> = {
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
};

const SOCIAL_PROFILE_PLACEHOLDERS: Record<SocialProfileKind, string> = {
  youtube: "youtube.com/@handle",
  x: "x.com/handle",
  instagram: "instagram.com/handle",
};

const SOCIAL_PROFILE_ERROR_LABELS: Record<SocialProfileKind, string> = {
  youtube: "Enter a valid YouTube profile URL.",
  x: "Enter a valid X profile URL.",
  instagram: "Enter a valid Instagram profile URL.",
};

export function WebSocialProfileLinksFields({
  values,
  disabled = false,
  variant = "settings",
  onChange,
  onSave,
}: WebSocialProfileLinksFieldsProps) {
  const [editingKind, setEditingKind] = useState<SocialProfileKind | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const editingLabel = editingKind ? SOCIAL_PROFILE_LABELS[editingKind] : "";

  useEffect(() => {
    if (!editingKind) return;
    setDraftUrl(values[editingKind]);
  }, [editingKind, values]);

  const openEditor = (kind: SocialProfileKind) => {
    setEditingKind(kind);
    setDraftUrl(values[kind]);
    setError(null);
  };

  const closeEditor = () => {
    setEditingKind(null);
    setDraftUrl("");
    setError(null);
  };

  const saveEditor = async () => {
    if (!editingKind) return;
    const trimmed = draftUrl.trim();
    const normalized = normalizeSocialProfileUrl(editingKind, trimmed);
    if (trimmed && !normalized) {
      setError(SOCIAL_PROFILE_ERROR_LABELS[editingKind]);
      return;
    }
    const nextLinks = {
      ...values,
      [editingKind]: normalized ?? "",
    };
    onChange(editingKind, nextLinks[editingKind]);
    await onSave?.(nextLinks);
    closeEditor();
  };

  return (
    <>
      <div className={`web-social-profile-links ${variant}`} aria-label="Social profile links">
        {SOCIAL_PROFILE_KINDS.map((kind) => {
          const hasValue = Boolean(values[kind].trim());
          return (
            <button
              key={kind}
              className={`web-social-profile-link-button${hasValue ? " connected" : ""}`}
              type="button"
              disabled={disabled}
              aria-label={`${hasValue ? "Edit" : "Add"} ${SOCIAL_PROFILE_LABELS[kind]} profile URL`}
              title={`${hasValue ? "Edit" : "Add"} ${SOCIAL_PROFILE_LABELS[kind]} profile URL`}
              onClick={() => openEditor(kind)}
            >
              <SocialProfileIcon kind={kind} />
            </button>
          );
        })}
      </div>

      {editingKind ? (
        <div className="web-social-profile-modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <form
            className="web-social-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="web-social-profile-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor();
            }}
          >
            <div className="web-social-profile-modal-header">
              <span className="web-social-profile-modal-icon" aria-hidden="true">
                <SocialProfileIcon kind={editingKind} />
              </span>
              <div>
                <h2 id="web-social-profile-modal-title">{editingLabel}</h2>
                <p>Paste your profile link.</p>
              </div>
              <button
                className="web-social-profile-modal-close"
                type="button"
                aria-label="Close"
                onClick={closeEditor}
              >
                X
              </button>
            </div>

            <label className="web-social-profile-modal-field">
              <span>{editingLabel} URL</span>
              <input
                type="url"
                autoFocus
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={SOCIAL_PROFILE_PLACEHOLDERS[editingKind]}
                value={draftUrl}
                onChange={(event) => {
                  setDraftUrl(event.target.value);
                  setError(null);
                }}
              />
            </label>
            {error ? <div className="web-social-profile-modal-error">{error}</div> : null}

            <div className="web-social-profile-modal-actions">
              <button type="button" className="web-social-profile-modal-secondary" onClick={closeEditor}>
                Cancel
              </button>
              <button type="submit" className="web-social-profile-modal-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
