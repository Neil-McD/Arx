import { APP_THEME_OPTIONS, type AppTheme } from "../../../../shared/theme";

type WebAppearanceSettingsSectionProps = {
  appTheme: AppTheme;
  setAppTheme: (value: AppTheme) => void;
};

export function WebAppearanceSettingsSection(props: WebAppearanceSettingsSectionProps) {
  const { appTheme, setAppTheme } = props;

  return (
    <>
      <div className="panel-title">Appearance</div>
      <div className="appearance-panel">
        <div className="appearance-selector">
          <div className="appearance-title">Theme</div>
          <div className="appearance-options">
            {APP_THEME_OPTIONS.map((theme) => (
              <button
                key={theme.id}
                className={`appearance-option${appTheme === theme.id ? " active" : ""}${theme.disabled ? " disabled" : ""}`}
                type="button"
                onClick={() => {
                  if (!theme.disabled) {
                    setAppTheme(theme.id);
                  }
                }}
                disabled={theme.disabled}
              >
                <div className="appearance-option-preview" data-preview-theme={theme.id}>
                  <div className="preview-header" />
                  <div className="preview-sidebar" />
                  <div className="preview-content">
                    <div className="preview-line" />
                    <div className="preview-line short" />
                  </div>
                </div>
                <div className="appearance-option-label">{theme.label}</div>
                <div className="appearance-option-desc">{theme.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
