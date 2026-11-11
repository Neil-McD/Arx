import {
  useEffect,
  useId,
  useRef,
  useState,
  useContext,
  type FormEvent,
  type ReactNode,
} from "react";
import { Ellipsis, Hash, LockKeyhole, Pencil, Search, Trash2, X } from "lucide-react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { setCloudCommunityChannelDescription } from "../../../../shared/cloudCommunityChannelsGateway";
import { openGuideFromSearch } from "./guideSearch";
import { ChannelAccessSettings } from "./ChannelAccessSettings";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";

export type WebCommunityChannelHeaderChannel = {
  id: string;
  slug: string;
  name: string;
  is_general: boolean;
  access_mode?: "all_members" | "restricted";
  description?: string | null;
};

type WebCommunityChannelHeaderProps = {
  trailingAction?: ReactNode;
  channel: WebCommunityChannelHeaderChannel;
  canManage: boolean;
  managingChannelId?: string | null;
  manageChannelError?: string | null;
  clearManageChannelError?: () => void;
  onRenameChannel?: (channelId: string, name: string) => Promise<unknown>;
  onDeleteChannel?: (channel: WebCommunityChannelHeaderChannel) => Promise<boolean>;
};

const MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function trapModalFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
  const target = event.shiftKey
    ? activeIndex <= 0
      ? focusable.at(-1)
      : null
    : activeIndex === -1 || activeIndex === focusable.length - 1
      ? focusable[0]
      : null;
  if (!target) return;
  event.preventDefault();
  target.focus();
}

