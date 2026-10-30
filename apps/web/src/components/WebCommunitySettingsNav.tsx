import { useMemo, useState, type ReactNode } from "react";
import { CommunityAgentIcon } from "../../../../shared/CommunityAgentIcon";
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardList,
  DoorOpen,
  KeyRound,
  Megaphone,
  Palette,
  Search,
  Settings2,
  Tag,
  TriangleAlert,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { CommunitySettingsPane } from "../../../../shared/appShellNavigation";

// Settings' own navigation, after Substack's: top items with an icon, the
// General page's sections indented under it (no icon) as anchors, then
// UPPERCASE groups. Items that open another editor say so with an arrow.

export type SettingsAnchor = { id: string; label: string; keywords?: string };

export type SettingsNavItem =
  | {
      kind: "pane";
      pane: CommunitySettingsPane;
      label: string;
      icon: ReactNode;
      keywords?: string;
      anchors?: SettingsAnchor[];
    }
  | { kind: "link"; id: string; label: string; icon: ReactNode; path: string; keywords?: string };

export type SettingsNavGroup = { label: string | null; items: SettingsNavItem[] };

const ICON = { size: 16, strokeWidth: 2, "aria-hidden": true } as const;

export const GENERAL_ANCHORS: SettingsAnchor[] = [
  { id: "settings-identity", label: "Identity", keywords: "name address slug url logo avatar banner image" },
  { id: "settings-profile", label: "Public profile", keywords: "one-liner about description bio" },
  { id: "settings-access", label: "Access & pricing", keywords: "visibility discover published unlisted price free monthly annual paid" },
  { id: "settings-payments", label: "Payments", keywords: "stripe payout bank fee" },
];

export function buildCommunitySettingsNav(params: {
  panes: CommunitySettingsPane[];
  workflowsPath: string | null;
  peoplePath?: string | null;
}): SettingsNavGroup[] {
  const has = (pane: CommunitySettingsPane) => params.panes.includes(pane);
  const top: SettingsNavItem[] = [];
  if (has("community")) {
    top.push({ kind: "pane", pane: "community", label: "General", icon: <Settings2 {...ICON} />, anchors: GENERAL_ANCHORS });
  }
  if (has("sales_page")) {
    top.push({
      kind: "pane",
      pane: "sales_page",
      label: "Sales page",
      icon: <Megaphone {...ICON} />,
      keywords: "public page about landing classroom pitch video gallery join visitors",
    });
  }
  if (has("offers")) {
    top.push({ kind: "pane", pane: "offers", label: "Offers", icon: <Tag {...ICON} />, keywords: "offers packages tiers plans pricing consulting upgrade who gets this private channel" });
  }
  if (has("appearance")) {
    top.push({ kind: "pane", pane: "appearance", label: "Appearance", icon: <Palette {...ICON} />, keywords: "theme colours colors fonts look design customize brand" });
  }
  const groups: SettingsNavGroup[] = [{ label: null, items: top }];
  if (params.workflowsPath && has("agent")) {
    const at = (section: string) => `${params.workflowsPath}?section=${section}`;
    groups.push({
      label: "Automation",
      items: [
        { kind: "link", id: "welcome", label: "Welcome page", icon: <DoorOpen {...ICON} />, path: at("welcome"), keywords: "onboarding new members first steps" },
        { kind: "link", id: "workflows", label: "Workflows", icon: <Workflow {...ICON} />, path: at("workflows"), keywords: "automation stages rules" },
        { kind: "link", id: "forms", label: "Forms", icon: <ClipboardList {...ICON} />, path: at("forms"), keywords: "questions survey application quiz" },
      ],
    });
  }
  if (has("access")) {
    const members: SettingsNavItem[] = [];
    if (params.peoplePath) {
      members.push({ kind: "link", id: "clients", label: "Members", icon: <Users {...ICON} />, path: params.peoplePath, keywords: "members clients people progress plan database views properties message" });
    }
    if (has("creators")) {
      members.push({ kind: "pane", pane: "creators", label: "Creators", icon: <UserPlus {...ICON} />, keywords: "co-creator co-owner collaborator partner team admin" });
    }
    members.push({ kind: "pane", pane: "access", label: "Access", icon: <KeyRound {...ICON} />, keywords: "entitlement license key mcp integration webhook api trial comp grant connected services" });
    groups.push({ label: "Members", items: members });
  }
  if (has("agent")) {
    groups.push({ label: "Agent", items: [{ kind: "pane", pane: "agent", label: "Agent", icon: <span className="pn-settings-nav-agent-icon"><CommunityAgentIcon size={ICON.size} strokeWidth={ICON.strokeWidth} /></span>, keywords: "ai assistant model prompt" }] });
  }
  if (has("danger")) {
    groups.push({ label: "Advanced", items: [{ kind: "pane", pane: "danger", label: "Archive", icon: <TriangleAlert {...ICON} />, keywords: "danger delete archive close" }] });
  }
  return groups.filter((group) => group.items.length > 0);
}

