import {
  Fragment,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  anthropicLogo,
  googleLogo,
  openAiLogo,
  xAiLogo,
} from "../../shared/providerLogos";
import type { ModelSectionId, ModelToggle } from "../../shared/modelCatalog";
import type { DesktopCuratedPickerModel } from "../controllers/desktop/useDesktopModelPickerActions";

type ProviderId = "openai" | "anthropic" | "google" | "x-ai" | "openrouter";

type DesktopModelPickerPopoverProps = {
  modelPickerRef: RefObject<HTMLDivElement | null>;
  modelPickerSearchRef: RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  curatedPickerModels: DesktopCuratedPickerModel[];
  selectedModelLabel: string;
  modelPickerQuery: string;
  setModelPickerQuery: Dispatch<SetStateAction<string>>;
  modelPickerSection: ModelSectionId;
  setModelPickerSection: Dispatch<SetStateAction<ModelSectionId>>;
  visiblePickerModels: DesktopCuratedPickerModel[];
  activeModelId: string | null;
  canSelectPickerModel: (model: DesktopCuratedPickerModel) => boolean;
  onSelectModel: (model: DesktopCuratedPickerModel) => Promise<void> | void;
  modelToggles: ModelToggle[];
  hasPaidAccess: boolean;
  hasChatgptAuth: boolean;
  providerIdForModelId: (modelId: string) => ProviderId | null;
  onOpen: () => void;
  onClose: () => void;
};

const SECTION_LABELS: Record<ModelSectionId, string> = {
  all: "All",
  free: "Free",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "x-ai": "xAI",
  openrouter: "Other",
};

const MODEL_PICKER_SECTIONS: Array<{ id: ModelSectionId; label: string; icon: ReactNode }> = [
  {
    id: "all",
    label: "All",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
      </svg>
    ),
  },
  {
    id: "free",
    label: "Free",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12v10H4V12" />
        <path d="M2 7h20v5H2z" />
        <path d="M12 22V7" />
        <path d="M12 7c-2.2 0-4-1.8-4-4 2.2 0 4 1.8 4 4z" />
        <path d="M12 7c2.2 0 4-1.8 4-4-2.2 0-4 1.8-4 4z" />
      </svg>
    ),
  },
  {
    id: "openai",
    label: "OpenAI",
    icon: (
      <span className="model-picker-nav-logo">
        <img className="model-picker-nav-logo-img monochrome" src={openAiLogo} alt="" />
      </span>
    ),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: (
      <span className="model-picker-nav-logo">
        <img className="model-picker-nav-logo-img monochrome" src={anthropicLogo} alt="" />
      </span>
    ),
  },
  {
    id: "google",
    label: "Google",
    icon: (
      <span className="model-picker-nav-logo">
        <img className="model-picker-nav-logo-img monochrome" src={googleLogo} alt="" />
      </span>
    ),
  },
  {
    id: "x-ai",
    label: "xAI",
    icon: (
      <span className="model-picker-nav-logo">
        <img className="model-picker-nav-logo-img monochrome" src={xAiLogo} alt="" />
      </span>
    ),
  },
];

export function DesktopModelPickerPopover(props: DesktopModelPickerPopoverProps) {
  const {
    modelPickerRef,
    modelPickerSearchRef,
    isOpen,
    curatedPickerModels,
    selectedModelLabel,
    modelPickerQuery,
    setModelPickerQuery,
    modelPickerSection,
    setModelPickerSection,
    visiblePickerModels,
    activeModelId,
    canSelectPickerModel,
    onSelectModel,
    modelToggles,
    hasPaidAccess,
    hasChatgptAuth,
    providerIdForModelId,
    onOpen,
    onClose,
  } = props;

  return (
    <div className="ask-model" ref={modelPickerRef}>
      <button
        className="ask-model-btn"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? onClose() : onOpen())}
        disabled={curatedPickerModels.length === 0}
        title="Model"
      >
        <span className="ask-model-label">{selectedModelLabel}</span>
        <svg className="ask-model-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="model-picker-popover" role="dialog" aria-label="Choose a model">
          <div className="model-picker-modal">
            <div className="model-picker-search-row">
              <input
                ref={modelPickerSearchRef}
                className="model-picker-search"
                type="text"
                placeholder="Search models…"
                value={modelPickerQuery}
                onChange={(event) => setModelPickerQuery(event.target.value)}
              />
              <button
                className="model-picker-close"
                type="button"
                onClick={onClose}
                aria-label="Close model picker"
                title="Close"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="model-picker-body">
              <nav className="model-picker-nav" aria-label="Model sections">
                {MODEL_PICKER_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    className={modelPickerSection === section.id ? "model-picker-nav-btn active" : "model-picker-nav-btn"}
                    type="button"
                    aria-pressed={modelPickerSection === section.id}
                    aria-label={section.label}
                    title={section.label}
                    onClick={() => setModelPickerSection(section.id)}
                  >
                    <span className="model-picker-nav-icon" aria-hidden="true">
                      {section.icon}
                    </span>
                  </button>
                ))}
              </nav>
              <div className="model-picker-list" role="list">
                {(() => {
                  let lastSection: ModelSectionId | "" = "";
                  return visiblePickerModels.map((model) => {
                    const isSelected = model.id === (activeModelId ?? "").trim();
                    const selectable = canSelectPickerModel(model);
                    const isModelEnabled = modelToggles.some((toggle) => toggle.id === model.id);
                    const showPremiumCrown = model.access === "paid" && !hasPaidAccess;
                    const providerId = providerIdForModelId(model.id);
                    const lockedLabel = model.access === "free"
                      ? "Free"
                      : !showPremiumCrown && !isModelEnabled
                        ? "Soon"
                        : !showPremiumCrown && providerId === "openai" && !hasChatgptAuth
                          ? "Sign in"
                          : null;
                    const showGroupHeader =
                      modelPickerSection === "all" &&
                      model.section !== lastSection &&
                      SECTION_LABELS[model.section];
                    if (model.section !== lastSection) lastSection = model.section;
                    return (
                      <Fragment key={model.id}>
                        {showGroupHeader && (
                          <div className="model-picker-group-header">{SECTION_LABELS[model.section]}</div>
                        )}
                        <div
                          className={
                            "model-picker-row" +
                            (isSelected ? " selected" : "") +
                            (!selectable ? " locked" : "")
                          }
                        >
                          <button
                            className="model-picker-row-main"
                            type="button"
                            onClick={() => void onSelectModel(model)}
                            aria-current={isSelected ? "true" : undefined}
                          >
                            <div className="model-picker-row-info">
                              <div className="model-picker-row-title">
                                {model.label}
                                {showPremiumCrown && (
                                  <span className="model-picker-row-crown" title="Premium model" aria-label="Premium model">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 13H5L3 7z" />
                                      <path d="M8 17h8" />
                                    </svg>
                                  </span>
                                )}
                                {lockedLabel && <span className="model-picker-row-pill">{lockedLabel}</span>}
                              </div>
                              {model.description && (
                                <div className="model-picker-row-subtitle">{model.description}</div>
                              )}
                            </div>
                            <span className="model-picker-row-check" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      </Fragment>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
