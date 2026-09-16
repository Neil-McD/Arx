export type CommunityAdmissionControl = {
  mode: "open" | "approval" | null;
  canManage: boolean;
  pending: boolean;
  error: string | null;
  onChange: (mode: "open" | "approval") => Promise<void> | void;
};

/** Community admission, never channel membership. State and writes belong to the host. */
export function CommunityAutoJoinControl({ admission }: { admission?: CommunityAdmissionControl }) {
  if (!admission?.canManage || !admission.mode) return null;
  const enabled = admission.mode === "open";
  return <button className={`community-context-autojoin${enabled ? " is-on" : ""}`}
    type="button" role="switch" aria-checked={enabled} aria-busy={admission.pending || undefined}
    aria-label={`Auto-join is ${enabled ? "on" : "off"}`} disabled={admission.pending}
    title="Community Auto-join. Saves immediately. On allows free members to join and approves pending requests."
    onClick={() => { if (!admission.pending) void admission.onChange(enabled ? "approval" : "open"); }}>
    <span className="community-context-autojoin-label">Auto-join</span>
    <span className="community-context-autojoin-track" aria-hidden="true"><span className="community-context-autojoin-thumb" /></span>
  </button>;
}
