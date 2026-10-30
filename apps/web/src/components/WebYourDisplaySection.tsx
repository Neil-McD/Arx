import { useEffect, useState } from "react";
import { Check, Moon, Sun, type LucideIcon } from "lucide-react";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { DEFAULT_COMMUNITY_THEME, type CommunityThemeColors, type CommunityThemeScheme, type CommunityThemeV1 } from "../../../../shared/communityTheme";
import { fetchCloudPublishedCommunityTheme } from "../../../../shared/cloudCommunityThemeGateway";
import { communityThemeWithBothSchemes } from "../../../../shared/communityThemePalettes";
import { listCloudCommunityMembershipRows } from "../../../../shared/cloudCommunityMembershipGateway";
import type { AppTheme } from "../../../../shared/theme";
import { WebSettingsFold } from "./WebSettingsFold";
import { setMemberPickEverywhere, useMemberPickEverywhere } from "../controllers/communityLookPreference";

type Community = {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

// How a community's design meets the member's pick: made in both versions, or
// made in one (the owner's default), where the member sees its twin.
type Look = { kind: "both" | "one"; scheme?: CommunityThemeScheme; theme: CommunityThemeV1 | null };

const MODES: { scheme: CommunityThemeScheme; label: string; icon: LucideIcon }[] = [
  { scheme: "light", label: "Light", icon: Sun },
  { scheme: "dark", label: "Dark", icon: Moon },
];

// The most communities whose looks the page reads.
const LOOK_CHECK_LIMIT = 40;

function lookOf(theme: CommunityThemeV1 | null): Look {
  if (!theme || (theme.schemes.light && theme.schemes.dark)) return { kind: "both", theme };
  return { kind: "one", scheme: theme.schemes.dark ? "dark" : "light", theme: communityThemeWithBothSchemes(theme) };
}

function colorsFor(theme: CommunityThemeV1 | null, scheme: CommunityThemeScheme): CommunityThemeColors {
  return theme?.schemes[scheme] ?? (DEFAULT_COMMUNITY_THEME.schemes[scheme] as CommunityThemeColors);
}

// "Builders' design", "Club's design".
function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}'s`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

// A small page in the design's colours: a bar, a card with text, a button.
function DesignSample(props: { colors: CommunityThemeColors; size?: "large" | "small" }) {
  const c = props.colors;
  return (
    <span className={`pn-display-sample${props.size === "small" ? " is-small" : ""}`} style={{ background: c.background, borderColor: c.border }} aria-hidden="true">
      <span className="pn-display-sample-bar" style={{ background: c.surface, borderColor: c.border }}>
        <i style={{ background: c.accent }} />
      </span>
      <span className="pn-display-sample-card" style={{ background: c.surface, borderColor: c.border }}>
        <i style={{ background: c.text }} />
        <i style={{ background: c.muted }} />
        <b style={{ background: c.button }} />
      </span>
    </span>
  );
}

