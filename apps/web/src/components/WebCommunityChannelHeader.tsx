import {
  useEffect,
  useId,
  useRef,
  useState,
  useContext,
  type FormEvent,
  type ReactNode,
} from "react";
import { Ellipsis, Hash, LockKeyhole, Pencil, Trash2, X } from "lucide-react";
import { ChannelAccessSettings } from "./ChannelAccessSettings";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";

export type WebCommunityChannelHeaderChannel = {
  id: string;
  slug: string;
  name: string;
  is_general: boolean;
  access_mode?: "all_members" | "restricted";
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
    setManagementMode(mode);
    clearManageChannelError?.();
  };

  const handleRenameChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = renamedChannelName.trim().replace(/\s+/g, " ");
    if (!normalizedName || !onRenameChannel || managingChannelId) return;
    clearManageChannelError?.();
    const renamed = await onRenameChannel(channel.id, normalizedName);
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
          <h1>{channel.name}</h1>
        </div>
        {/* The people button shares the actions group so the phone's floating
            top-right chrome shows both side by side instead of stacked. */}
        {trailingAction || canOpenChannelMenu ? (
          <div className="community-channel-header-actions" ref={menuRef}>
            {trailingAction}
            {canOpenChannelMenu ? (
              <>
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
              </>
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
              {manageChannelError ? (
                <div className="community-channel-modal-error" role="alert">
                  {manageChannelError}
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
                  {managingChannelId ? "Saving…" : sessionScope ? "Save name" : "Save"}
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
