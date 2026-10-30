import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, GraduationCap, MessagesSquare, Monitor, MoreHorizontal, Palette, Smartphone, type LucideIcon } from "lucide-react";
import {
  compileCommunityThemeCss,
  communityTextLevels,
  communityThemeFontStylesheetUrl,
  contrastRatio,
  COMMUNITY_THEME_FONTS,
  DEFAULT_COMMUNITY_THEME,
  normalizeCommunityTheme,
  type CommunityThemeColors,
  type CommunityThemeProblem,
  type CommunityThemeScheme,
  type CommunityThemeV1,
} from "../../../../shared/communityTheme";
import { COMMUNITY_THEME_PRESETS, type CommunityThemePreset } from "../../../../shared/communityThemePresets";
import { COURSE_CARD_LOOKS, matchingCourseCardLook, type CourseCardLook } from "../../../../shared/communityCourseCardLooks";
import {
  applyCommunityThemePalette,
  COMMUNITY_THEME_PALETTES,
  communityThemeTwinColors,
  matchingCommunityThemePalette,
  type CommunityThemePalette,
} from "../../../../shared/communityThemePalettes";
import {
  discardCloudCommunityThemeDraft,
  fetchCloudCommunityThemeDraft,
  publishCloudCommunityThemeDraft,
  saveCloudCommunityThemeDraft,
  deleteCloudCommunitySavedTheme,
  fetchCloudCommunitySavedThemes,
  renameCloudCommunitySavedTheme,
  saveCloudCommunitySavedTheme,
  type CommunitySavedTheme,
  type CommunityThemeDraftState,
} from "../../../../shared/cloudCommunityThemeGateway";
import {
  APPEARANCE_PREVIEW_PARAM,
  APPEARANCE_PREVIEW_READY_MESSAGE,
  APPEARANCE_PREVIEW_THEME_MESSAGE,
  COMMUNITY_THEME_PUBLISHED_EVENT,
} from "../controllers/useWebCommunityThemeStyle";
import "./WebCommunityAppearanceSettings.css";

// hasBanner: the community has a banner image, so the side column prints its name over it.
type Props = { communityId: string; communitySlug: string | null; hasBanner?: boolean; session: unknown; ensureSession: (session: any) => Promise<any | null> };