// Your settings > Display: Light or Dark, shown in the design of the
// community you came from, then how each of your communities takes the pick.
// A design with both versions follows it; one with a single version is the
// owner's default; picking the other shows its twin, for this member only.
export function WebYourDisplaySection<SessionT>(props: {
  session: SessionT | null;
  appTheme: AppTheme;
  setAppTheme: (value: AppTheme) => void;
  community: { id: string; name: string } | null;
}) {
  const [activeTheme, setActiveTheme] = useState<{ id: string; theme: CommunityThemeV1 | null } | null>(null);
  const [looks, setLooks] = useState<Array<{ community: Community; look: Look }> | null>(null);
  const activeId = props.community?.id ?? null;

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    fetchCloudPublishedCommunityTheme({ communityId: activeId })
      .then((theme) => { if (alive) setActiveTheme({ id: activeId, theme }); })
      .catch(() => { if (alive) setActiveTheme({ id: activeId, theme: null }); });
    return () => { alive = false; };
  }, [activeId]);

  useEffect(() => {
    if (!props.session) return;
    let alive = true;
    listCloudCommunityMembershipRows<SessionT, Community>({ session: props.session })
      .then(async (rows) => {
        const communities = rows.map((row) => row.communities).filter(Boolean).slice(0, LOOK_CHECK_LIMIT);
        const themes = await Promise.all(communities.map((community) =>
          fetchCloudPublishedCommunityTheme({ communityId: community.id }).catch(() => null)));
        if (alive) setLooks(communities.map((community, index) => ({ community, look: lookOf(themes[index] ?? null) })));
      })
      .catch(() => { if (alive) setLooks([]); });
    return () => { alive = false; };
  }, [props.session]);

  const shownTheme = activeId && activeTheme?.id === activeId ? activeTheme.theme : null;
  const activeLook = lookOf(shownTheme);
  const designName = props.community ? `${possessive(props.community.name)} design` : "Polynet's design";
  const everywhere = useMemberPickEverywhere();
  const madeIn = props.community && activeLook.kind === "one" ? activeLook.scheme : null;
  const oneCount = (looks ?? []).filter((entry) => entry.look.kind === "one").length;

  return (
    <>
      <section className="settings-section pn-settings-card pn-your-display" aria-labelledby="your-display-title">
        <header className="pn-settings-card-header">
          <h2 className="settings-section-title" id="your-display-title">Light or dark</h2>
          <p className="settings-section-desc">
            How pages look for you on this device, in every community made in light and dark.
          </p>
        </header>
        <div className="pn-settings-card-body pn-display-modes" role="radiogroup" aria-label="Light or dark">
          {MODES.map((mode) => {
            const selected = props.appTheme === mode.scheme;
            const Icon = mode.icon;
            return (
              <button
                key={mode.scheme}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`pn-settings-mode pn-display-mode${selected ? " is-selected" : ""}`}
                onClick={() => {
                  setMemberPickEverywhere(true);
                  props.setAppTheme(mode.scheme);
                }}
              >
                <DesignSample colors={colorsFor(activeLook.theme, mode.scheme)} />
                <span className="pn-display-mode-label">
                  <Icon size={16} aria-hidden="true" />
                  {mode.label}
                  {selected ? <Check className="pn-display-mode-check" size={16} aria-hidden="true" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="pn-settings-note pn-display-note">
          {madeIn
            ? `Shown in ${designName}, which its owner made ${madeIn}.`
            : `Shown in ${designName}.`}
        </p>
        <div className="pn-settings-row pn-display-everywhere">
          <div className="pn-settings-row-head">
            <div className="pn-settings-row-text">
              <span className="pn-settings-label">Use my pick in every community</span>
              <span className="pn-settings-help">
                Some communities are made only light or only dark. With this on, you see a matching version in your pick. Only you see the change.
              </span>
            </div>
            <div className="pn-settings-row-control">
              <button
                type="button"
                role="switch"
                aria-checked={everywhere}
                aria-label="Use my pick in every community"
                className={`pn-settings-switch${everywhere ? " is-on" : ""}`}
                onClick={() => setMemberPickEverywhere(!everywhere)}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>
      {looks && looks.length > 0 ? (
        <WebSettingsFold
          id="display-communities"
          title="In your communities"
          summary={oneCount === 0
            ? "Every community follows your pick"
            : everywhere ? `All follow your pick; ${oneCount} with a matched version` : `${oneCount} shown as made, the rest follow your pick`}
        >
          {looks.map(({ community, look }) => (
            <div key={community.id} className="pn-your-membership pn-display-community">
              <UserAvatar
                className="pn-your-membership-avatar"
                readyClassName="has-image"
                imageClassName="pn-your-membership-avatar-image"
                fallbackClassName="pn-your-membership-avatar-fallback"
                name={community.name}
                imageUrl={community.avatar_url ?? null}
                focusX={community.avatar_focus_x ?? 0.5}
                focusY={community.avatar_focus_y ?? 0.5}
                zoom={community.avatar_zoom ?? 1}
                fallback={<span>{initials(community.name)}</span>}
                alt=""
                aria-hidden={true}
              />
              <span className="pn-your-membership-text">
                <strong>{community.name}</strong>
                <small>{look.kind === "both" ? "Light and dark" : everywhere ? `Made ${look.scheme}, ${look.scheme === "light" ? "dark" : "light"} matched` : `Made ${look.scheme}, shown as made`}</small>
              </span>
              <span className="pn-display-community-samples">
                {MODES.filter((mode) => look.kind === "both" || everywhere || mode.scheme === look.scheme)
                  .map((mode) => <DesignSample key={mode.scheme} size="small" colors={colorsFor(look.theme, mode.scheme)} />)}
              </span>
            </div>
          ))}
        </WebSettingsFold>
      ) : null}
    </>
  );
}
