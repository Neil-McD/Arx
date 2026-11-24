import { X } from "lucide-react";

// Design system v1: a drawer header names itself (and its channel for threads),
// level with the channel's own header, and closes with a cross.
export function CommunityThreadHeader(props: {
  title?: string;
  channelName?: string | null;
  closeLabel?: string;
  onClose: () => void;
}) {
  const title = props.title ?? "Thread";
  const closeLabel = props.closeLabel ?? "Close thread";
  return (
    <div className="community-interaction-drawer-back is-v1">
      <h2 className="community-thread-title">
        {title}{props.channelName ? <span> · #{props.channelName}</span> : null}
      </h2>
      <button className="community-thread-close" type="button" onClick={props.onClose} aria-label={closeLabel} title={closeLabel}>
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
