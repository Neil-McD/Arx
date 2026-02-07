export type AgentMode = "build" | "plan" | "explore";
export type VoiceSurface = "workspace" | "community";
export type VoiceUiState = "idle" | "recording" | "transcribing";

export type RunPhase =
  | "idle"
  | "preparing"
  | "thinking"
  | "awaiting_approval"
  | "running_tool"
  | "streaming"
  | "cancelling";

type RunPhaseAction =
  | { type: "send_start" }
  | { type: "agent_thinking" }
  | { type: "agent_working" }
  | { type: "approval_requested" }
  | { type: "approval_resolved" }
  | { type: "tool_started" }
  | { type: "stream_chunk" }
  | { type: "cancel_requested" }
  | { type: "turn_finished" }
  | { type: "reset" };

export function runPhaseReducer(state: RunPhase, action: RunPhaseAction): RunPhase {
  switch (action.type) {
    case "send_start":
      return "preparing";
    case "agent_thinking":
      return state === "cancelling" ? "cancelling" : "thinking";
    case "agent_working":
    case "tool_started":
      return state === "cancelling" ? "cancelling" : "running_tool";
    case "approval_requested":
      return state === "cancelling" ? "cancelling" : "awaiting_approval";
    case "approval_resolved":
      return state === "cancelling" ? "cancelling" : "thinking";
    case "stream_chunk":
      return state === "cancelling" ? "cancelling" : "streaming";
    case "cancel_requested":
      return "cancelling";
    case "turn_finished":
    case "reset":
      return "idle";
    default:
      return state;
  }
}
