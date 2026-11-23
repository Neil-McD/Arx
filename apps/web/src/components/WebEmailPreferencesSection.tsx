import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsRows";

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
    <SettingsGroup label="Email">
      <SettingsRow
        label="Weekly digest"
        help={
          props.error ? (
            <span className="settings-v1-error">{props.error}</span>
          ) : (
            "A summary of what happened in your communities, once a week."
          )
        }
      >
        <SettingsSwitch
          label="Weekly digest"
          checked={props.hasLoaded && props.weeklyDigestEnabled}
          disabled={disabled}
          onChange={(checked) => void props.onChangeWeeklyDigestEnabled(checked)}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
