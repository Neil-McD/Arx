export type WebEmailPreferencesSectionProps = {
  isVisible: boolean;
  weeklyDigestEnabled: boolean;
  hasLoaded: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onChangeWeeklyDigestEnabled: (enabled: boolean) => Promise<void> | void;
};

export function WebEmailPreferencesSection(
  props: WebEmailPreferencesSectionProps,
) {
  if (!props.isVisible) return null;

  const disabled = !props.hasLoaded || props.isLoading || props.isSaving;
  return (
    <div className="settings-section email-preferences-section">
      <div className="settings-section-title">Email</div>
      <div className="settings-section-desc">
        Choose which community emails Polynet sends you.
      </div>
      <div className="account-row email-preference-row">
        <div className="account-identity">
          <strong>Weekly community digest</strong>
          <span>A weekly summary of activity from communities you belong to.</span>
        </div>
        <button
          className={`settings-preference-switch${props.hasLoaded && props.weeklyDigestEnabled ? " is-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={props.hasLoaded ? props.weeklyDigestEnabled : false}
          aria-busy={props.isLoading || props.isSaving || undefined}
          aria-label="Weekly community digest"
          disabled={disabled}
          onClick={() => {
            void props.onChangeWeeklyDigestEnabled(!props.weeklyDigestEnabled);
          }}
        >
          <span className="settings-preference-switch-thumb" aria-hidden="true" />
        </button>
      </div>
      {props.error ? <div className="key-error">{props.error}</div> : null}
    </div>
  );
}
