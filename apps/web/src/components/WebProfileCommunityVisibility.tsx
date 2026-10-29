import { useEffect, useState } from "react";
import { setCloudProfileCommunityVisibility } from "../../../../shared/cloudProfilesGateway";

// Your settings > Profile: what your profile shows people who click your
// name. Private communities never show; this hides the rest too.
export function WebProfileCommunityVisibility<SessionT>(props: {
  session: SessionT | null;
  showOwned: boolean;
  showJoined: boolean;
  bare?: boolean;
}) {
  const [showOwned, setShowOwned] = useState(props.showOwned);
  const [showJoined, setShowJoined] = useState(props.showJoined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setShowOwned(props.showOwned), [props.showOwned]);
  useEffect(() => setShowJoined(props.showJoined), [props.showJoined]);

  const save = async (patch: { showOwned?: boolean; showJoined?: boolean }) => {
    if (!props.session) return;
    setError(null);
    if (patch.showOwned !== undefined) setShowOwned(patch.showOwned);
    if (patch.showJoined !== undefined) setShowJoined(patch.showJoined);
    try {
      await setCloudProfileCommunityVisibility({ session: props.session, ...patch });
    } catch {
      if (patch.showOwned !== undefined) setShowOwned(!patch.showOwned);
      if (patch.showJoined !== undefined) setShowJoined(!patch.showJoined);
      setError("Couldn't save that. Try again.");
    }
  };

  const row = (label: string, help: string, checked: boolean, onChange: (value: boolean) => void) => (
    <div className="pn-settings-row">
      <div className="pn-settings-row-head">
        <div className="pn-settings-row-text">
          <span className="pn-settings-label">{label}</span>
          <span className="pn-settings-help">{help}</span>
        </div>
        <div className="pn-settings-row-control">
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            className={`pn-settings-switch${checked ? " is-on" : ""}`}
            onClick={() => onChange(!checked)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  const rows = (
    <>
      {error ? <p className="pn-settings-inline-error pn-creators-error" role="alert">{error}</p> : null}
      {row("Communities you create", "The ones you own or co-create.", showOwned, (value) => void save({ showOwned: value }))}
      {row("Communities you're in", "Public communities you've joined.", showJoined, (value) => void save({ showJoined: value }))}
    </>
  );
  // Inside a fold, which gives the title.
  if (props.bare) return rows;
  return (
    <section className="settings-section pn-settings-card" aria-labelledby="profile-communities-title">
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title" id="profile-communities-title">On your profile</h2>
        <p className="settings-section-desc">What people see when they click your name. Private communities never show.</p>
      </header>
      <div className="pn-settings-card-body">{rows}</div>
    </section>
  );
}
