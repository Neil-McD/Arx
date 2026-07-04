import type { KeyboardEvent, MutableRefObject } from "react";
import { useCallback, useMemo, useState } from "react";
import { Sparkles, Users } from "lucide-react";
import {
  splitBodyIntoMentionSegments,
  type ResolvedMentionForRendering,
} from "../../../../shared/communityMentionRendering";

export type MentionCandidate = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  // Non-user candidates tag canonical server-side identities by key, not user id.
  kind?: "user" | "community_agent" | "role";
  roleKey?: "everybody";
  emailMode?: "in_app_only" | "in_app_and_email" | null;
  emailCooldownUntil?: string | null;
  /** Description shown in place of a handle/badge (e.g. "Notifies 79 in-app"). */
  subtitle?: string;
  /** Extra query tokens that also surface this candidate (e.g. "all", "everyone"). */
  matchAliases?: string[];
};

export type CommittedMention = {
  userId: string;
  displayName: string;
  /** The exact text inserted into the composer (e.g. "@rashidk"). Handles are
   * the only user mention tokens; display names are presentation only. */
  token: string;
  kind?: "user" | "community_agent" | "role";
  agentKey?: string;
  roleKey?: "everybody";
  emailMode?: "in_app_only" | "in_app_and_email" | null;
  emailCooldownUntil?: string | null;
};

// Max characters we'll scan back from the caret as a mention query. Display names can
// contain spaces ("Neil McDevitt"), so we allow them, but cap the span so an `@` early
// in a long message doesn't keep the menu open across an entire paragraph.
const MAX_QUERY_LENGTH = 40;
const MAX_RESULTS = 8;

type ActiveQuery = {
  atIndex: number;
  query: string;
};

// Find the mention token the caret currently sits inside, if any. Returns null when the
// caret is not within an `@...` token we should complete.
function findActiveQuery(value: string, caret: number): ActiveQuery | null {
  // Scan backwards from the caret for the `@` that opens the current token.
  for (let i = caret - 1; i >= 0; i -= 1) {
    const char = value[i];
    if (char === "@") {
      const before = i === 0 ? "" : value[i - 1];
      // Only treat as a mention when the `@` starts a word (start of input or after space).
      if (i !== 0 && !/\s/.test(before)) return null;
      const query = value.slice(i + 1, caret);
      if (query.length > MAX_QUERY_LENGTH) return null;
      if (/[\n@]/.test(query)) return null;
      // Don't open on `@ ` — a space immediately after `@` means it's not a mention.
      if (/^\s/.test(query)) return null;
      return { atIndex: i, query };
    }
    if (char === "\n") return null;
  }
  return null;
}

function matchesQuery(candidate: MentionCandidate, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  if (candidate.displayName.toLowerCase().includes(needle)) return true;
  if (candidate.handle && candidate.handle.toLowerCase().includes(needle)) return true;
  if (candidate.matchAliases?.some((alias) => alias.toLowerCase().includes(needle))) return true;
  return false;
}

export type MentionAutocomplete = {
  isOpen: boolean;
  query: string;
  results: MentionCandidate[];
  highlightedIndex: number;
  /** Recompute the active query from the textarea's current value + caret. */
  syncFromTextarea: (textarea: HTMLTextAreaElement) => void;
  /** Close the menu (e.g. on blur or after send). */
  close: () => void;
  /** Handle a keydown; returns true when the event was consumed by the menu. */
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Insert the chosen candidate at the active token and record the mention. */
  pick: (candidate: MentionCandidate) => void;
  setHighlightedIndex: (index: number) => void;
};

export function useMentionAutocomplete(params: {
  candidates: MentionCandidate[];
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  /** Write the new textarea value back into the owning state. */
  applyText: (value: string, textarea: HTMLTextAreaElement) => void;
  /** Record a mention pick so it can be sent with the message. */
  onCommitMention: (mention: CommittedMention) => void;
  /** Report the active query so callers can hydrate scoped candidates remotely. */
  onActiveQueryChange?: (query: string | null) => void;
}): MentionAutocomplete {
  const { candidates, textareaRef, applyText, onCommitMention, onActiveQueryChange } = params;
  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const results = useMemo(() => {
    if (!active) return [];
    return candidates.filter((candidate) => matchesQuery(candidate, active.query)).slice(0, MAX_RESULTS);
  }, [active, candidates]);

  const isOpen = active !== null && results.length > 0;

  const close = useCallback(() => {
    setActive(null);
    setHighlightedIndex(0);
    onActiveQueryChange?.(null);
  }, [onActiveQueryChange]);

  const syncFromTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart ?? textarea.value.length;
    const next = findActiveQuery(textarea.value, caret);
    setActive(next);
    setHighlightedIndex(0);
    onActiveQueryChange?.(next?.query ?? null);
  }, [onActiveQueryChange]);

  const pick = useCallback(
    (candidate: MentionCandidate) => {
      const textarea = textareaRef.current;
      if (!textarea || !active) return;
      const value = textarea.value;
      const caret = textarea.selectionStart ?? value.length;
      const before = value.slice(0, active.atIndex);
      const after = value.slice(caret);
      // Users tokenize by handle only. Non-user candidates use canonical role/agent labels.
      if ((candidate.kind ?? "user") === "user" && !candidate.handle) {
        close();
        return;
      }
      const token =
        candidate.kind === "role"
          ? `@${candidate.roleKey ?? "everybody"}`
          : candidate.kind === "community_agent"
            ? `@${candidate.displayName}`
            : `@${candidate.handle}`;
      const needsSpace = !after.startsWith(" ");
      const nextValue = `${before}${token}${needsSpace ? " " : ""}${after}`;
      const nextCaret = before.length + token.length + 1;

      applyText(nextValue, textarea);
      onCommitMention({
        userId: candidate.userId,
        displayName: candidate.displayName,
        token,
        kind: candidate.kind ?? "user",
        ...(candidate.kind === "community_agent" ? { agentKey: "community_agent" } : {}),
        ...(candidate.kind === "role"
          ? {
              roleKey: candidate.roleKey ?? "everybody",
              emailMode: candidate.emailMode ?? null,
              emailCooldownUntil: candidate.emailCooldownUntil ?? null,
            }
          : {}),
      });
      close();

      // Restore the caret after React re-renders the controlled value.
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [active, applyText, close, onCommitMention, textareaRef],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (active === null || results.length === 0) return false;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((index) => (index + 1) % results.length);
          return true;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((index) => (index - 1 + results.length) % results.length);
          return true;
        case "Enter":
        case "Tab": {
          event.preventDefault();
          const candidate = results[Math.min(highlightedIndex, results.length - 1)];
          if (candidate) pick(candidate);
          return true;
        }
        case "Escape":
          event.preventDefault();
          close();
          return true;
        default:
          return false;
      }
    },
    [active, results, highlightedIndex, pick, close],
  );

  return {
    isOpen,
    query: active?.query ?? "",
    results,
    highlightedIndex,
    syncFromTextarea,
    close,
    handleKeyDown,
    pick,
    setHighlightedIndex,
  };
}

