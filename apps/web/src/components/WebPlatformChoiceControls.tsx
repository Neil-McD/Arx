import { useRef, type CSSProperties, type KeyboardEvent } from "react";

import { resolveHorizontalRovingIndex } from "../../../../shared/horizontalRovingNavigation";

type PlatformChoice<T extends string> = {
  id: T;
  label: string;
  disabled?: boolean;
  buttonClassName?: string;
};

type ChoiceSelectionSource = "click" | "keyboard";

export function platformTabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function platformTabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

function choiceButtonClassName(
  choice: PlatformChoice<string>,
  isActive: boolean,
): string {
  return [
    "platform-switcher-btn",
    choice.buttonClassName,
    isActive ? "is-active" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function WebPlatformTabList<T extends string>({
  tabs,
  activeTab,
  onSelectTab,
  ariaLabel,
  idPrefix,
  className,
  style,
}: {
  tabs: readonly PlatformChoice<T>[];
  activeTab: T;
  onSelectTab: (tab: T, metadata: { source: ChoiceSelectionSource }) => void;
  ariaLabel: string;
  idPrefix: string;
  className?: string;
  style?: CSSProperties;
}) {
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());

  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const targetIndex = resolveHorizontalRovingIndex({
      key: event.key,
      currentIndex,
      enabled: tabs.map((tab) => !tab.disabled),
    });
    if (targetIndex === null) return;

    const target = tabs[targetIndex];
    if (!target || target.disabled) return;
    event.preventDefault();
    buttonRefs.current.get(target.id)?.focus();
    if (target.id !== activeTab) {
      onSelectTab(target.id, { source: "keyboard" });
    }
  };

  return (
    <div
      className={className ?? "platform-switcher platform-switcher-compact"}
      role="tablist"
      aria-label={ariaLabel}
      style={style}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) buttonRefs.current.set(tab.id, node);
              else buttonRefs.current.delete(tab.id);
            }}
            id={platformTabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={platformTabPanelId(idPrefix, tab.id)}
            tabIndex={isActive ? 0 : -1}
            className={choiceButtonClassName(tab, isActive)}
            disabled={tab.disabled}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
            onClick={() => {
              if (!isActive && !tab.disabled) {
                onSelectTab(tab.id, { source: "click" });
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function WebPlatformRadioGroup<T extends string>({
  options,
  value,
  onSelectValue,
  ariaLabel,
  className,
  style,
}: {
  options: readonly PlatformChoice<T>[];
  value: T;
  onSelectValue: (
    value: T,
    metadata: { source: ChoiceSelectionSource },
  ) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}) {
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const activeOption = options.find((option) => option.id === value);
  const rovingValue =
    activeOption && !activeOption.disabled
      ? activeOption.id
      : options.find((option) => !option.disabled)?.id;

  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const targetIndex = resolveHorizontalRovingIndex({
      key: event.key,
      currentIndex,
      enabled: options.map((option) => !option.disabled),
    });
    if (targetIndex === null) return;

    const target = options[targetIndex];
    if (!target || target.disabled) return;
    event.preventDefault();
    buttonRefs.current.get(target.id)?.focus();
    if (target.id !== value) {
      onSelectValue(target.id, { source: "keyboard" });
    }
  };

  return (
    <div
      className={className ?? "platform-switcher platform-switcher-compact"}
      role="radiogroup"
      aria-label={ariaLabel}
      style={style}
    >
      {options.map((option, index) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            ref={(node) => {
              if (node) buttonRefs.current.set(option.id, node);
              else buttonRefs.current.delete(option.id);
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={rovingValue === option.id ? 0 : -1}
            className={choiceButtonClassName(option, isActive)}
            disabled={option.disabled}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
            onClick={() => {
              if (!isActive && !option.disabled) {
                onSelectValue(option.id, { source: "click" });
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
