import {
  AGENT_PERSONALITY_PRESETS,
  findAgentPersonalityPresetBySoul,
  type AgentPersonalityPreset,
  type AgentPersonalityPresetId,
} from "../../../../shared/agentPersonalityPresets";

type WebAgentPersonalityPickerProps = {
  value: string;
  onChange: (nextPromptText: string) => void;
  disabled?: boolean;
  variant?: "onboarding" | "settings";
};

type RobotFaceKind = AgentPersonalityPresetId;

function RobotHead(props: { kind: RobotFaceKind }) {
  return (
    <span className={`agent-personality-robot ${props.kind}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" focusable="false">
        {renderRobotFace(props.kind)}
      </svg>
    </span>
  );
}

function renderRobotFace(kind: RobotFaceKind) {
  switch (kind) {
    case "builder":
      return (
        <>
          <rect className="robot-head" x="25" y="25" width="70" height="66" rx="18" />
          <path className="robot-detail" d="M45 22v-9M75 22v-9M39 42h42" />
          <circle className="robot-eye" cx="47" cy="58" r="6" />
          <circle className="robot-eye" cx="73" cy="58" r="6" />
          <path className="robot-mouth" d="M45 75h30" />
        </>
      );
    case "strategist":
      return (
        <>
          <path className="robot-head" d="M28 37l18-18h28l18 18v42L74 96H46L28 79z" />
          <path className="robot-detail" d="M38 43h44M39 82h42" />
          <rect className="robot-eye" x="42" y="55" width="15" height="8" rx="4" />
          <rect className="robot-eye" x="63" y="55" width="15" height="8" rx="4" />
          <path className="robot-mouth" d="M50 72l20-10" />
        </>
      );
    case "researcher":
      return (
        <>
          <path className="robot-head" d="M30 45c0-19 13-28 30-28s30 9 30 28v29c0 15-13 24-30 24s-30-9-30-24z" />
          <path className="robot-detail" d="M42 40h36" />
          <circle className="robot-eye hollow" cx="48" cy="60" r="9" />
          <circle className="robot-eye hollow" cx="72" cy="60" r="9" />
          <path className="robot-mouth" d="M51 78h18M82 84l12 12" />
        </>
      );
    case "creative":
      return (
        <>
          <path className="robot-head" d="M33 36c9-18 45-18 54 0v37c0 19-13 27-27 27S33 92 33 73z" />
          <path className="robot-detail" d="M48 19l-8-9M72 19l8-9M60 18v-12" />
          <circle className="robot-eye" cx="48" cy="58" r="5" />
          <path className="robot-eye" d="M68 55c8 0 8 10 0 10s-8-10 0-10z" />
          <path className="robot-mouth" d="M47 77c9 8 17 8 26 0" />
        </>
      );
    case "coach":
      return (
        <>
          <rect className="robot-head" x="30" y="28" width="60" height="68" rx="28" />
          <path className="robot-detail" d="M23 58h7M90 58h7" />
          <circle className="robot-eye" cx="49" cy="59" r="5" />
          <circle className="robot-eye" cx="71" cy="59" r="5" />
          <path className="robot-mouth" d="M47 75c8 8 18 8 26 0" />
        </>
      );
    case "curious":
      return (
        <>
          <path className="robot-head" d="M24 48c0-18 15-31 36-31s36 13 36 31v27c0 15-15 26-36 26S24 90 24 75z" />
          <path className="robot-detail" d="M60 17v-10M60 7h12" />
          <circle className="robot-eye wide" cx="48" cy="60" r="8" />
          <circle className="robot-eye" cx="73" cy="60" r="5" />
          <path className="robot-mouth" d="M55 78h12" />
        </>
      );
    case "funny":
      return (
        <>
          <rect className="robot-head" x="27" y="31" width="66" height="62" rx="22" />
          <path className="robot-detail" d="M38 31l-8-11M82 31l8-11" />
          <path className="robot-eye" d="M43 56c7-7 14 0 7 7M71 56c-7-7-14 0-7 7" />
          <path className="robot-mouth" d="M45 74c10 12 20 12 30 0" />
        </>
      );
    case "warm":
      return (
        <>
          <path className="robot-head" d="M31 42c0-16 13-27 29-27s29 11 29 27v32c0 17-13 28-29 28S31 91 31 74z" />
          <path className="robot-detail" d="M43 39c8-8 26-8 34 0" />
          <circle className="robot-eye" cx="49" cy="61" r="5" />
          <circle className="robot-eye" cx="71" cy="61" r="5" />
          <path className="robot-mouth" d="M47 76c7 7 19 7 26 0" />
        </>
      );
    case "mad_scientist":
      return (
        <>
          <path className="robot-head" d="M26 45l12-20 22-8 22 8 12 20v31L82 98H38L26 76z" />
          <path className="robot-detail" d="M39 25l-13-14M81 25l13-14M40 45l40 0" />
          <path className="robot-eye" d="M43 57l11 9M54 57l-11 9M66 57l11 9M77 57l-11 9" />
          <path className="robot-mouth" d="M48 79h24M54 73v12M66 73v12" />
        </>
      );
    case "zen":
      return (
        <>
          <rect className="robot-head" x="28" y="34" width="64" height="56" rx="28" />
          <path className="robot-detail" d="M43 32c9-8 25-8 34 0M42 82h36" />
          <path className="robot-eye" d="M43 59h14M63 59h14" />
          <path className="robot-mouth" d="M52 73h16" />
        </>
      );
    case "skeptic":
      return (
        <>
          <path className="robot-head" d="M31 29h58v48L74 94H46L31 77z" />
          <path className="robot-detail" d="M38 45l19 5M82 45l-19 5" />
          <rect className="robot-eye" x="43" y="58" width="14" height="7" rx="3.5" />
          <rect className="robot-eye" x="64" y="58" width="14" height="7" rx="3.5" />
          <path className="robot-mouth" d="M49 78h22" />
        </>
      );
    case "operator":
      return (
        <>
          <rect className="robot-head" x="25" y="29" width="70" height="62" rx="10" />
          <path className="robot-detail" d="M36 42h48M36 80h48M60 21v8" />
          <rect className="robot-eye" x="41" y="56" width="16" height="9" rx="2" />
          <rect className="robot-eye" x="63" y="56" width="16" height="9" rx="2" />
          <path className="robot-mouth" d="M48 74h24" />
        </>
      );
  }
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
      <RobotHead kind={props.preset.id} />
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

  return (
    <section className={`agent-personality-picker ${variant}`} aria-label="Agent personality">
      <div className="agent-personality-picker-header">
        <span>Personality</span>
        <small>Choose the energy your agent brings.</small>
      </div>
      <div className="agent-personality-picker-window">
        <div className="agent-personality-track" aria-label="Agent personality presets">
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
