// Recognizable monochrome marks for the AI harnesses that connect to Polynet
// through one universal MCP setup prompt. Rendered inline as tiny SVGs so they
// adapt to light and dark themes with zero external asset requests.
import type { ReactNode } from "react";

type HarnessItem = {
  id: string;
  name: string;
  icon: ReactNode;
};

const HARNESSES: readonly HarnessItem[] = [
  {
    id: "claude",
    name: "Claude",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
      </svg>
    ),
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5a4 4 0 0 1 3.7 2.5A4 4 0 0 1 19.5 10a4 4 0 0 1-1.3 5.2A4 4 0 0 1 12 20.5a4 4 0 0 1-3.7-2.5A4 4 0 0 1 4.5 14a4 4 0 0 1 1.3-5.2A4 4 0 0 1 12 3.5Z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    ),
  },
  {
    id: "codex",
    name: "Codex",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" />
        <path d="M8.5 9.5 11.5 12l-3 2.5M13.5 14.5h3" />
      </svg>
    ),
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M12 3v9l8-4.5M12 12l-8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    id: "grok",
    name: "Grok",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M7 17 18.5 5.5" />
      </svg>
    ),
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 18.5C5.2 14.2 6.2 8.8 10 5.5M12 19c-.3-4.6 1.1-9.6 4.4-13M17 18.5c0-3.2 1-6.5 2.8-9.2" />
      </svg>
    ),
  },
  {
    id: "hermes",
    name: "Hermes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 11c4-5 10.5-6 16-5-2.6 2.8-4.2 5.2-6 8.5l4 .5c-4.5 2.6-9 3.5-14 3 1.4-2.1 2.2-4 2.5-5.8" />
      </svg>
    ),
  },
];

export const AI_HARNESS_NAMES = HARNESSES.map((item) => item.name);

export function KitAiHarnessLogos(props: { compact?: boolean }) {
  return (
    <div
      className={`ai-harness-strip${props.compact ? " is-compact" : ""}`}
      role="list"
      aria-label={`Works with ${AI_HARNESS_NAMES.join(", ")}`}
    >
      {HARNESSES.map((harness) => (
        <span key={harness.id} className="ai-harness-chip" role="listitem">
          <span className="ai-harness-icon" aria-hidden="true">
            {harness.icon}
          </span>
          <span>{harness.name}</span>
        </span>
      ))}
    </div>
  );
}
