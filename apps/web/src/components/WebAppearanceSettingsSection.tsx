import { APP_THEME_OPTIONS, type AppTheme } from "../../../../shared/theme";
import { SettingsGroup, SettingsRow, SettingsSegmented } from "./SettingsRows";

type WebAppearanceSettingsSectionProps = {
  appTheme: AppTheme;
  setAppTheme: (value: AppTheme) => void;
};

export function WebAppearanceSettingsSection(props: WebAppearanceSettingsSectionProps) {
  const { appTheme, setAppTheme } = props;
  return (
    <SettingsGroup>
      <SettingsRow label="Theme" help="How Polynet looks on this device.">
        <SettingsSegmented
          label="Theme"
          value={appTheme}
          onChange={setAppTheme}
          options={APP_THEME_OPTIONS.filter((theme) => !theme.disabled).map((theme) => ({
            id: theme.id,
            label: theme.label,
          }))}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