const PREVIEW_SCOPE = "look-preview";
// The width the Desktop preview lays the community out at before scaling it to fit.
const DESKTOP_PREVIEW_WIDTH = 1280;
const MIN_PREVIEW_SCALE = 0.6;
const CUSTOMIZE_HASH = "#customize";
const TEXT_FONTS = Object.entries(COMMUNITY_THEME_FONTS).filter(([, font]) => font.role === "text").map(([name]) => name);
const HEADING_FONTS = Object.entries(COMMUNITY_THEME_FONTS).filter(([, font]) => font.role !== "mono").map(([name]) => name);
const COLOR_FIELDS: [keyof CommunityThemeColors, string][] = [
  ["background", "Background"], ["surface", "Cards"], ["text", "Text"], ["muted", "Secondary text"],
  ["border", "Borders"], ["accent", "Accent"], ["on_accent", "Text on accent"], ["button", "Buttons"], ["on_button", "Button text"],
];
type ChoiceKey = "heading_case" | "numerals" | "corner_style" | "shadow" | "density" | "button_shape" | "course_cover_ratio" | "course_card_size" | "course_columns" | "course_columns_phone" | "course_gap" | "course_card_style" | "course_card_pills" | "course_card_description" | "course_card_progress" | "course_card_edge" | "course_card_panel" | "course_cover_plate" | "course_cover_fit" | "media_plate" | "banner_name" | "channels_look" | "rail_size" | "rail_color" | "sibling_communities" | "pods_place" | "classroom_chat" | "edges";
const CHOICES: Record<ChoiceKey, [string, [string, string][]]> = {
  heading_case: ["Heading case", [["none", "As typed"], ["upper", "UPPERCASE"]]],
  numerals: ["Numbers", [["proportional", "Natural"], ["tabular", "Even width (for tables)"]]],
  corner_style: ["Corner style", [["even", "Even"], ["sketch", "Hand-drawn"]]],
  shadow: ["Shadows", [["none", "None"], ["soft", "Soft"], ["hard", "Hard"]]],
  density: ["Spacing", [["compact", "Compact"], ["comfortable", "Comfortable"], ["roomy", "Roomy"]]],
  button_shape: ["Buttons", [["rounded", "Rounded"], ["pill", "Pill"], ["square", "Square"], ["sketch", "Sketch"]]],
  course_cover_ratio: ["Cover shape", [["auto", "Polynet default"], ["16:9", "Wide 16:9"], ["3:2", "Photo 3:2"], ["4:3", "Classic 4:3"], ["1:1", "Square"], ["21:9", "Banner 21:9"]]],
  course_card_size: ["Card size", [["default", "Page style's own"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"]]],
  course_columns: ["Cards per row", [["auto", "Fit to screen"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]],
  course_columns_phone: ["Cards per row on phones", [["1", "1"], ["2", "2"]]],
  course_gap: ["Space between cards", [["default", "Page style's own"], ["tight", "Tight"], ["roomy", "Roomy"]]],
  course_card_style: ["Card style", [["classroom", "Classroom card"], ["cover", "Cover on top"], ["list", "List row"], ["overlay", "Title on cover"], ["text", "Text only"]]],
  course_card_pills: ["Pills", [["hide", "Off"], ["show", "Lessons and status"]]],
  course_card_description: ["Description", [["show", "Show"], ["hide", "Hide"]]],
  course_card_progress: ["Progress", [["bar", "Bar"], ["ring", "Ring"], ["fraction", "3/6 lessons"]]],
  course_card_edge: ["Card edge", [["border", "Border"], ["shadow", "Soft shadow"], ["none", "None (open)"]]],
  course_card_panel: ["Text panel colour", [["shade", "Shaded (a step from the card)"], ["tint", "Soft tint"], ["accent", "Accent wash"], ["plain", "Same as the card"], ["custom", "Custom colour"]]],
  course_cover_plate: ["Cover background (light scheme)", [["none", "Plain"], ["tint", "Soft accent tint"]]],
  course_cover_fit: ["Cover pictures", [["crop", "Fill the box"], ["whole", "Show whole picture"]]],
  media_plate: ["White images (dark scheme)", [["none", "As they are"], ["light", "On a light plate"]]],
  banner_name: ["Name on the banner", [["show", "Show it"], ["hide", "Hide it"]]],
  channels_look: ["Page style", [["current", "Polynet (today)"], ["quiet", "Quiet: plain menu, one column"], ["reader", "Reader: reading column, post lists"], ["publication", "Publication: masthead, editorial cards"]]],
  sibling_communities: ["Your other communities", [["hide", "Hidden"], ["show", "Show them under members"]]],
  edges: ["Edges (light)", [["soft", "Soft (faint lines)"], ["sharp", "Sharper lines"], ["clean", "Clean white"], ["framed", "Framed panels"]]],
  classroom_chat: ["Classroom's Community tab", [["posts", "Post cards (default)"], ["chat", "A chat"]]],
  pods_place: ["Where pods show", [["aside", "Top of the right column"], ["header", "In the header"], ["tab", "As a tab after Community"]]],
  rail_size: ["Icon size", [["standard", "Standard"], ["large", "Bigger"]]],
  rail_color: ["Colour", [["polynet", "Polynet (today)"], ["blend", "Blend with the page"], ["tint", "Soft brand tint"], ["brand", "Solid brand colour"]]],
};
// The community pages the preview can show, by their tab in the address.
const PREVIEW_PAGES: [string, string][] = [["chat", "Chat"], ["resources", "Courses"], ["events", "Events"]];
const PAGE_ICONS: Record<string, LucideIcon> = { chat: MessagesSquare, resources: GraduationCap, events: CalendarDays };
type SchemeMode = "light" | "dark" | "both";
const SCHEME_MODES: [SchemeMode, string][] = [["light", "Always light"], ["dark", "Always dark"], ["both", "Member chooses"]];

function problemText(error: unknown): CommunityThemeProblem[] | string {
  const data = (error as { data?: { code?: string; problems?: CommunityThemeProblem[] } })?.data;
  if (data?.problems?.length) return data.problems;
  if (data?.code === "community_theme_revision_conflict") return "The look changed in another session. Reload to continue.";
  return "Could not save. Your changes are still here. Try again.";
}

// White or near-black, whichever reads better on `fill`.
function readableOn(fill: string): string {
  return contrastRatio("#FFFFFF", fill) >= contrastRatio("#0B0B0B", fill) ? "#FFFFFF" : "#0B0B0B";
}

function schemeMode(theme: CommunityThemeV1): SchemeMode {
  if (theme.schemes.light && theme.schemes.dark) return "both";
  return theme.schemes.dark ? "dark" : "light";
}

// The theme with only one scheme, so a preview shows it whatever the app is in.
function withOneScheme(theme: CommunityThemeV1, scheme: CommunityThemeScheme): CommunityThemeV1 {
  const colors = theme.schemes[scheme];
  return colors ? { ...theme, schemes: { [scheme]: colors } } : theme;
}

function Swatches(props: { colors: CommunityThemeColors | undefined }) {
  if (!props.colors) return null;
  const keys: (keyof CommunityThemeColors)[] = ["background", "surface", "text", "accent", "button"];
  return <span className="appearance-swatches" aria-hidden="true">{keys.map((key) => <span key={key} style={{ background: props.colors?.[key] }} />)}</span>;
}

// The starting point the theme still matches exactly, if any.
function matchingPreset(theme: CommunityThemeV1): CommunityThemePreset | null {
  return COMMUNITY_THEME_PRESETS.find((preset) => JSON.stringify(preset.theme) === JSON.stringify(theme)) ?? null;
}

function sameLook(a: CommunityThemeV1 | null, b: CommunityThemeV1 | null) {
  return Boolean(a && b) && JSON.stringify(a) === JSON.stringify(b);
}

function savedThemeProblem(error: unknown): string {
  const code = (error as { data?: { code?: string } })?.data?.code;
  if (code === "saved_theme_name_taken") return "You already have a saved theme with that name.";
  if (code === "saved_theme_name_required") return "Give the theme a name.";
  if (code === "saved_theme_name_too_long") return "Keep the name under 60 characters.";
  if (code === "saved_theme_limit") return "You can keep up to 50 saved themes. Delete one to save another.";
  if (code === "saved_theme_not_found") return "That saved theme was deleted in another session.";
  if (code === "community_theme_invalid") return "Fix the problems listed below before saving this look.";
  return "Could not save the theme list. Try again.";
}

// A label on the left with a muted line of help under it, Substack's settings row.
function Fact(props: { label: string; help: string; children: ReactNode }) {
  return <div className="appearance-fact">
    <dt><span className="appearance-label">{props.label}</span><span className="appearance-help">{props.help}</span></dt>
    <dd>{props.children}</dd>
  </div>;
}

// The owner's fonts, sizing and colours, kept as a draft until published. The
// pane sums up the look; Customize opens a full-screen editor beside the real
// community, like a website builder. The same draft the CLI and agents edit.
export function WebCommunityAppearanceSettings(props: Props) {
  const [state, setState] = useState<CommunityThemeDraftState | null>(null);
  const [theme, setTheme] = useState<CommunityThemeV1 | null>(null);
  const [scheme, setScheme] = useState<CommunityThemeScheme>("light");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CommunityThemeProblem[] | string | null>(null);
  const [reload, setReload] = useState(0);
  const [savedThemes, setSavedThemes] = useState<CommunitySavedTheme[]>([]);
  const [savedBusy, setSavedBusy] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(() => typeof window !== "undefined" && window.location.hash === CUSTOMIZE_HASH);
  const customizeButton = useRef<HTMLButtonElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const uid = useId();
  const alive = useRef(true);
  // Set in the body too: StrictMode's dev double-mount runs the cleanup once,
  // which would otherwise leave every save and publish stuck on "Saving…".
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const run = async <T,>(operation: (session: unknown) => Promise<T>) => {
    const session = await props.ensureSession(props.session);
    if (!session) throw new Error("auth_session_required");
    return operation(session);
  };
  useEffect(() => {
    let active = true;
    setError(null);
    run((session) => fetchCloudCommunityThemeDraft({ session, communityId: props.communityId }))
      .then((loaded) => {
        if (!active) return;
        setState(loaded); setTheme(loaded.draft);
        setScheme(loaded.draft.schemes.light ? "light" : "dark");
      })
      .catch(() => { if (active) setError("Could not load this community's look."); });
    // The saved list is extra: if it fails to load, the editor still works.
    run((session) => fetchCloudCommunitySavedThemes({ session, communityId: props.communityId }))
      .then((list) => { if (active) setSavedThemes(list); })
      .catch(() => { if (active) setSavedError("Could not load your saved themes."); });
    return () => { active = false; };
  }, [props.communityId, reload]);

  // The address says when the editor is open, so it can be linked to directly.
  const openCustomize = (open: boolean) => {
    setCustomizing(open);
    const url = new URL(window.location.href);
    url.hash = open ? CUSTOMIZE_HASH : "";
    window.history.replaceState(window.history.state, "", url.toString());
    if (!open) window.requestAnimationFrame(() => customizeButton.current?.focus());
  };

  const check = useMemo(() => (theme ? normalizeCommunityTheme(theme) : null), [theme]);
  // Previews show the scheme being edited, whatever the app is in now.
  const previewTheme = useMemo(() => (check?.ok ? withOneScheme(check.theme, scheme) : null), [check, scheme]);
  const previewCss = useMemo(() => (previewTheme ? compileCommunityThemeCss(previewTheme, `[data-community-theme="${PREVIEW_SCOPE}"]`) : ""), [previewTheme]);
  const fontUrl = check?.ok ? communityThemeFontStylesheetUrl(check.theme) : null;
  const dirty = Boolean(state && theme && JSON.stringify(state.draft) !== JSON.stringify(theme));

  if (!theme || !state) {
    return <div className="settings-section">{typeof error === "string" ? <p role="alert">{error} <button className="secondary" type="button" onClick={() => setReload((n) => n + 1)}>Retry</button></p> : <p role="status">Loading…</p>}</div>;
  }
  const set = (change: Partial<CommunityThemeV1>) => { setError(null); setTheme({ ...theme, ...change }); };
  const act = async (operation: () => Promise<CommunityThemeDraftState>, published = false) => {
    setBusy(true); setError(null);
    try {
      const next = await operation();
      if (!alive.current) return;
      setState(next); setTheme(next.draft);
      if (published) window.dispatchEvent(new CustomEvent(COMMUNITY_THEME_PUBLISHED_EVENT, { detail: { communityId: props.communityId } }));
    } catch (caught) {
      if (alive.current) setError(problemText(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const save = () => act(() => run((session) => saveCloudCommunityThemeDraft({ session, communityId: props.communityId, expectedDraftRevision: state.draftRevision, theme })));
  const publish = () => act(async () => {
    const saved = dirty ? await run((session) => saveCloudCommunityThemeDraft({ session, communityId: props.communityId, expectedDraftRevision: state.draftRevision, theme })) : state;
    // Keep the saved draft even if publishing then fails, so a retry publishes
    // this revision instead of saving again against the old one.
    if (dirty && alive.current) { setState(saved); setTheme(saved.draft); }
    return run((session) => publishCloudCommunityThemeDraft({ session, communityId: props.communityId, expectedDraftRevision: saved.draftRevision }));
  }, true);
  // Saved themes change only the list; the draft stays as it is.
  const savedAct = async (operation: (session: unknown) => Promise<CommunitySavedTheme[]>) => {
    setSavedBusy(true); setSavedError(null);
    try {
      const next = await run(operation);
      if (alive.current) setSavedThemes(next);
      return true;
    } catch (caught) {
      if (alive.current) setSavedError(savedThemeProblem(caught));
      return false;
    } finally {
      if (alive.current) setSavedBusy(false);
    }
  };
  const savedActions: SavedThemeActions = {
    saveAs: (name) => savedAct(async (session) => (await saveCloudCommunitySavedTheme({ session, communityId: props.communityId, name, theme })).savedThemes),
    replace: (saved) => savedAct(async (session) => (await saveCloudCommunitySavedTheme({ session, communityId: props.communityId, savedThemeId: saved.savedThemeId, theme })).savedThemes),
    rename: (saved, name) => savedAct((session) => renameCloudCommunitySavedTheme({ session, communityId: props.communityId, savedThemeId: saved.savedThemeId, name })),
    remove: (saved) => savedAct((session) => deleteCloudCommunitySavedTheme({ session, communityId: props.communityId, savedThemeId: saved.savedThemeId })),
  };
  const discard = () => act(() => run((session) => discardCloudCommunityThemeDraft({ session, communityId: props.communityId, expectedDraftRevision: state.draftRevision })));
  const undoOrDiscard = () => { if (dirty) setTheme(state.draft); else void discard(); };
  const problems = check && !check.ok ? check.problems : Array.isArray(error) ? error : [];
  const statusText = busy ? "Working…" : dirty ? "Unsaved changes" : state.hasUnpublishedChanges ? "Draft saved · not published" : state.published ? "Published" : "Polynet default";
  // The dot beside the status: green once published, amber while members can't see the changes yet.
  const statusTone = busy ? "busy" : dirty || state.hasUnpublishedChanges ? "draft" : state.published ? "live" : "default";
  const status = <span className={`appearance-status is-${statusTone}`} role="status"><i aria-hidden="true" />{statusText}</span>;

  const problemList = <div role="status">{problems.length ? <ul className="auth-error community-look-problems">{problems.map((problem, i) => <li key={i} id={`${uid}-problem-${i}`}>{problem.message}{problem.suggestion ? ` Try ${problem.suggestion}.` : ""}</li>)}</ul> : null}</div>;
  const errorLine = typeof error === "string" ? <div className="auth-error" role="alert">{error}</div> : null;
  const actions = <>
    <button className="appearance-button" type="button" disabled={busy || (!dirty && !state.hasUnpublishedChanges)} onClick={undoOrDiscard}>{dirty ? "Undo changes" : "Discard draft"}</button>
    <button className="appearance-button" type="button" disabled={busy || !dirty || !check?.ok} onClick={() => void save()}>Save draft</button>
    <button className="appearance-button is-primary" type="button" disabled={busy || !check?.ok || (!dirty && !state.hasUnpublishedChanges)} onClick={() => void publish()}>Publish</button>
  </>;
  const shown = check?.ok ? check.theme : theme;
  const preset = matchingPreset(shown);
  const savedMatch = savedThemes.find((saved) => sameLook(saved.theme, shown)) ?? null;
  const palette = matchingCommunityThemePalette(shown);
  const mode = schemeMode(shown);

  const hasDraft = dirty || state.hasUnpublishedChanges;
  // Like Substack's Settings → Website: a card that sums up the look and links
  // out to the visual editor instead of repeating its controls here.
  return <div ref={pane} className="settings-section community-look appearance-pane">
    <style>{previewCss}</style>
    {fontUrl ? <link rel="stylesheet" href={fontUrl} /> : null}
    <section className="appearance-card" aria-labelledby={`${uid}-title`}>
      <header className="appearance-card-header">
        <h2 id={`${uid}-title`}>Look and feel</h2>
        <p>The colours, fonts and shapes members see across your community.</p>
      </header>
      <div className="appearance-callout">
        <span className="appearance-callout-icon" aria-hidden="true"><Palette size={20} /></span>
        <div className="appearance-callout-text">
          <strong>Customize your community</strong>
          <small>Change the look beside a live preview. Members see it once you publish.</small>
        </div>
        <button ref={customizeButton} className="appearance-button is-primary" type="button" onClick={() => openCustomize(true)}>
          Customize <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
      <dl className="appearance-facts">
        <Fact label="Theme" help="A starting point or a theme you saved">{preset ? preset.name : savedMatch ? savedMatch.name : "Your own look"}</Fact>
        <Fact label="Colours" help={[palette?.name, SCHEME_MODES.find(([key]) => key === mode)?.[1]].filter(Boolean).join(" · ")}>
          {(["light", "dark"] as const).filter((key) => shown.schemes[key]).map((key) => <span key={key} className="appearance-summary-scheme"><Swatches colors={shown.schemes[key]} />{key === "light" ? "Light" : "Dark"}</span>)}
        </Fact>
        <Fact label="Fonts" help="Headings and body text">{shown.font_heading === shown.font_body ? shown.font_body : `${shown.font_heading} and ${shown.font_body}`}</Fact>
        <Fact label="Status" help="Members see only what you publish">{status}</Fact>
      </dl>
      {customizing ? null : <>{problemList}{errorLine}</>}
      {!customizing && hasDraft ? <footer className="appearance-card-footer">
        <span className="appearance-help">{dirty ? "You have changes that aren't saved." : "Members don't see your draft yet."}</span>
        <div className="appearance-actions">{actions}</div>
      </footer> : null}
    </section>
    {customizing ? <AppearanceEditor
      theme={theme} scheme={scheme} setScheme={setScheme} set={set} busy={busy} problems={problems} uid={uid}
      canSave={Boolean(check?.ok)} savedThemes={savedThemes} savedBusy={savedBusy} savedError={savedError} savedActions={savedActions}
      previewTheme={previewTheme} communityId={props.communityId} communitySlug={props.communitySlug} hasBanner={Boolean(props.hasBanner)} pane={pane}
      status={status} actions={actions} footer={<>{problemList}{errorLine}</>}
      onClose={() => openCustomize(false)}
    /> : null}
  </div>;
}

function SampleContent() {
  return <div className="community-look-sample">
    <small>Preview</small>
    <h2>Build your first AI employee</h2>
    <p>Lessons, check-ins and your community in one place. This is how text reads at the size you picked.</p>
    <div className="community-look-card"><strong>Module 1 · Foundations</strong><span>3 of 5 lessons done</span></div>
    <button type="button" className="settings-primary-action" tabIndex={-1}>Continue lesson</button>
  </div>;
}

type SavedThemeActions = {
  saveAs: (name: string) => Promise<boolean>;
  replace: (saved: CommunitySavedTheme) => Promise<boolean>;
  rename: (saved: CommunitySavedTheme, name: string) => Promise<boolean>;
  remove: (saved: CommunitySavedTheme) => Promise<boolean>;
};

type EditorProps = {
  theme: CommunityThemeV1;
  // The draft in the editor passes the theme rules, so it can be saved under a name.
  canSave: boolean;
  savedThemes: CommunitySavedTheme[];
  savedBusy: boolean;
  savedError: string | null;
  savedActions: SavedThemeActions;
  scheme: CommunityThemeScheme;
  setScheme: (scheme: CommunityThemeScheme) => void;
  set: (change: Partial<CommunityThemeV1>) => void;
  busy: boolean;
  problems: CommunityThemeProblem[];
  uid: string;
  previewTheme: CommunityThemeV1 | null;
  communityId: string;
  communitySlug: string | null;
  hasBanner: boolean;
  // The Settings pane the editor opened from: the editor wears the same community colours.
  pane: { current: HTMLElement | null };
  status: ReactNode;
  actions: ReactNode;
  footer: ReactNode;
  onClose: () => void;
};

// A group of inspector rows under a small uppercase label, like Substack's
// website editor: label on the left, control on the right.
function Group(props: { title: string; children: ReactNode }) {
  const id = useId();
  return <section className="appearance-group" aria-labelledby={id}>
    <h3 id={id}>{props.title}</h3>
    {props.children}
  </section>;
}

// One band of the inspector: the selected page's own settings, or the
// site-wide look every page shares.
function InspectorScope(props: { title: string; hint: string; children: ReactNode }) {
  const id = useId();
  return <section className="appearance-scope" aria-labelledby={id}>
    <header className="appearance-scope-head"><h3 id={id}>{props.title}</h3><p>{props.hint}</p></header>
    {props.children}
  </section>;
}

function Row(props: { label: ReactNode; htmlFor?: string; children: ReactNode; wide?: boolean }) {
  return <div className={`appearance-row${props.wide ? " is-wide" : ""}`}>
    {props.htmlFor ? <label htmlFor={props.htmlFor}>{props.label}</label> : <span>{props.label}</span>}
    <div className="appearance-row-control">{props.children}</div>
  </div>;
}

const HEX = /^#?[0-9a-f]{6}$/i;

// A colour as Substack shows it: a swatch that opens the picker, and the hex.
function ColorField(props: { id: string; label: string; value: string; disabled: boolean; describedBy?: string; invalid?: boolean; onChange: (value: string) => void }) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const commit = () => {
    if (HEX.test(text.trim())) props.onChange(`#${text.trim().replace("#", "")}`.toUpperCase());
    else setText(props.value);
  };
  return <span className="appearance-color">
    <input type="color" aria-label={`${props.label} colour picker`} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value.toUpperCase())} />
    <input id={props.id} type="text" inputMode="text" spellCheck={false} maxLength={7} value={text} disabled={props.disabled}
      aria-invalid={props.invalid || undefined} aria-describedby={props.describedBy}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
  </span>;
}

// Starting points as a two-line list (name and what it is), with a check on
// the one the draft matches.
function PresetPicker(props: { theme: CommunityThemeV1; disabled: boolean; onPick: (preset: CommunityThemePreset) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = matchingPreset(props.theme);
  useEffect(() => { if (open) list.current?.focus(); }, [open]);
  const pick = (preset: CommunityThemePreset) => { props.onPick(preset); setOpen(false); button.current?.focus(); };
  return <div className="appearance-preset-picker">
    <button ref={button} type="button" className="appearance-select-button" disabled={props.disabled} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={`${id}-list`} onClick={() => { setActive(Math.max(0, COMMUNITY_THEME_PRESETS.indexOf(current as CommunityThemePreset))); setOpen(!open); }}>
      <span>{current ? current.name : "Your own look"}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open ? <ul ref={list} id={`${id}-list`} role="listbox" tabIndex={-1} aria-label="Starting point" aria-activedescendant={`${id}-option-${active}`}
      className="appearance-menu"
      onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(COMMUNITY_THEME_PRESETS.length - 1, i + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(COMMUNITY_THEME_PRESETS[active]); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); }
      }}>
      {COMMUNITY_THEME_PRESETS.map((preset, i) => {
        const sample = preset.theme.schemes.light ?? preset.theme.schemes.dark;
        return <li key={preset.id} id={`${id}-option-${i}`} role="option" aria-selected={preset === current}
          className={i === active ? "is-active" : undefined} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(preset)}>
          <span className="appearance-menu-chips" aria-hidden="true"><i style={{ background: sample?.background, borderColor: sample?.border }} /><i style={{ background: sample?.accent }} /></span>
          <span className="appearance-menu-text"><strong>{preset.name}</strong><small>{preset.description}</small></span>
          {preset === current ? <Check size={16} aria-hidden="true" /> : null}
        </li>;
      })}
    </ul> : null}
  </div>;
}

// A tiny page in a palette's colours: page, card, accent line and button.
function PaletteSample(props: { colors: CommunityThemeColors }) {
  const c = props.colors;
  return <span className="appearance-palette-sample" style={{ background: c.background }}>
    <span className="appearance-palette-card" style={{ background: c.surface, borderColor: c.border }}>
      <i style={{ background: c.text }} /><i style={{ background: c.accent }} />
    </span>
    <span className="appearance-palette-button" style={{ background: c.button }} />
  </span>;
}

// Ready-made colour themes as small swatch cards, light and dark side by side.
// Picking one changes colours only. The first row shows until opened, so the
// colour fields stay close.
const PALETTES_FOLDED = 6;
function PaletteGallery(props: { theme: CommunityThemeV1; scheme: CommunityThemeScheme; disabled: boolean; onPick: (palette: CommunityThemePalette) => void }) {
  const current = matchingCommunityThemePalette(props.theme);
  const [open, setOpen] = useState(() => Boolean(current && COMMUNITY_THEME_PALETTES.indexOf(current) >= PALETTES_FOLDED));
  const id = useId();
  const shown = open ? COMMUNITY_THEME_PALETTES : COMMUNITY_THEME_PALETTES.slice(0, PALETTES_FOLDED);
  return <div className="appearance-palettes">
    <div className="appearance-palettes-head">
      <span id={`${id}-label`}>Colour themes</span>
      <button type="button" className="appearance-link" aria-expanded={open} aria-controls={`${id}-grid`} onClick={() => setOpen(!open)}>
        {open ? "Show fewer" : `Show all ${COMMUNITY_THEME_PALETTES.length}`}</button>
    </div>
    <ul id={`${id}-grid`} className="appearance-palette-grid" aria-labelledby={`${id}-label`}>
      {shown.map((palette) => {
        const selected = palette === current;
        return <li key={palette.id}>
          <button type="button" className={`appearance-palette${selected ? " is-selected" : ""}`} disabled={props.disabled} aria-pressed={selected}
            title={palette.description} onClick={() => props.onPick(palette)}>
            <span className="appearance-palette-pair" aria-hidden="true">
              <PaletteSample colors={palette.schemes.light} /><PaletteSample colors={palette.schemes.dark} />
              {selected ? <span className="appearance-palette-check"><Check size={12} /></span> : null}
            </span>
            <span className="appearance-palette-name">{palette.name}</span>
          </button>
        </li>;
      })}
    </ul>
    <p className="appearance-hint">Changes colours only: fonts, shapes and course cards stay. Each comes in light and dark.</p>
  </div>;
}

// A tiny catalog drawn in the look's layout: cards, rows, picture cards or text.
function CardLookSample(props: { look: CourseCardLook }) {
  const { course_card_style: style, course_card_edge: edge, course_card_size: size } = props.look.tokens;
  const count = style === "list" || style === "text" ? 3 : size === "small" ? 3 : 2;
  return <span className={`appearance-cardlook-sample is-${style} edge-${edge}`} style={{ "--cardlook-columns": style === "list" || style === "text" ? 1 : count } as CSSProperties}>
    {Array.from({ length: count }, (_, index) => <i key={index}>{style === "text" ? null : <b />}<em /><em /></i>)}
  </span>;
}

// Ready-made course card looks: one click sets the card style, edge, size,
// cover shape, spacing, pills and progress together (undo until published).
function CardLookGallery(props: { theme: CommunityThemeV1; disabled: boolean; onPick: (look: CourseCardLook) => void }) {
  const current = matchingCourseCardLook({ ...DEFAULT_COMMUNITY_THEME, ...props.theme });
  const id = useId();
  return <div className="appearance-palettes appearance-cardlooks">
    <div className="appearance-palettes-head"><span id={`${id}-label`}>Card looks</span></div>
    <ul className="appearance-palette-grid" aria-labelledby={`${id}-label`}>
      {COURSE_CARD_LOOKS.map((look) => {
        const selected = look === current;
        return <li key={look.id}>
          <button type="button" className={`appearance-palette${selected ? " is-selected" : ""}`} disabled={props.disabled} aria-pressed={selected}
            title={look.description} onClick={() => props.onPick(look)}>
            <span className="appearance-cardlook-frame" aria-hidden="true">
              <CardLookSample look={look} />
              {selected ? <span className="appearance-palette-check"><Check size={12} /></span> : null}
            </span>
            <span className="appearance-palette-name">{look.name}</span>
          </button>
        </li>;
      })}
    </ul>
    <p className="appearance-hint">Sets the card style, edge, size and details below in one go. Colours and fonts stay.</p>
  </div>;
}

// Looks the owner saved under a name: apply one to the draft (undo until
// saved), save the current look, rename, update or delete.
function SavedThemes(props: {
  theme: CommunityThemeV1;
  canSave: boolean;
  saved: CommunitySavedTheme[];
  busy: boolean;
  error: string | null;
  actions: SavedThemeActions;
  onApply: (theme: CommunityThemeV1) => void;
}) {
  const id = useId();
  // What the inline form is doing: naming a new theme, renaming one, or confirming a delete.
  const [mode, setMode] = useState<{ kind: "new" } | { kind: "rename" | "delete"; saved: CommunitySavedTheme } | null>(null);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode && mode.kind !== "delete") input.current?.focus(); }, [mode]);
  const close = () => { setMode(null); setName(""); };
  const submit = async () => {
    if (!mode) return;
    const ok = mode.kind === "new" ? await props.actions.saveAs(name)
      : mode.kind === "rename" ? await props.actions.rename(mode.saved, name)
        : await props.actions.remove(mode.saved);
    if (ok) close();
  };
  const inUse = props.saved.find((saved) => sameLook(saved.theme, props.theme)) ?? null;

  return <Group title="Saved themes">
    {props.saved.length ? <ul className="appearance-saved-list">
      {props.saved.map((saved) => {
        const colors = saved.theme?.schemes.light ?? saved.theme?.schemes.dark;
        const active = saved === inUse;
        return <li key={saved.savedThemeId} className={active ? "is-active" : undefined}>
          <span className="appearance-saved-swatch" aria-hidden="true">{colors ? <><i style={{ background: colors.background, borderColor: colors.border }} /><i style={{ background: colors.accent }} /><i style={{ background: colors.button }} /></> : null}</span>
          <span className="appearance-saved-name">
            <strong>{saved.name}</strong>
            <small>{active ? "In your draft now" : saved.theme ? new Date(saved.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No longer valid; rename or delete it"}</small>
          </span>
          <button type="button" className="appearance-button" disabled={props.busy || !saved.theme || active}
            onClick={() => saved.theme && props.onApply(saved.theme)}>{active ? "Applied" : "Apply"}</button>
          <span className="appearance-saved-more">
            <button type="button" className="appearance-icon-button" aria-label={`More for ${saved.name}`} aria-haspopup="menu"
              aria-expanded={menu === saved.savedThemeId} disabled={props.busy}
              onClick={() => setMenu(menu === saved.savedThemeId ? null : saved.savedThemeId)}><MoreHorizontal size={16} aria-hidden="true" /></button>
            {menu === saved.savedThemeId ? <span role="menu" className="appearance-menu appearance-saved-menu"
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(null); } }}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu(null); }}>
              <button type="button" role="menuitem" autoFocus onClick={() => { setMenu(null); setName(saved.name); setMode({ kind: "rename", saved }); }}>Rename</button>
              <button type="button" role="menuitem" disabled={!props.canSave || active}
                onClick={() => { setMenu(null); void props.actions.replace(saved); }}>Replace with the current look</button>
              <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(null); setMode({ kind: "delete", saved }); }}>Delete</button>
            </span> : null}
          </span>
        </li>;
      })}
    </ul> : <p className="appearance-hint">Save the look you have now to switch back to it later, or to try a few looks side by side.</p>}

    {mode?.kind === "delete" ? <div className="appearance-saved-form" role="group" aria-labelledby={`${id}-confirm`}>
      <span id={`${id}-confirm`} className="appearance-help">Delete “{mode.saved.name}”? Your draft and live look don't change.</span>
      <div className="appearance-actions">
        <button type="button" className="appearance-button" onClick={close}>Cancel</button>
        <button type="button" className="appearance-button is-danger" disabled={props.busy} onClick={() => void submit()}>Delete</button>
      </div>
    </div> : mode ? <form className="appearance-saved-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label htmlFor={`${id}-name`} className="appearance-help">{mode.kind === "new" ? "Name this look" : "New name"}</label>
      <input ref={input} id={`${id}-name`} className="appearance-text-input" value={name} maxLength={60} placeholder="e.g. Autumn launch"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }} />
      <div className="appearance-actions">
        <button type="button" className="appearance-button" onClick={close}>Cancel</button>
        <button type="submit" className="appearance-button is-primary" disabled={props.busy || !name.trim()}>{mode.kind === "new" ? "Save theme" : "Rename"}</button>
      </div>
    </form> : <button type="button" className="appearance-button appearance-saved-add" disabled={props.busy || !props.canSave || Boolean(inUse)}
      onClick={() => { setName(""); setMode({ kind: "new" }); }}>{inUse ? "This look is saved" : "Save current look as a theme"}</button>}
    {props.error ? <p className="auth-error" role="alert">{props.error}</p> : null}
  </Group>;
}

