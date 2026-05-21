import {
  AGENT_PERSONALITY_PRESETS,
  findAgentPersonalityPresetBySoul,
  type AgentPersonalityPreset,
  type AgentPersonalityPresetTone,
} from "../../../../shared/agentPersonalityPresets";

type WebAgentPersonalityPickerProps = {
  value: string;
  onChange: (nextPromptText: string) => void;
  disabled?: boolean;
  variant?: "onboarding" | "settings";
};

const MARK_PATHS: Record<AgentPersonalityPresetTone | "custom", { main: string; alt: string }> = {
  builder: { main: "M15 29c5-12 13-12 18 0", alt: "M16 20h16" },
  strategist: { main: "M14 30l20-13", alt: "M16 17l16 14" },
  researcher: { main: "M15 28c5-9 13-9 18 0", alt: "M17 17h14" },
  creative: { main: "M14 27c6-13 14 6 20-7", alt: "M17 18c4 6 10 6 14 0" },
  coach: { main: "M14 24c4 9 16 9 20 0", alt: "M17 18h14" },
  curious: { main: "M15 29c5-12 13-12 18 0", alt: "M17 17c4 8 10 8 14 0" },
  funny: { main: "M15 27c5 7 13 7 18 0", alt: "M17 18c4 7 10 7 14 0" },
  warm: { main: "M14 24c4 9 16 9 20 0", alt: "M18 18h12" },
  mad_scientist: { main: "M14 30c6-16 14 8 20-8", alt: "M17 16l14 8" },
  zen: { main: "M15 25h18", alt: "M18 19h12" },
  skeptic: { main: "M15 29c5-12 13-12 18 0", alt: "M16 19l16 6" },
  operator: { main: "M15 28h18", alt: "M17 19h14" },
  custom: { main: "M15 25h18M24 16v18", alt: "M17 17l14 14" },
};

function AgentPersonalityMark(props: { tone: AgentPersonalityPresetTone }) {
  const paths = MARK_PATHS[props.tone];
  return (
    <span className={`agent-personality-mark ${props.tone}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <circle className="agent-personality-mark-base" cx="24" cy="24" r="19" />
        <path className="agent-personality-mark-line main" d={paths.main} />
        <path className="agent-personality-mark-line alt" d={paths.alt} />
        <circle className="agent-personality-mark-dot one" cx="18" cy="20" r="2.7" />
        <circle className="agent-personality-mark-dot two" cx="30" cy="20" r="2.7" />
      </svg>
    </span>
  );
}

function AgentPersonalityCard(props: {
  preset: AgentPersonalityPreset;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`agent-personality-card ${props.preset.tone}${props.selected ? " selected" : ""}`}
      type="button"
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      <AgentPersonalityMark tone={props.preset.tone} />
      <span className="agent-personality-copy">
        <strong>{props.preset.name}</strong>
        <span>{props.preset.oneLiner}</span>
      </span>
    </button>
  );
}

export function WebAgentPersonalityPicker({
  value,
  onChange,
  disabled = false,
  variant = "onboarding",
}: WebAgentPersonalityPickerProps) {
  const selectedPreset = findAgentPersonalityPresetBySoul(value);
  const hasCustomPersonality = value.trim().length > 0 && !selectedPreset;

  return (
    <section className={`agent-personality-picker ${variant}`} aria-label="Agent personality">
      <div className="agent-personality-picker-header">
        <span>Personality</span>
        <small>Choose the energy your agent brings.</small>
      </div>
      <div className="agent-personality-picker-window">
        <div className="agent-personality-track" aria-label="Agent personality presets">
          {hasCustomPersonality ? (
            <div className="agent-personality-card custom selected" aria-current="true">
              <span className="agent-personality-mark custom" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <circle className="agent-personality-mark-base" cx="24" cy="24" r="19" />
                  <path className="agent-personality-mark-line main" d={MARK_PATHS.custom.main} />
                  <path className="agent-personality-mark-line alt" d={MARK_PATHS.custom.alt} />
                  <circle className="agent-personality-mark-dot one" cx="17" cy="17" r="2.7" />
                  <circle className="agent-personality-mark-dot two" cx="31" cy="31" r="2.7" />
                </svg>
              </span>
              <span className="agent-personality-copy">
                <strong>Custom</strong>
                <span>Your current saved personality.</span>
              </span>
            </div>
          ) : null}
          {AGENT_PERSONALITY_PRESETS.map((preset) => (
            <AgentPersonalityCard
              key={preset.id}
              preset={preset}
              selected={selectedPreset?.id === preset.id}
              disabled={disabled}
              onSelect={() => onChange(preset.promptText)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
