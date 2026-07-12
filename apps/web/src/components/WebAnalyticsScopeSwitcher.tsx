import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

export type AnalyticsScope = "community" | "platform";

type WebAnalyticsScopeSwitcherProps = {
  activeScope: AnalyticsScope;
  showPlatformScope: boolean;
  onOpenCommunityScope?: () => void;
  onOpenPlatformScope?: () => void;
};

export function WebAnalyticsScopeSwitcher(props: WebAnalyticsScopeSwitcherProps) {
  if (!props.showPlatformScope) return null;

  const scopes: readonly AnalyticsScope[] = ["community", "platform"];
  const style = buildPlatformSwitcherStyle(scopes.length, scopes.indexOf(props.activeScope));

  return (
    <div
      className="platform-switcher platform-switcher-compact analytics-scope-switcher"
      role="tablist"
      aria-label="Analytics scope"
      style={style}
    >
      <button
        className={props.activeScope === "community" ? "platform-switcher-btn is-active" : "platform-switcher-btn"}
        type="button"
        role="tab"
        aria-selected={props.activeScope === "community"}
        disabled={!props.onOpenCommunityScope}
        onClick={props.onOpenCommunityScope}
      >
        Community
      </button>
      <button
        className={props.activeScope === "platform" ? "platform-switcher-btn is-active" : "platform-switcher-btn"}
        type="button"
        role="tab"
        aria-selected={props.activeScope === "platform"}
        disabled={!props.onOpenPlatformScope}
        onClick={props.onOpenPlatformScope}
      >
        Platform
      </button>
    </div>
  );
}
