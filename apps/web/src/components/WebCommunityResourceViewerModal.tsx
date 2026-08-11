import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";

import { normalizeExternalUrl, parseEmbedUrl, StableMediaEmbedFrame } from "../../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../../shared/markdownUi";
import type { CommunityResource } from "./communityResourcesContracts";

type WebCommunityResourceViewerModalProps = {
  resource: CommunityResource | null;
  onClose: () => void;
};

type WebCommunityResourceViewerContentProps = {
  resource: CommunityResource;
  editor?: WebCommunityResourceInlineEditor | null;
};

export type WebCommunityResourceInlineEditorField = "title" | "body" | "pin";

export type WebCommunityResourceInlineEditor = {
  canEdit: boolean;
  isEditing: boolean;
  activeField: WebCommunityResourceInlineEditorField | null;
  titleInput: string;
  bodyInput: string;
  pinnedInput: boolean;
  error: string | null;
  isSaving: boolean;
  isDirty: boolean;
  canSave: boolean;
  onBeginEdit: (field: WebCommunityResourceInlineEditorField) => void;
  onSetActiveField: (field: WebCommunityResourceInlineEditorField) => void;
  onChangeTitle: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangePinned: (value: boolean) => void;
  onSave: () => Promise<boolean> | boolean;
  onCancel: () => void;
};

function getHostLabel(rawUrl: string | null): string {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return "External";
  return url.hostname.replace(/^www\./i, "");
}

function getEmbedProviderLabel(provider: string | null | undefined): string {
  if (provider === "youtube") return "YouTube";
  if (provider === "wistia") return "Wistia";
  return "Video";
}

const RESOURCE_BODY_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "iframe",
  "video",
  "audio",
  "embed",
  "object",
  "figure",
  "[role='button']",
  "[contenteditable='true']",
  "[data-resource-media='true']",
  ".md-media-embed",
  ".md-media-embed-frame",
  ".resource-viewer-embed",
].join(", ");

function hasStoredBodyContent(resource: CommunityResource): boolean {
  const bodyChars = Number(resource.body_chars ?? 0);
  return Number.isFinite(bodyChars) && bodyChars > 0;
}

function PinIcon() {
  return (
    <svg className="resource-viewer-pin-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6" />
      <path d="M10 3v6l-3 3v1h10v-1l-3-3V3" />
      <path d="M12 13v8" />
    </svg>
  );
}

