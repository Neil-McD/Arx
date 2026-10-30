import type { KeyboardEvent, MutableRefObject } from "react";
import { CommunityAgentIcon } from "../../../../shared/CommunityAgentIcon";
import { useCallback, useMemo, useState } from "react";
import { Users } from "lucide-react";
import {
  splitBodyIntoMentionSegments,
  textContainsMentionToken,
  type ResolvedMentionForRendering,
} from "../../../../shared/communityMentionRendering";
import { buildCommunityComposerMentionInsertion } from "../controllers/communityComposerMentionInsertion";

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

export function committedMentionFromCandidate(
  candidate: MentionCandidate,
): CommittedMention | null {
  const kind = candidate.kind ?? "user";
  const normalizedHandle = String(candidate.handle ?? "").trim().replace(/^@+/, "");
  if (kind === "user" && !normalizedHandle) return null;

  const token = kind === "role"
    ? `@${candidate.roleKey ?? "everybody"}`
    : kind === "community_agent"
      ? `@${candidate.displayName}`
      : `@${normalizedHandle}`;

  return {
    userId: candidate.userId,
    displayName: candidate.displayName,
    token,
    kind,
    ...(kind === "community_agent" ? { agentKey: "community_agent" } : {}),
    ...(kind === "role"
      ? {
          roleKey: candidate.roleKey ?? "everybody",
          emailMode: candidate.emailMode ?? null,
          emailCooldownUntil: candidate.emailCooldownUntil ?? null,
        }
      : {}),
  };
}

// Max characters we'll scan back from the caret as a mention query. Display names can
// contain spaces ("Neil McDevitt"), so we allow them, but cap the span so an `@` early
// in a long message doesn't keep the menu open across an entire paragraph.
const MAX_QUERY_LENGTH = 40;
const MAX_RESULTS = 8;

type CommittedMentionRange = {
  start: number;
  end: number;
};

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

function isHandleChar(char: string | undefined): boolean {
  return typeof char === "string" && /[A-Za-z0-9_-]/.test(char);
}

function hasMentionStartBoundary(text: string, index: number): boolean {
  return index === 0 || /\s/.test(text[index - 1] ?? "");
}

function findCommittedMentionRanges(
  text: string,
  mentions: readonly CommittedMention[],
): CommittedMentionRange[] {
  const body = String(text ?? "");
  if (!body || mentions.length === 0) return [];

  const ranges: CommittedMentionRange[] = [];
  const overlaps = (start: number, end: number): boolean =>
    ranges.some((range) => start < range.end && end > range.start);

  const candidates = mentions
    .filter((mention) => String(mention.token ?? "").trim().startsWith("@"))
    .slice()
    .sort((a, b) => String(b.token ?? "").trim().length - String(a.token ?? "").trim().length);

  for (const mention of candidates) {
    const token = String(mention.token ?? "").trim();
    if (token.length <= 1) continue;
    let searchFrom = 0;
    while (searchFrom < body.length) {
      const start = body.indexOf(token, searchFrom);
      if (start < 0) break;
      const end = start + token.length;
      if (hasMentionStartBoundary(body, start) && !isHandleChar(body[end]) && !overlaps(start, end)) {
        ranges.push({ start, end });
      }
      searchFrom = start + 1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function findMentionRangeForBackspace(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  mentions: readonly CommittedMention[],
): CommittedMentionRange | null {
  const ranges = findCommittedMentionRanges(text, mentions);
  if (ranges.length === 0) return null;

  if (selectionStart === selectionEnd) {
    const caret = selectionStart;
    return (
      ranges.find((range) => caret > range.start && caret <= range.end) ??
      ranges.find((range) => caret > 0 && /\s/.test(text[caret - 1] ?? "") && range.end === caret - 1) ??
      null
    );
  }

  return (
    ranges.find((range) => selectionStart === range.start && selectionEnd === range.end) ??
    ranges.find((range) => selectionStart < range.end && selectionEnd > range.start) ??
    null
  );
}

export function handleMentionTokenBackspace(params: {
  event: KeyboardEvent<HTMLTextAreaElement>;
  mentions: readonly CommittedMention[];
  applyText: (value: string, textarea: HTMLTextAreaElement) => void;
  setMentions: (updater: (prev: CommittedMention[]) => CommittedMention[]) => void;
}): boolean {
  const { event, mentions, applyText, setMentions } = params;
  if (event.key !== "Backspace" || event.altKey || event.ctrlKey || event.metaKey) return false;

  const textarea = event.currentTarget;
  const value = textarea.value;
  const selectionStart = textarea.selectionStart ?? 0;
  const selectionEnd = textarea.selectionEnd ?? selectionStart;
  const range = findMentionRangeForBackspace(value, selectionStart, selectionEnd, mentions);
  if (!range) return false;

  event.preventDefault();

  if (selectionStart !== range.start || selectionEnd !== range.end) {
    textarea.setSelectionRange(range.start, range.end);
    return true;
  }

  const deleteEnd = value[range.end] === " " ? range.end + 1 : range.end;
  const nextValue = `${value.slice(0, range.start)}${value.slice(deleteEnd)}`;
  applyText(nextValue, textarea);
  setMentions((prev) => prev.filter((mention) => textContainsMentionToken(nextValue, mention.token)));

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(range.start, range.start);
  });

  return true;
}

export type MentionAutocomplete = {
  isOpen: boolean;
  query: string;
  results: MentionCandidate[];
  highlightedIndex: number;
  /** Recompute the active query from the textarea's current value + caret. */
  syncFromTextarea: (textarea: HTMLTextAreaElement) => void;
  /** Insert an @ token at the current selection and open the picker. */
  begin: () => void;
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

  const begin = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const value = textarea.value;
    const insertion = buildCommunityComposerMentionInsertion(
      value,
      textarea.selectionStart ?? value.length,
      textarea.selectionEnd ?? textarea.selectionStart ?? value.length,
    );

    applyText(insertion.value, textarea);
    setActive({ atIndex: insertion.atIndex, query: "" });
    setHighlightedIndex(0);
    onActiveQueryChange?.("");

    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(insertion.caret, insertion.caret);
    });
  }, [applyText, onActiveQueryChange, textareaRef]);

  const pick = useCallback(
    (candidate: MentionCandidate) => {
      const textarea = textareaRef.current;
      if (!textarea || !active) return;
      const value = textarea.value;
      const caret = textarea.selectionStart ?? value.length;
      const before = value.slice(0, active.atIndex);
      const after = value.slice(caret);
      const committedMention = committedMentionFromCandidate(candidate);
      if (!committedMention) {
        close();
        return;
      }
      const token = committedMention.token;
      const needsSpace = !after.startsWith(" ");
      const nextValue = `${before}${token}${needsSpace ? " " : ""}${after}`;
      const nextCaret = before.length + token.length + 1;

      applyText(nextValue, textarea);
      onCommitMention(committedMention);
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
    begin,
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
  id?: string;
}) {
  const { autocomplete, getAvatarColor, getInitials } = props;
  const { isOpen, results, highlightedIndex, pick, setHighlightedIndex } = autocomplete;

  if (!isOpen) return null;

  return (
    <div
      id={props.id}
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
              <CommunityAgentIcon size={16} />
            ) : (
              getInitials(candidate.displayName)
            )}
          </span>
          <span className="mention-autocomplete-meta">
            <span className="mention-autocomplete-name-row">
              <span className="mention-autocomplete-name">{candidate.displayName}</span>
            </span>
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