export function MentionAutocompleteMenu(props: {
  autocomplete: MentionAutocomplete;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
}) {
  const { autocomplete, getAvatarColor, getInitials } = props;
  const { isOpen, results, highlightedIndex, pick, setHighlightedIndex } = autocomplete;

  if (!isOpen) return null;

  return (
    <div
      className="mention-autocomplete"
      role="listbox"
      onMouseDown={(event) => {
        // Keep focus in the textarea: if the mousedown steals it, the textarea's
        // blur closes the menu before the row's click can land.
        event.preventDefault();
      }}
    >
      {results.map((candidate, index) => (
        <button
          key={candidate.userId}
          type="button"
          role="option"
          aria-selected={index === highlightedIndex}
          className={`mention-autocomplete-row${index === highlightedIndex ? " is-active" : ""}${candidate.kind === "community_agent" ? " is-agent" : ""}${candidate.kind === "role" ? " is-role" : ""}`}
          onMouseEnter={() => setHighlightedIndex(index)}
          onClick={() => pick(candidate)}
        >
          <span
            className="mention-autocomplete-avatar"
            style={
              candidate.avatarUrl
                ? { backgroundImage: `url(${candidate.avatarUrl})` }
                : // Only user avatars take a generated fill; role/agent tiles are
                  // styled by their CSS class so the theme accent can take hold.
                  (candidate.kind ?? "user") === "user"
                  ? { backgroundColor: getAvatarColor(candidate.userId) }
                  : undefined
            }
          >
            {candidate.avatarUrl ? null : candidate.kind === "role" ? (
              <Users size={16} aria-hidden="true" />
            ) : candidate.kind === "community_agent" ? (
              <Sparkles size={16} aria-hidden="true" />
            ) : (
              getInitials(candidate.displayName)
            )}
          </span>
          <span className="mention-autocomplete-meta">
            <span className="mention-autocomplete-name">{candidate.displayName}</span>
            {candidate.kind === "community_agent" ? (
              <span className="mention-autocomplete-subline">
                <span className="mention-autocomplete-handle">Community agent</span>
                <span className="mention-autocomplete-agent-badge">AGENT</span>
              </span>
            ) : candidate.subtitle ? (
              <span className="mention-autocomplete-handle">{candidate.subtitle}</span>
            ) : candidate.handle ? (
              <span className="mention-autocomplete-handle">@{candidate.handle}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

function resolveCommittedMentionsForComposer(
  mentions: readonly CommittedMention[],
): ResolvedMentionForRendering[] {
  return mentions.reduce<ResolvedMentionForRendering[]>((resolved, mention, index) => {
    const token = String(mention.token ?? "").trim();
    const label = token.replace(/^@+/, "").trim();
    if (!label) return resolved;
    resolved.push({
      key: `${mention.kind ?? "user"}:${mention.userId}:${mention.agentKey ?? ""}:${token}:${index}`,
      label,
      kind: mention.kind ?? "user",
      userId: mention.kind === "community_agent" || mention.kind === "role" ? null : mention.userId,
      isSelf: false,
    });
    return resolved;
  }, []);
}

export function MentionComposerHighlight(props: {
  value: string;
  mentions: readonly CommittedMention[];
}) {
  const resolvedMentions = useMemo(
    () => resolveCommittedMentionsForComposer(props.mentions),
    [props.mentions],
  );
  const segments = useMemo(
    () => splitBodyIntoMentionSegments(props.value, resolvedMentions),
    [props.value, resolvedMentions],
  );

  return (
    <div className="mention-composer-highlight" aria-hidden="true">
      <span className="mention-composer-highlight-content">
        {segments.map((segment, index) =>
          segment.type === "mention" ? (
            <span
              key={`m:${index}:${segment.mention.key}`}
              className={`mention-composer-highlight-token${segment.mention.kind === "community_agent" ? " is-agent" : ""}`}
            >
              {segment.text}
            </span>
          ) : (
            <span key={`p:${index}`}>{segment.text}</span>
          ),
        )}
      </span>
    </div>
  );
}