export function WebCommunityChannelHeader({
  trailingAction,
  channel,
  canManage,
  managingChannelId = null,
  manageChannelError = null,
  clearManageChannelError,
  onRenameChannel,
  onDeleteChannel,
}: WebCommunityChannelHeaderProps) {
  const sessionScope = useContext(CommunityChannelSessionContext);
  const renameTitleId = useId();
  const deleteTitleId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [managementMode, setManagementMode] = useState<"rename" | "delete" | null>(null);
  const [renamedChannelName, setRenamedChannelName] = useState(channel.name);
  // Design v1: the line next to the name. What you saved shows at once; the
  // channel list catches up on its next read.
  const [savedDescription, setSavedDescription] = useState<{ channelId: string; value: string } | null>(null);
  const description = savedDescription?.channelId === channel.id ? savedDescription.value : String(channel.description ?? "");
  const [editedDescription, setEditedDescription] = useState(description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);
  const canManageCustomChannel = Boolean(
    canManage &&
    !channel.is_general &&
    channel.id &&
    onRenameChannel &&
    onDeleteChannel,
  );
  const canOpenChannelMenu = Boolean(
    canManage && (channel.is_general || canManageCustomChannel),
  );

  const restoreMenuTriggerFocus = () => {
    if (focusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreFrameRef.current);
    }
    focusRestoreFrameRef.current = window.requestAnimationFrame(() => {
      menuTriggerRef.current?.focus();
      focusRestoreFrameRef.current = null;
    });
  };

  const closeManagement = (force = false) => {
    if (managingChannelId && !force) return;
    setManagementMode(null);
    setRenamedChannelName(channel.name);
    clearManageChannelError?.();
    restoreMenuTriggerFocus();
  };

  useEffect(() => {
    setIsMenuOpen(false);
    setManagementMode(null);
    setRenamedChannelName(channel.name);
    clearManageChannelError?.();
  }, [channel.id]);

  useEffect(() => {
    return () => {
      if (focusRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(focusRestoreFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      restoreMenuTriggerFocus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!managementMode) return;
    const frame = window.requestAnimationFrame(() => {
      if (managementMode === "rename") {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      } else {
        deleteCancelRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [managementMode]);

  useEffect(() => {
    if (!managementMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !managingChannelId) {
        event.preventDefault();
        event.stopPropagation();
        closeManagement();
        return;
      }
      trapModalFocus(event, dialogRef.current);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [managementMode, managingChannelId]);

  const openManagement = (mode: "rename" | "delete") => {
    setIsMenuOpen(false);
    setRenamedChannelName(channel.name);
    setEditedDescription(description);
    setDescriptionError(null);
    setManagementMode(mode);
    clearManageChannelError?.();
  };

  const handleRenameChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = renamedChannelName.trim().replace(/\s+/g, " ");
    if (!normalizedName || !onRenameChannel || managingChannelId) return;
    clearManageChannelError?.();
    const nextDescription = editedDescription.replace(/\s+/g, " ").trim();
    if (isDesignV1Active() && sessionScope?.session && nextDescription !== description) {
      try {
        await setCloudCommunityChannelDescription({
          session: sessionScope.session, communityId: sessionScope.communityId, channelId: channel.id, description: nextDescription,
        });
        setSavedDescription({ channelId: channel.id, value: nextDescription });
      } catch {
        setDescriptionError("The description didn't save. Try again.");
        return;
      }
    }
    const renamed = normalizedName === channel.name ? true : await onRenameChannel(channel.id, normalizedName);
    if (renamed) closeManagement(true);
  };

  const handleDeleteChannel = async () => {
    if (!onDeleteChannel || managingChannelId) return;
    clearManageChannelError?.();
    const deleted = await onDeleteChannel(channel);
    if (deleted) closeManagement(true);
  };

  return (
    <>
      <header className="community-channel-header" aria-label={`Channel ${channel.name}`}>
        <div className="community-channel-header-identity" title={channel.name}>
          {channel.access_mode === "restricted" ? <LockKeyhole size={17} strokeWidth={1.9} aria-hidden="true" /> : <Hash size={17} strokeWidth={1.9} aria-hidden="true" />}
          <h1>{channel.name}{isDesignV1Active() && description ? <small className="community-channel-header-description">{description}</small> : null}</h1>
        </div>
        {isDesignV1Active() ? (
          // The mock's "Search or ask": until search exists it asks your guide.
          <button type="button" className="community-search-ask" onClick={() => openGuideFromSearch()} aria-keyshortcuts="Meta+K" title="Ask your guide (⌘K)">
            <Search size={14} aria-hidden="true" />
            <span>Search or ask</span>
            <kbd>⌘K</kbd>
          </button>
        ) : null}
        {trailingAction}
        {canOpenChannelMenu ? (
          <div className="community-channel-header-actions" ref={menuRef}>
            <button
              ref={menuTriggerRef}
              className="community-channel-header-menu-trigger"
              type="button"
              aria-label={`Channel options for ${channel.name}`}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              disabled={Boolean(managingChannelId)}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <Ellipsis size={19} strokeWidth={1.9} aria-hidden="true" />
            </button>
            {isMenuOpen ? (
              <div
                className="community-channel-header-menu"
                role="menu"
                aria-label={`Channel options for ${channel.name}`}
              >
                {channel.is_general ? (
                  <div
                    className="community-channel-header-menu-system-note"
                    role="menuitem"
                    aria-disabled="true"
                  >
                    <LockKeyhole size={15} aria-hidden="true" />
                    <span>
                      <strong>Default channel</strong>
                      <small>Can’t be renamed or deleted</small>
                    </span>
                  </div>
                ) : (
                  <>
                    <button type="button" role="menuitem" onClick={() => openManagement("rename")}>
                      <Pencil size={15} aria-hidden="true" />
                      {sessionScope ? "Channel settings" : "Rename channel"}
                    </button>
                    <button
                      className="is-danger"
                      type="button"
                      role="menuitem"
                      onClick={() => openManagement("delete")}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Delete channel
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {managementMode ? (
        <div
          className="community-channel-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeManagement();
          }}
        >
          {managementMode === "rename" ? (
            <form
              ref={(element) => {
                dialogRef.current = element;
              }}
              className="community-channel-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={renameTitleId}
              tabIndex={-1}
              onSubmit={(event) => void handleRenameChannel(event)}
            >
              <div className="community-channel-modal-header">
                <div>
                  <h2 id={renameTitleId}>{sessionScope ? "Channel settings" : "Rename channel"}</h2>
                  <p>The channel URL will stay the same so existing links keep working.</p>
                </div>
                <button
                  type="button"
                  className="community-channel-modal-close"
                  onClick={() => closeManagement()}
                  aria-label="Close channel settings"
                  disabled={Boolean(managingChannelId)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <label className="community-channel-modal-field">
                <span>Channel name</span>
                <input
                  ref={renameInputRef}
                  value={renamedChannelName}
                  maxLength={48}
                  onChange={(event) => {
                    setRenamedChannelName(event.target.value);
                    clearManageChannelError?.();
                  }}
                  disabled={Boolean(managingChannelId)}
                />
              </label>
              {isDesignV1Active() && sessionScope ? (
                <label className="community-channel-modal-field">
                  <span>Description</span>
                  <input
                    value={editedDescription}
                    maxLength={120}
                    placeholder="What this channel is for"
                    onChange={(event) => { setEditedDescription(event.target.value); setDescriptionError(null); }}
                    disabled={Boolean(managingChannelId)}
                  />
                </label>
              ) : null}
              {manageChannelError || descriptionError ? (
                <div className="community-channel-modal-error" role="alert">
                  {manageChannelError ?? descriptionError}
                </div>
              ) : null}
              {sessionScope ? <ChannelAccessSettings channelId={channel.id} /> : null}
              <div className="community-channel-modal-actions">
                <button
                  type="button"
                  onClick={() => closeManagement()}
                  disabled={Boolean(managingChannelId)}
                >
                  {sessionScope ? "Close" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="is-primary"
                  disabled={Boolean(managingChannelId) || !renamedChannelName.trim()}
                >
                  {managingChannelId ? "Saving…" : sessionScope ? (isDesignV1Active() ? "Save" : "Save name") : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <div
              ref={(element) => {
                dialogRef.current = element;
              }}
              className="community-channel-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={deleteTitleId}
              tabIndex={-1}
            >
              <div className="community-channel-modal-header">
                <div>
                  <h2 id={deleteTitleId}>Delete #{channel.name}?</h2>
                  <p>Members will no longer see this channel. Existing messages will be retained.</p>
                </div>
                <button
                  type="button"
                  className="community-channel-modal-close"
                  onClick={() => closeManagement()}
                  aria-label="Close delete channel dialog"
                  disabled={Boolean(managingChannelId)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {manageChannelError ? (
                <div className="community-channel-modal-error" role="alert">
                  {manageChannelError}
                </div>
              ) : null}
              <div className="community-channel-modal-actions">
                <button
                  ref={deleteCancelRef}
                  type="button"
                  onClick={() => closeManagement()}
                  disabled={Boolean(managingChannelId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => void handleDeleteChannel()}
                  disabled={Boolean(managingChannelId)}
                >
                  {managingChannelId ? "Deleting…" : "Delete channel"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
