import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { normalizeExternalUrl, parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../../shared/markdownUi";
import type { CommunityResource } from "./communityResourcesContracts";

type WebCommunityResourceViewerModalProps = {
  resource: CommunityResource | null;
  onClose: () => void;
};

export type WebCommunityResourceSourceLineage = {
  title: string;
  detail: string | null;
  onOpen?: () => void;
};

type WebCommunityResourceViewerContentProps = {
  resource: CommunityResource;
  actions?: ReactNode;
  sourceLineage?: WebCommunityResourceSourceLineage | null;
  editor?: WebCommunityResourceInlineEditor | null;
};

export type WebCommunityResourceInlineEditorField = "title" | "body" | "url" | "pin";

export type WebCommunityResourceInlineEditor = {
  canEdit: boolean;
  isEditing: boolean;
  activeField: WebCommunityResourceInlineEditorField | null;
  titleInput: string;
  urlInput: string;
  bodyInput: string;
  pinnedInput: boolean;
  error: string | null;
  isSaving: boolean;
  isDirty: boolean;
  canSave: boolean;
  onBeginEdit: (field: WebCommunityResourceInlineEditorField) => void;
  onSetActiveField: (field: WebCommunityResourceInlineEditorField) => void;
  onChangeTitle: (value: string) => void;
  onChangeUrl: (value: string) => void;
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

function getRoleLabel(resource: CommunityResource): string {
  return resource.resource_role === "source" ? "Source" : "Page";
}

function buildEyebrow(resource: CommunityResource, urlOverride?: string | null): string {
  const role = getRoleLabel(resource);
  const url = urlOverride === undefined ? resource.url : urlOverride;
  const embed = url ? parseEmbedUrl(url) : null;
  if (embed) return `${role} · ${getEmbedProviderLabel(embed.provider)}`;
  if (normalizeExternalUrl(url)) return `${role} · ${getHostLabel(url)}`;
  return role;
}

function hasStoredBodyContent(resource: CommunityResource): boolean {
  const bodyChars = Number(resource.body_chars ?? 0);
  return Number.isFinite(bodyChars) && bodyChars > 0;
}

function formatCreatedAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return parsed.toISOString();
  }
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

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort only
    }
  };
  return (
    <button
      className="resource-viewer-details-copy"
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ResourceDetailsSheet(props: {
  resource: CommunityResource;
  sourceLineage: WebCommunityResourceSourceLineage | null;
  editor: WebCommunityResourceInlineEditor | null;
  actions: ReactNode;
  onClose: () => void;
}) {
  const { resource, sourceLineage, editor, actions, onClose } = props;
  const createdAt = formatCreatedAt(resource.created_at);
  const hasLineage = Boolean(resource.source_resource_id && sourceLineage);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const isUrlEditing = Boolean(editor?.isEditing && editor.activeField === "url");
  const urlDisplayValue = editor?.isEditing ? editor.urlInput : resource.url ?? "";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isUrlEditing) return;
    const timeoutId = window.setTimeout(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isUrlEditing, resource.id]);

  const beginUrlEdit = () => {
    if (!editor?.canEdit || editor.isSaving) return;
    if (editor.isEditing) {
      editor.onSetActiveField("url");
      return;
    }
    editor.onBeginEdit("url");
  };

  const handleUrlKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!editor) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editor.onCancel();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (editor.canSave) void editor.onSave();
    }
  };

  const renderSourceUrlValue = () => {
    if (isUrlEditing && editor) {
      return (
        <input
          ref={urlInputRef}
          className="resource-viewer-details-input"
          value={editor.urlInput}
          disabled={editor.isSaving}
          placeholder="https://..."
          onChange={(event) => editor.onChangeUrl(event.target.value)}
          onFocus={() => editor.onSetActiveField("url")}
          onKeyDown={handleUrlKeyDown}
        />
      );
    }

    if (editor?.canEdit) {
      return (
        <button
          className={`resource-viewer-details-edit-trigger${urlDisplayValue.trim() ? "" : " is-empty"}`}
          type="button"
          disabled={editor.isSaving}
          onClick={beginUrlEdit}
        >
          {urlDisplayValue.trim() || "No source URL"}
        </button>
      );
    }

    return <div className="resource-viewer-details-static">{urlDisplayValue.trim() || "No source URL"}</div>;
  };

  return (
    <aside className="resource-viewer-details" aria-label="Resource details">
      <div className="resource-viewer-details-header">
        <div className="resource-viewer-details-title">Details</div>
        <button
          className="resource-viewer-details-close"
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close details"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="resource-viewer-details-body">
        {hasLineage ? (
          <div className="resource-viewer-details-row">
            <div className="resource-viewer-details-label">Drafted from</div>
            <div className="resource-viewer-details-value">
              {sourceLineage?.onOpen ? (
                <button
                  className="resource-viewer-details-link"
                  type="button"
                  onClick={sourceLineage.onOpen}
                  title="Open source"
                >
                  <span>{sourceLineage.title}</span>
                  <ExternalArrowIcon />
                </button>
              ) : (
                <div className="resource-viewer-details-static">
                  {sourceLineage?.title ?? "Original source unavailable"}
                </div>
              )}
              {sourceLineage?.detail ? (
                <div className="resource-viewer-details-detail">{sourceLineage.detail}</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="resource-viewer-details-row">
          <div className="resource-viewer-details-label">Source URL</div>
          <div className="resource-viewer-details-value">
            {renderSourceUrlValue()}
          </div>
        </div>

        <div className="resource-viewer-details-row">
          <div className="resource-viewer-details-label">Path</div>
          <div className="resource-viewer-details-value">
            <div className="resource-viewer-details-static">{resource.directory_path}</div>
          </div>
        </div>

        <div className="resource-viewer-details-row">
          <div className="resource-viewer-details-label">URI</div>
          <div className="resource-viewer-details-value">
            <code className="resource-viewer-details-code">{resource.directory_uri}</code>
            <CopyButton value={resource.directory_uri} />
          </div>
        </div>

        {createdAt ? (
          <div className="resource-viewer-details-row">
            <div className="resource-viewer-details-label">Created</div>
            <div className="resource-viewer-details-value">
              <div className="resource-viewer-details-static">{createdAt}</div>
            </div>
          </div>
        ) : null}

        {actions ? (
          <div className="resource-viewer-details-actions">
            <div className="resource-viewer-details-label">Actions</div>
            <div className="resource-viewer-details-actions-row">{actions}</div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function WebCommunityResourceViewerContent(props: WebCommunityResourceViewerContentProps) {
  const { resource, actions = null, sourceLineage = null, editor = null } = props;
  const currentUrl = editor?.isEditing ? editor.urlInput : resource.url;
  const embed = currentUrl ? parseEmbedUrl(currentUrl) : null;
  const sourceUrl = normalizeExternalUrl(currentUrl);
  const hostLabel = getHostLabel(currentUrl);
  const eyebrow = buildEyebrow(resource, currentUrl);
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
  const showDetailsTrigger = Boolean(actions);
  const isEmpty = !embed && !hasBody && !hasDeferredBody && !verificationLink;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canEdit = Boolean(editor?.canEdit);
  const isEditing = Boolean(editor?.isEditing);
  const activeField = editor?.activeField ?? null;
  const isTitleEditing = isEditing && activeField === "title";
  const isBodyEditing = isEditing && activeField === "body";
  const isPinned = editor?.isEditing ? editor.pinnedInput : resource.pinned;

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
    if (target && target !== event.currentTarget && target.closest("a, button, input, textarea, select")) {
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
          placeholder="Resource title"
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
          <span>{titleText.trim() || "Untitled resource"}</span>
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
          title={isPinned ? "Unpin resource" : "Pin resource"}
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
          placeholder="Write the page content, context, or takeaway."
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
      const prose = renderMarkdown(trimmedBody, { embedStandaloneMedia: true });
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
      return <div className="resource-viewer-empty">Loading page content...</div>;
    }

    if (canEdit) {
      return (
        <button
          className="resource-viewer-empty resource-viewer-empty-edit-trigger"
          type="button"
          disabled={editor?.isSaving}
          onClick={() => beginEdit("body")}
        >
          This page has no body text. Click to write it.
        </button>
      );
    }

    return isEmpty ? <div className="resource-viewer-empty">This page hasn't been written yet.</div> : null;
  };

  return (
    <div className="resource-viewer-content">
      <div className="resource-viewer-header">
        <div className="resource-viewer-eyebrow">{eyebrow}</div>
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
                  onClick={editor.onCancel}
                  disabled={editor.isSaving}
                >
                  Cancel
                </button>
                <button
                  className="platform-save-button resource-viewer-edit-save"
                  type="button"
                  onClick={() => void editor.onSave()}
                  disabled={!editor.canSave}
                >
                  {editor.isSaving ? "Saving..." : editor.isDirty ? "Save changes" : "Saved"}
                </button>
              </div>
            ) : null}
            {showDetailsTrigger ? (
              <button
                className="resource-viewer-details-trigger"
                type="button"
                onClick={() => setIsDetailsOpen((open) => !open)}
                aria-expanded={isDetailsOpen}
                aria-label="Resource details"
              >
                <MoreIcon />
              </button>
            ) : null}
          </div>
        </div>
        {isEditing && editor?.error ? <div className="auth-error resource-viewer-edit-error">{editor.error}</div> : null}
      </div>

      <div className="resource-viewer-body">
        <div className="resource-viewer-column">
          {embed ? (
            <div className="resource-viewer-embed">
              <iframe
                src={embed.src}
                title={`${resource.title} embed`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
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

      {isDetailsOpen ? (
        <ResourceDetailsSheet
          resource={resource}
          sourceLineage={sourceLineage}
          editor={editor}
          actions={actions}
          onClose={() => setIsDetailsOpen(false)}
        />
      ) : null}
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
          actions={(
            <button className="modal-close" onClick={onClose} title="Close">
              ×
            </button>
          )}
        />
      </div>
    </div>
  );
}
