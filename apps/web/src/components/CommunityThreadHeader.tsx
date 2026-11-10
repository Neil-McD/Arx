import { X } from "lucide-react";

// Design system v1: a thread names itself and its channel, level with the
// channel's own header, and closes with a cross.
export function CommunityThreadHeader(props: { channelName?: string | null; onClose: () => void }) {
  return (
    <div className="community-interaction-drawer-back is-v1">
      <h2 className="community-thread-title">
        Thread{props.channelName ? <span> · #{props.channelName}</span> : null}
      </h2>
      <button className="community-thread-close" type="button" onClick={props.onClose} aria-label="Close thread" title="Close thread">
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