// Full-screen editor laid out like Substack's website editor: pages on the
// left, the real community in the middle wearing the unsaved draft, and the
// design settings on the right.
function AppearanceEditor(props: EditorProps) {
  const { theme, scheme, set, busy } = props;
  const [page, setPage] = useState("resources");
  const inspector = useRef<HTMLElement>(null);
  // Another page brings its own settings: start the inspector at the top.
  useEffect(() => { inspector.current?.scrollTo?.({ top: 0 }); }, [page]);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLElement>(null);
  const [canvasBox, setCanvasBox] = useState<{ width: number; height: number } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastGoodTheme = useRef<CommunityThemeV1 | null>(props.previewTheme);
  if (props.previewTheme) lastGoodTheme.current = props.previewTheme;
  const previewTheme = props.previewTheme ?? lastGoodTheme.current;
  // The editor sits on document.body, outside the community's themed area, so
  // it carries the theme over from the pane, as Settings has it. Read before
  // the first paint, so it never flashes Polynet's own colours.
  const [themeScope, setThemeScope] = useState<string | null>(null);
  useLayoutEffect(() => {
    setThemeScope(props.pane.current?.closest("[data-community-theme]")?.getAttribute("data-community-theme") ?? null);
  }, []);

  // The rest of the app sits behind the editor: keep focus and screen readers here.
  useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { root?.removeAttribute("inert"); window.removeEventListener("keydown", onKey); };
  }, []);

  // Desktop shows the community at a real desktop width, scaled down to fit,
  // so pages keep their wide layout instead of switching to the narrow one.
  useEffect(() => {
    const element = canvas.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCanvasBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The fitted frame sits inside a 1px border on each side. On small screens
  // it stops shrinking at MIN_PREVIEW_SCALE, so text stays readable.
  const innerWidth = canvasBox ? canvasBox.width - 2 : 0;
  const layoutWidth = Math.min(DESKTOP_PREVIEW_WIDTH, innerWidth / MIN_PREVIEW_SCALE);
  const scale = device === "desktop" && canvasBox && innerWidth < layoutWidth ? innerWidth / layoutWidth : 1;

  // The preview frame asks for the draft when it loads; every change is sent again.
  const send = () => {
    if (!previewTheme) return;
    frame.current?.contentWindow?.postMessage({ type: APPEARANCE_PREVIEW_THEME_MESSAGE, communityId: props.communityId, theme: previewTheme }, window.location.origin);
  };
  useEffect(send, [previewTheme]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === APPEARANCE_PREVIEW_READY_MESSAGE) send();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  const problemFor = (path: string): { "aria-invalid"?: true; "aria-describedby"?: string } => {
    const ids = props.problems.map((problem, i) => (problem.path === path ? `${props.uid}-problem-${i}` : "")).filter(Boolean).join(" ");
    return ids ? { "aria-invalid": true, "aria-describedby": ids } : {};
  };
  const fieldId = (key: string) => `${props.uid}-field-${key.replace(/\W/g, "-")}`;
  const choice = (key: ChoiceKey, also: Partial<CommunityThemeV1> = {}) => {
    const [label, options] = CHOICES[key];
    return <Row key={key} label={label} htmlFor={fieldId(key)}>
      {/* A draft saved before a setting existed lacks it: show the default, so Undo back to it updates the field. */}
      <select id={fieldId(key)} value={theme[key] ?? DEFAULT_COMMUNITY_THEME[key]} disabled={busy} {...problemFor(key)} onChange={(e) => set({ [key]: e.target.value, ...also } as Partial<CommunityThemeV1>)}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Row>;
  };
  const slider = (key: "heading_weight" | "type_scale" | "radius" | "border_width", label: string, min: number, max: number, step: number, unit: (value: number) => string) =>
    <Row key={key} label={<>{label} <span className="appearance-row-value">{unit(theme[key])}</span></>} htmlFor={fieldId(key)}>
      <input id={fieldId(key)} type="range" min={min} max={max} step={step} value={theme[key]} disabled={busy} {...problemFor(key)} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<CommunityThemeV1>)} /></Row>;
  const fontSelect = (key: "font_heading" | "font_body", label: string, fonts: string[]) =>
    <Row label={label} htmlFor={fieldId(key)}>
      <select id={fieldId(key)} value={theme[key]} disabled={busy} {...problemFor(key)} onChange={(e) => set({ [key]: e.target.value })}>{fonts.map((name) => <option key={name}>{name}</option>)}</select></Row>;

  const colors = theme.schemes[scheme];
  // Secondary text is lifted until it reads clearly, so say so when the shown colour isn't the pick.
  const shownMuted = colors ? communityTextLevels(colors, scheme).muted : null;
  const mutedHint = colors && shownMuted && shownMuted.toLowerCase() !== colors.muted.toLowerCase() ? shownMuted : null;
  const setColors = (change: Partial<CommunityThemeColors>) => {
    if (!colors) return;
    set({ schemes: { ...theme.schemes, [scheme]: { ...colors, ...change } } });
  };
  // One brand colour sets the accent and the buttons, with readable text on both.
  const setBrand = (value: string) => {
    const color = value.toUpperCase();
    setColors({ accent: color, button: color, on_accent: readableOn(color), on_button: readableOn(color) });
  };
  const setMode = (mode: SchemeMode) => {
    const current = theme.schemes;
    // A missing version is the matching twin, as members who pick the other mode see it.
    const fallback = (key: CommunityThemeScheme): CommunityThemeColors => communityThemeTwinColors(theme, key);
    const schemes = mode === "both"
      ? { light: current.light ?? fallback("light"), dark: current.dark ?? fallback("dark") }
      : { [mode]: current[mode] ?? fallback(mode) };
    set({ schemes });
    props.setScheme(mode === "both" ? scheme : mode);
  };
  const applyTheme = (next: CommunityThemeV1) => {
    set(structuredClone(next));
    props.setScheme(next.schemes.light ? "light" : "dark");
  };
  const applyPreset = (preset: CommunityThemePreset) => applyTheme(preset.theme);
  // A palette changes colours only and keeps the light/dark setting.
  const applyPalette = (palette: CommunityThemePalette) => set({ schemes: applyCommunityThemePalette(theme, palette).schemes });
  const mode = schemeMode(theme);

  // Phone loads the phone app (/m/), as a real phone gets it, not the desktop
  // layout squeezed into 390px.
  const src = props.communitySlug
    ? `${device === "phone" ? "/m" : ""}/c/${encodeURIComponent(props.communitySlug)}/${page}?${APPEARANCE_PREVIEW_PARAM}=1`
    : null;

  // Settings that only show on one page sit with that page in the Pages list.
  const pageLabel = PREVIEW_PAGES.find(([key]) => key === page)?.[1] ?? "This";
  const pageGroups = page === "chat" ? <>
    <Group title="Classroom posts">
      {choice("classroom_chat")}
      <p className="appearance-hint">In Classroom, members see posts as cards by default. Pick a chat to show a chat timeline instead. Channels always shows the full-width chat.</p>
    </Group>
    <Group title="Pods">
      {choice("pods_place")}
      <p className="appearance-hint">Classroom shows each invite-only channel as a pod, with the faces of everyone who can see it. Pick where members find them.</p>
    </Group>
    <Group title="Members panel">
      {choice("sibling_communities")}
      <p className="appearance-hint">"More from this creator" at the foot of the chat's member list. Your profile lists your communities either way.</p>
    </Group>
  </> : page === "resources" ? <>
    <Group title="Course grid">
      {/* Picking a size goes back to fitting the screen, even if an agent set fixed columns. */}
      {choice("course_card_size", { course_columns: "auto" })}
      {theme.course_columns === "auto" ? null : choice("course_columns")}
      {choice("course_columns_phone")}
      {choice("course_gap")}
      {choice("course_cover_ratio")}
      <p className="appearance-hint">{theme.course_columns === "auto" ? "Cards keep the size you pick, and each row fits as many as the screen has room for." : "Rows wrap sooner on narrow screens, so cards stay readable."}</p>
    </Group>
    <Group title="Course cards">
      <CardLookGallery theme={theme} disabled={busy} onPick={(look) => set({ ...look.tokens })} />
      {choice("course_card_style")}
      {theme.course_card_style === "list" || theme.course_card_style === "text" ? null : choice("course_card_edge")}
      {/* The panel under the cover: boxed cards with a cover on top only. */}
      {theme.course_card_style === "list" || theme.course_card_style === "text" || theme.course_card_style === "overlay" || theme.course_card_edge === "none" ? null : <>
        {/* Custom starts from a shade that suits the scheme being previewed. */}
        {choice("course_card_panel", theme.course_card_panel_color ? {} : { course_card_panel_color: scheme === "dark" ? "#333333" : "#EFEFEC" })}
        {(theme.course_card_panel ?? DEFAULT_COMMUNITY_THEME.course_card_panel) === "custom" ? <Row label="Panel colour" htmlFor={fieldId("course_card_panel_color")}>
          <ColorField id={fieldId("course_card_panel_color")} label="Panel colour" value={theme.course_card_panel_color || (scheme === "dark" ? "#333333" : "#EFEFEC")} disabled={busy}
            invalid={Boolean(problemFor("course_card_panel_color")["aria-invalid"])} onChange={(value) => set({ course_card_panel_color: value })} /></Row> : null}
      </>}
      {choice("course_card_pills")}
      {choice("course_card_description")}
      {choice("course_card_progress")}
      <p className="appearance-hint">Corners follow Shape → Corner radius.</p>
    </Group>
    <Group title="Course covers">
      {choice("course_cover_fit")}
      {choice("course_cover_plate")}
      {choice("media_plate")}
    </Group>
  </> : <p className="appearance-hint appearance-scope-empty">This page has no settings of its own. It follows the site-wide look below.</p>;

  const editor = <div className="appearance-editor" role="dialog" aria-modal="true" aria-labelledby={`${props.uid}-editor-title`}>
    <header className="appearance-editor-bar">
      <div className="appearance-editor-bar-start">
        <button className="appearance-icon-button" type="button" onClick={props.onClose} aria-label="Back to settings"><ChevronLeft size={20} aria-hidden="true" /></button>
        <h2 id={`${props.uid}-editor-title`} ref={heading} tabIndex={-1}>Customize</h2>
        {props.status}
      </div>
      <div className="appearance-segmented" role="group" aria-label="Screen size">
        <button type="button" className={`appearance-seg${device === "desktop" ? " is-active" : ""}`} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={16} aria-hidden="true" />Desktop</button>
        <button type="button" className={`appearance-seg${device === "phone" ? " is-active" : ""}`} aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone size={16} aria-hidden="true" />Phone</button>
      </div>
      <div className="appearance-actions">{props.actions}</div>
    </header>
    <div className="appearance-editor-body">
      <nav className="appearance-pages" aria-label="Page to preview">
        <h3>Pages</h3>
        {PREVIEW_PAGES.map(([key, label]) => {
          const Icon = PAGE_ICONS[key];
          return <button key={key} type="button" aria-current={key === page ? "page" : undefined} className={key === page ? "is-active" : ""} onClick={() => setPage(key)}>
            <Icon size={16} aria-hidden="true" /><span>{label}</span></button>;
        })}
        <p className="appearance-hint">Members see this look only after you publish.</p>
      </nav>
      <section ref={canvas} className={`appearance-canvas is-${device}`} aria-label="Preview">
        {src && scale < 1 && canvasBox ? <div className="appearance-frame-fit" style={{ width: canvasBox.width, height: canvasBox.height }}>
          <iframe ref={frame} key={src} src={src} title="Your community with the draft look" className="appearance-frame is-scaled"
            style={{ width: layoutWidth, height: (canvasBox.height - 2) / scale, transform: `scale(${scale})` }} />
        </div>
        : src ? <iframe ref={frame} key={src} src={src} title="Your community with the draft look" className="appearance-frame" />
          : <div className="community-look-preview" data-community-theme={PREVIEW_SCOPE}><SampleContent /></div>}
      </section>
      <aside ref={inspector} className="appearance-inspector community-look" aria-label="Design settings">
        {/* The page being previewed comes first; the site-wide look stays below it. */}
        <InspectorScope title={`${pageLabel} page`} hint="Only on this page.">
          {pageGroups}
        </InspectorScope>
        <InspectorScope title="Site-wide" hint="Every page of your community.">
          <Group title="Theme">
            <Row label="Starting point" wide><PresetPicker theme={theme} disabled={busy} onPick={applyPreset} /></Row>
            <p className="appearance-hint">Picking one replaces your draft. Undo until you save.</p>
          </Group>
          <SavedThemes theme={theme} canSave={props.canSave} saved={props.savedThemes} busy={props.savedBusy || busy} error={props.savedError}
            actions={props.savedActions} onApply={applyTheme} />
          {props.hasBanner ? <Group title="Banner">
            {choice("banner_name")}
            <p className="appearance-hint">Hide the name when your banner artwork already spells it out.</p>
          </Group> : null}
          <Group title="Colors">
            <PaletteGallery theme={theme} scheme={scheme} disabled={busy} onPick={applyPalette} />
            <Row label="Light or dark" htmlFor={fieldId("mode")}>
              <select id={fieldId("mode")} value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as SchemeMode)}>
                {SCHEME_MODES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Row>
            {mode === "both" ? <Row label="Editing" htmlFor={fieldId("scheme")}>
              <select id={fieldId("scheme")} value={scheme} onChange={(e) => props.setScheme(e.target.value as CommunityThemeScheme)}>
                <option value="light">Light version</option><option value="dark">Dark version</option></select></Row> : null}
            {colors ? <>
              <Row label={<>Brand colour<small>Accent and buttons</small></>} htmlFor={fieldId("brand")}>
                <ColorField id={fieldId("brand")} label="Brand" value={colors.accent} disabled={busy} onChange={setBrand} /></Row>
              {COLOR_FIELDS.map(([key, label]) => {
                const problem = problemFor(`schemes.${scheme}.${key}`);
                const describedBy = [problem["aria-describedby"], key === "muted" && mutedHint ? `${props.uid}-muted-hint` : ""].filter(Boolean).join(" ") || undefined;
                return <Row key={key} label={label} htmlFor={fieldId(key)}>
                  <ColorField id={fieldId(key)} label={label} value={colors[key]} disabled={busy} invalid={Boolean(problem["aria-invalid"])} describedBy={describedBy}
                    onChange={(value) => setColors({ [key]: value })} /></Row>;
              })}
              {mutedHint ? <small id={`${props.uid}-muted-hint`} className="community-look-color-hint">Secondary text shows as {mutedHint.toUpperCase()} so it stays easy to read on {scheme === "dark" ? "dark" : "light"} backgrounds.</small> : null}
            </> : null}
          </Group>
          <Group title="Typography">
            {fontSelect("font_heading", "Headings", HEADING_FONTS)}
            {fontSelect("font_body", "Body text", TEXT_FONTS)}
            {slider("heading_weight", "Heading weight", 300, 900, 50, String)}
            {choice("heading_case")}
            {slider("type_scale", "Text size", 0.9, 1.2, 0.05, (value) => `${Math.round(value * 100)}%`)}
            {choice("numerals")}
          </Group>
          <Group title="Shape">
            {slider("radius", "Corner radius", 0, 24, 1, (value) => `${value}px`)}
            {choice("corner_style")}
            {choice("button_shape")}
            {slider("border_width", "Border width", 0, 3, 1, (value) => `${value}px`)}
            {choice("shadow")}
            {choice("density")}
            {choice("edges")}
            <p className="appearance-hint">How panels and cards stand apart in the light scheme. Dark keeps its own look.</p>
          </Group>
          <Group title="Channels look · draft">
            {choice("channels_look")}
            <p className="appearance-hint">Substack-style pages for the Channels layout. Classroom keeps its own look.</p>
          </Group>
          <Group title="Left rail · draft">
            {choice("rail_size")}
            {choice("rail_color")}
            <p className="appearance-hint">The column of community icons on the far left, while members are in your community.</p>
          </Group>
        </InspectorScope>
        {props.footer}
      </aside>
    </div>
  </div>;
  // The wrapper is always there, so finding the theme doesn't remount the editor.
  return createPortal(<div className="community-theme-scope" data-community-theme={themeScope ?? undefined}>{editor}</div>, document.body);
}
