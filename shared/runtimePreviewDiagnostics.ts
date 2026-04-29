import type { RuntimeWorkspaceTerminalPrompt } from "./runtimePrompt.ts";

export type RuntimePreviewDiagnosis =
  | "process_dead"
  | "preview_unreachable"
  | "transport_loaded_render_unknown"
  | "cross_origin_uninspectable"
  | "blank_suspected"
  | "visible_content"
  | "runtime_error_suspected";

export type RuntimePreviewDiagnosisResult = {
  diagnosis: RuntimePreviewDiagnosis;
  recommendedNextAction: string;
};

function includesAny(value: string | null | undefined, needles: string[]): boolean {
  const normalized = String(value ?? "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

export function deriveRuntimePreviewDiagnosis(
  terminal: RuntimeWorkspaceTerminalPrompt,
): RuntimePreviewDiagnosisResult | null {
  if (
    terminal.status === "exited" ||
    terminal.status === "failed" ||
    terminal.status === "stopped" ||
    terminal.healthStatus === "exited" ||
    terminal.previewStatus === "server_exited"
  ) {
    return {
      diagnosis: "process_dead",
      recommendedNextAction:
        "Read terminal output, fix the server command if needed, then restart the background terminal.",
    };
  }

  if (
    terminal.previewTransportStatus === "failed" ||
    terminal.previewRenderStatus === "transport_error" ||
    terminal.previewStatus === "unreachable"
  ) {
    return {
      diagnosis: "preview_unreachable",
      recommendedNextAction:
        "Probe the preview URL/port and read terminal output before changing app code.",
    };
  }

  if (
    includesAny(terminal.lastBrowserObservationSummary, ["runtime error", "console error", "uncaught"]) ||
    includesAny(terminal.lastPreviewProbeSummary, ["runtime error", "console error", "uncaught"]) ||
    terminal.previewStatus === "render_error_suspected"
  ) {
    return {
      diagnosis: "runtime_error_suspected",
      recommendedNextAction:
        "Inspect the browser/runtime error first, then inspect the app entrypoint and failing import/component.",
    };
  }

  if (terminal.previewRenderStatus === "visible_content") {
    return {
      diagnosis: "visible_content",
      recommendedNextAction:
        "Treat the preview as visually loaded; continue with the user's task or verify the specific UI concern.",
    };
  }

  if (terminal.previewRenderStatus === "blank_suspected" || terminal.previewStatus === "blank") {
    return {
      diagnosis: "blank_suspected",
      recommendedNextAction:
        "Keep the healthy server running; inspect browser/render state, then app root mount, imports, component render, and CSS visibility.",
    };
  }

  if (terminal.previewInspectionStatus === "cross_origin_uninspectable") {
    return {
      diagnosis: "cross_origin_uninspectable",
      recommendedNextAction:
        "Use computer/browser observation to verify the visual render because the iframe DOM cannot be inspected directly.",
    };
  }

  if (terminal.previewTransportStatus === "loaded") {
    return {
      diagnosis: "transport_loaded_render_unknown",
      recommendedNextAction:
        "Do not assume the app rendered; collect a browser/computer observation or same-origin render probe.",
    };
  }

  return null;
}
