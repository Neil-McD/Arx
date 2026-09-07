import { useState } from "react";
import type { CommunityMemberServiceChannel } from "../../../../shared/communityMembershipContext";
import type { CloudCommunityChannel } from "../../../../shared/cloudCommunityChannelsGateway";
import { WorkflowChannelPicker } from "./WorkflowChannelPicker";

export function WorkflowMemberServiceChannel(props: {
  value: CommunityMemberServiceChannel;
  channels: CloudCommunityChannel[];
  channelsUnavailable: boolean;
  saving: boolean;
  error: string | null;
  onChange: (channelId: string | null, expectedRevision: number) => Promise<boolean>;
  onOpen: (channelId: string) => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const value = props.value;
  const privateChannels = props.channels.filter(channel => channel.access_mode === "restricted");
  const save = async (id: string | null) => {
    if (await props.onChange(id, value.revision)) setEditing(false);
  };
  return <section className="workflow-member-dossier-section">
    <h3>Service channel</h3>
    <p>{value.status === "available" ? `#${value.name}` : value.status === "unavailable" ? "Unavailable" : "Not assigned"}</p>
    {editing ? <>
      <WorkflowChannelPicker channels={privateChannels} channelId={value.channel_id ?? undefined}
        emptyLabel="Not assigned" label="Service channel" unavailable={props.channelsUnavailable}
        disabled={props.saving} onChange={id => void save(id ?? null)} />
      <p className="workflow-field-hint">Selecting saves the assignment. The member and community agent must already have access. No one is invited automatically.</p>
      {!props.channelsUnavailable && privateChannels.length === 0 ? <p>No private channels available. Create one using channel settings first.</p> : null}
    </> : null}
    <div className="resource-modal-actions workflow-member-service-actions">
      <button type="button" className="secondary" disabled={props.saving} onClick={() => setEditing(!editing)}>
        {editing ? "Cancel" : value.status === "unassigned" ? "Choose channel" : "Change"}
      </button>
      {value.status !== "unassigned" ? <button type="button" className="secondary" disabled={props.saving} onClick={() => void save(null)}>Clear</button> : null}
      {value.status === "available" && value.channel_id ? <button type="button" className="secondary" disabled={props.saving || props.channelsUnavailable || !props.channels.some(c => c.id === value.channel_id)} onClick={() => props.onOpen(value.channel_id!)}>Open channel</button> : null}
      <button type="button" className="secondary" disabled={props.saving} onClick={props.onRefresh}>Refresh</button>
    </div>
    {props.saving ? <p role="status">Saving service channel…</p> : null}
    {props.error ? <p className="workflow-error" role="alert">{props.error}</p> : null}
    {value.status === "unavailable" ? <p className="workflow-field-hint">The assigned room is no longer an available private destination. No fallback will be used.</p> : null}
  </section>;
}