type Match = { key: string; label: string; context: string | null; onSelect: () => void };

export function WebCommunitySettingsNav(props: {
  groups: SettingsNavGroup[];
  activePane: CommunitySettingsPane;
  onSelectPane: (pane: CommunitySettingsPane) => void;
  onSelectAnchor: (anchorId: string) => void;
  onOpenLink: (path: string) => void;
  /** Channels: Settings takes the community menu's place, so it leads with a way back. */
  back?: { label: string; onBack: () => void } | null;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const matches = useMemo<Match[]>(() => {
    if (!needle) return [];
    const found: Match[] = [];
    const hit = (...texts: (string | undefined)[]) => texts.some((text) => text?.toLowerCase().includes(needle));
    for (const group of props.groups) {
      for (const item of group.items) {
        if (item.kind === "link") {
          if (hit(item.label, item.keywords)) found.push({ key: item.id, label: item.label, context: group.label, onSelect: () => props.onOpenLink(item.path) });
          continue;
        }
        if (hit(item.label, item.keywords)) found.push({ key: item.pane, label: item.label, context: group.label, onSelect: () => props.onSelectPane(item.pane) });
        for (const anchor of item.anchors ?? []) {
          if (hit(anchor.label, anchor.keywords)) {
            found.push({ key: anchor.id, label: anchor.label, context: item.label, onSelect: () => props.onSelectAnchor(anchor.id) });
          }
        }
      }
    }
    return found;
  }, [needle, props.groups, props.onOpenLink, props.onSelectAnchor, props.onSelectPane]);

  return (
    <nav className="pn-settings-nav" aria-label="Settings">
      {props.back ? (
        <button type="button" className="pn-settings-nav-back" onClick={props.back.onBack}>
          <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
          <span>{props.back.label}</span>
        </button>
      ) : null}
      <label className="pn-settings-search">
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search settings"
          aria-label="Search settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
            if (event.key === "Enter" && matches[0]) {
              matches[0].onSelect();
              setQuery("");
            }
          }}
        />
        {query ? (
          <button type="button" className="pn-settings-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </label>
      {needle ? (
        <div className="pn-settings-nav-results" role="list">
          {matches.length === 0 ? (
            <p className="pn-settings-nav-empty">No settings match “{query.trim()}”.</p>
          ) : (
            matches.map((match) => (
              <button
                key={match.key}
                type="button"
                role="listitem"
                className="pn-settings-nav-item is-result"
                onClick={() => {
                  match.onSelect();
                  setQuery("");
                }}
              >
                <span>{match.label}</span>
                {match.context ? <small>{match.context}</small> : null}
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="pn-settings-nav-list">
        {props.groups.map((group, index) => (
          <div className="pn-settings-nav-group" key={group.label ?? `top-${index}`}>
            {group.label ? <div className="pn-settings-nav-label">{group.label}</div> : null}
            {group.items.map((item) =>
              item.kind === "link" ? (
                <button key={item.id} type="button" className="pn-settings-nav-item" onClick={() => props.onOpenLink(item.path)}>
                  {item.icon}
                  <span>{item.label}</span>
                  <ArrowUpRight className="pn-settings-nav-out" size={14} strokeWidth={2} aria-label="Opens in another section" />
                </button>
              ) : (
                <div key={item.pane} className="pn-settings-nav-entry">
                  <button
                    type="button"
                    className={`pn-settings-nav-item${props.activePane === item.pane ? " is-active" : ""}`}
                    aria-current={props.activePane === item.pane ? "page" : undefined}
                    onClick={() => props.onSelectPane(item.pane)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                  {item.anchors && props.activePane === item.pane ? (
                    <div className="pn-settings-nav-children">
                      {item.anchors.map((anchor) => (
                        <button key={anchor.id} type="button" className="pn-settings-nav-child" onClick={() => props.onSelectAnchor(anchor.id)}>
                          {anchor.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        ))}
        </div>
      )}
    </nav>
  );
}