function ExternalArrowIcon() {
  return (
    <svg className="resource-viewer-external-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function WebCommunityResourceViewerContent(props: WebCommunityResourceViewerContentProps) {
  const { resource, editor = null } = props;
  const currentUrl = resource.url;
  const embed = currentUrl ? parseEmbedUrl(currentUrl) : null;
  const sourceUrl = normalizeExternalUrl(currentUrl);
  const hostLabel = getHostLabel(currentUrl);
  const persistedBody = resource.body_md?.trim() ?? "";
  const trimmedBody = editor?.isEditing ? editor.bodyInput.trim() : persistedBody;
  const titleText = editor?.isEditing ? editor.titleInput : resource.title;
  const bodyText = editor?.isEditing ? editor.bodyInput : persistedBody;
  const hasBody = trimmedBody.length > 0;
  const hasDeferredBody = !editor?.isEditing && !hasBody && hasStoredBodyContent(resource);
  const verificationLink: { label: string; href: string } | null = sourceUrl
    ? {
        label: embed
          ? `Watch on ${getEmbedProviderLabel(embed.provider)}`
          : `Read on ${hostLabel}`,
        href: sourceUrl.toString(),
      }
    : null;
  const isEmpty = !embed && !hasBody && !hasDeferredBody && !verificationLink;
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canEdit = Boolean(editor?.canEdit);
  const isEditing = Boolean(editor?.isEditing);
  const activeField = editor?.activeField ?? null;
  const isTitleEditing = isEditing && activeField === "title";
  const isBodyEditing = isEditing && activeField === "body";
  const isPinned = editor?.isEditing ? editor.pinnedInput : resource.pinned;
  const renderedBodyMarkdown = useMemo(
    () => (hasBody ? renderMarkdown(trimmedBody, { embedStandaloneMedia: true }) : null),
    [hasBody, trimmedBody],
  );

  const syncBodyTextareaHeight = () => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(() => {
    if (!isTitleEditing) return;
    const timeoutId = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isTitleEditing, resource.id]);

  useEffect(() => {
    if (!isBodyEditing) return;
    const timeoutId = window.setTimeout(() => {
      bodyTextareaRef.current?.focus();
      const length = bodyTextareaRef.current?.value.length ?? 0;
      bodyTextareaRef.current?.setSelectionRange(length, length);
      syncBodyTextareaHeight();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isBodyEditing, resource.id]);

  useLayoutEffect(() => {
    if (!isBodyEditing) return;
    syncBodyTextareaHeight();
  }, [bodyText, isBodyEditing]);

  const beginEdit = (field: WebCommunityResourceInlineEditorField) => {
    if (!editor?.canEdit || editor.isSaving) return;
    if (editor.isEditing) {
      editor.onSetActiveField(field);
      return;
    }
    editor.onBeginEdit(field);
  };

  const handleEditableKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!editor) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editor.onCancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (editor.canSave) void editor.onSave();
    }
  };

  const handleBodyTriggerClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const interactiveTarget =
      target && target !== event.currentTarget
        ? target.closest(RESOURCE_BODY_INTERACTIVE_SELECTOR)
        : null;
    if (interactiveTarget && interactiveTarget !== event.currentTarget) {
      return;
    }
    beginEdit("body");
  };

  const handleBodyTriggerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    beginEdit("body");
  };

  const renderTitleContent = () => {
    if (isTitleEditing && editor) {
      return (
        <input
          ref={titleInputRef}
          className="resource-viewer-title-input"
          value={editor.titleInput}
          disabled={editor.isSaving}
          placeholder="Lesson title"
          onChange={(event) => editor.onChangeTitle(event.target.value)}
          onFocus={() => editor.onSetActiveField("title")}
          onKeyDown={handleEditableKeyDown}
        />
      );
    }

    if (canEdit) {
      return (
        <button
          className={`resource-viewer-title-edit-trigger${titleText.trim() ? "" : " is-empty"}`}
          type="button"
          disabled={editor?.isSaving}
          onClick={() => beginEdit("title")}
        >
          <span>{titleText.trim() || "Untitled lesson"}</span>
        </button>
      );
    }

    return <span>{resource.title}</span>;
  };

  const togglePinned = () => {
    if (!editor?.canEdit || editor.isSaving) return;
    if (!editor.isEditing) {
      editor.onBeginEdit("pin");
    } else {
      editor.onSetActiveField("pin");
    }
    editor.onChangePinned(!isPinned);
  };

  const renderPinControl = () => {
    if (canEdit && editor) {
      return (
        <button
          className={`resource-viewer-pin-toggle${isPinned ? " is-active" : ""}`}
          type="button"
          disabled={editor.isSaving}
          aria-pressed={isPinned}
          title={isPinned ? "Unpin lesson" : "Pin lesson"}
          onClick={togglePinned}
        >
          <PinIcon />
        </button>
      );
    }

    return isPinned ? <PinIcon /> : null;
  };

  const renderBodyContent = () => {
    if (isBodyEditing && editor) {
      return (
        <textarea
          ref={bodyTextareaRef}
          className="resource-viewer-prose resource-viewer-prose-input"
          value={editor.bodyInput}
          disabled={editor.isSaving}
          placeholder="Write the lesson content, context, or takeaway."
          onChange={(event) => {
            editor.onChangeBody(event.target.value);
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
          }}
          onFocus={() => editor.onSetActiveField("body")}
          onKeyDown={handleEditableKeyDown}
        />
      );
    }

    if (hasBody) {
      const prose = renderedBodyMarkdown;
      if (canEdit) {
        return (
          <div
            className="resource-viewer-prose resource-viewer-prose-edit-trigger"
            role="button"
            tabIndex={0}
            onClick={handleBodyTriggerClick}
            onKeyDown={handleBodyTriggerKeyDown}
          >
            {prose}
          </div>
        );
      }
      return <div className="resource-viewer-prose">{prose}</div>;
    }

    if (hasDeferredBody) {
      return <div className="resource-viewer-empty">Loading lesson content...</div>;
    }

    if (canEdit) {
      return (
        <button
          className="resource-viewer-empty resource-viewer-empty-edit-trigger"
          type="button"
          disabled={editor?.isSaving}
          onClick={() => beginEdit("body")}
        >
          This lesson has no body text. Click to write it.
        </button>
      );
    }

    return isEmpty ? <div className="resource-viewer-empty">This lesson hasn't been written yet.</div> : null;
  };

  return (
    <div className="resource-viewer-content">
      <div className="resource-viewer-header">
        <div className="resource-viewer-title-row">
          <h1 className="resource-viewer-title">
            {renderTitleContent()}
            {renderPinControl()}
          </h1>
          <div className="resource-viewer-header-aside">
            {isEditing && editor ? (
              <div className="resource-viewer-edit-actions">
                <button
                  className="resource-viewer-edit-cancel"
                  type="button"
                  onClick={() => editor.onCancel()}
                  disabled={editor.isSaving}
                >
                  Cancel
                </button>
                {editor.isDirty ? (
                  <button
                    className="platform-save-button resource-viewer-edit-save"
                    type="button"
                    onClick={() => void editor.onSave()}
                    disabled={!editor.canSave}
                  >
                    {editor.isSaving ? "Saving..." : "Save changes"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {isEditing && editor?.error ? <div className="auth-error resource-viewer-edit-error">{editor.error}</div> : null}
      </div>

      <div className="resource-viewer-body">
        <div className="resource-viewer-column">
          {embed ? (
            <div className="resource-viewer-embed" data-resource-media="true">
              <StableMediaEmbedFrame
                src={embed.src}
                title={`${resource.title} embed`}
              />
            </div>
          ) : null}

          {renderBodyContent()}

          {verificationLink ? (
            <a
              className="resource-viewer-verification-link"
              href={verificationLink.href}
              target="_blank"
              rel="noreferrer"
            >
              <span>{verificationLink.label}</span>
              <ExternalArrowIcon />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WebCommunityResourceViewerModal(props: WebCommunityResourceViewerModalProps) {
  const { resource, onClose } = props;

  if (!resource) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal resource-viewer-modal" onClick={(event) => event.stopPropagation()}>
        <WebCommunityResourceViewerContent
          resource={resource}
        />
      </div>
    </div>
  );
}
