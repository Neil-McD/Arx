// Generated from shared/communityTheme.ts by tools/build-contracts.mjs. Do not edit.
// A community's look as data: a small public vocabulary of tokens that a
// founder or their agent sets, validated here and compiled into Polynet's own
// CSS variables. Founders never see Polynet's internal variable or class
// names, so Polynet can change those freely. The compiled CSS is scoped to the
// community's own area: the app frame (community rail, Discover, messages,
// settings) always keeps Polynet's look. Contract: docs/community-theme-v1.md.
export const COMMUNITY_THEME_VERSION = 1;
const SANS = "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif";
const MONO = "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace";
export const COMMUNITY_THEME_FONTS = {
    "IBM Plex Sans": { stack: `"IBM Plex Sans Variable", "IBM Plex Sans", ${SANS}`, source: "polynet", role: "text" },
    "IBM Plex Mono": { stack: `"IBM Plex Mono", ${MONO}`, source: "polynet", role: "mono" },
    "Excalifont": { stack: `"Excalifont", ${SANS}`, source: "polynet", role: "display" },
    "Segoe UI": { stack: `"Segoe UI", ${SANS}`, source: "system", role: "text" },
    "System": { stack: SANS, source: "system", role: "text" },
    "Inter": { stack: `"Inter", ${SANS}`, source: "google", role: "text", googleFamily: "Inter:wght@400;500;600;700" },
    "DM Sans": { stack: `"DM Sans", ${SANS}`, source: "google", role: "text", googleFamily: "DM Sans:wght@400;500;600;700" },
    "Manrope": { stack: `"Manrope", ${SANS}`, source: "google", role: "text", googleFamily: "Manrope:wght@400;500;600;700;800" },
    "Source Serif 4": { stack: `"Source Serif 4", Georgia, serif`, source: "google", role: "text", googleFamily: "Source Serif 4:wght@400;600;700" },
    "Barlow Condensed": { stack: `"Barlow Condensed", "Arial Narrow", ${SANS}`, source: "google", role: "display", googleFamily: "Barlow Condensed:wght@500;600;700" },
    "Chakra Petch": { stack: `"Chakra Petch", ${SANS}`, source: "google", role: "display", googleFamily: "Chakra Petch:wght@500;600;700" },
    "Fraunces": { stack: `"Fraunces", Georgia, serif`, source: "google", role: "display", googleFamily: "Fraunces:wght@400;600;800" },
    "Caveat": { stack: `"Caveat", ${SANS}`, source: "google", role: "display", googleFamily: "Caveat:wght@500;700" },
    "JetBrains Mono": { stack: `"JetBrains Mono", ${MONO}`, source: "google", role: "mono", googleFamily: "JetBrains Mono:wght@400;500;700" },
};
// Polynet's own look, so a theme only states what differs from it.
export const DEFAULT_COMMUNITY_THEME = {
    version: 1,
    schemes: {
        light: {
            background: "#F8F8F4", surface: "#FFFFFF", text: "#171719", muted: "#5F5F5A", border: "#E2E2DE",
            accent: "#2F55FF", on_accent: "#FFFFFF", button: "#171719", on_button: "#FFFFFF",
        },
        dark: {
            background: "#1A1A1A", surface: "#2A2A2A", text: "#FCF8F0", muted: "#B3AD9F", border: "#3A3A3A",
            accent: "#D66A8A", on_accent: "#171719", button: "#F1EDE5", on_button: "#0A0A0A",
        },
    },
    font_body: "IBM Plex Sans",
    font_heading: "IBM Plex Sans",
    font_mono: "IBM Plex Mono",
    heading_weight: 650,
    heading_case: "none",
    type_scale: 1,
    numerals: "proportional",
    radius: 16,
    corner_style: "even",
    button_shape: "rounded",
    border_width: 1,
    shadow: "none",
    density: "comfortable",
    media_plate: "none",
    course_cover_ratio: "16:9",
    course_card_size: "medium",
    course_columns: "auto",
    course_columns_phone: "1",
    course_gap: "default",
    course_card_style: "classroom",
    course_card_pills: "hide",
    course_card_description: "show",
    course_card_progress: "bar",
    course_card_edge: "border",
    course_card_panel: "shade",
    course_card_panel_color: "",
    course_cover_plate: "none",
    course_cover_fit: "crop",
    banner_name: "show",
    channels_look: "current",
    rail_size: "standard",
    rail_color: "polynet",
    sibling_communities: "hide",
    pods_place: "aside",
    classroom_chat: "posts",
    // Clean white is the light default.
    edges: "clean",
};
const COLOR_KEYS = [
    "background", "surface", "text", "muted", "border", "accent", "on_accent", "button", "on_button",
];
// Contrast floors (WCAG 2.2 AA): reading text 4.5:1, accent as a control edge 3:1.
const CONTRAST_PAIRS = [
    ["text", "background", 4.5],
    ["text", "surface", 4.5],
    ["muted", "surface", 4.5],
    ["on_accent", "accent", 4.5],
    ["on_button", "button", 4.5],
    ["accent", "background", 3],
];
const ENUMS = {
    heading_case: ["none", "upper"],
    numerals: ["proportional", "tabular"],
    corner_style: ["even", "sketch"],
    button_shape: ["pill", "rounded", "square", "sketch"],
    shadow: ["none", "soft", "hard"],
    density: ["compact", "comfortable", "roomy"],
    media_plate: ["none", "light"],
    course_cover_ratio: ["auto", "16:9", "3:2", "4:3", "1:1", "21:9"],
    course_card_size: ["default", "small", "medium", "large"],
    course_columns: ["auto", "1", "2", "3", "4"],
    course_columns_phone: ["1", "2"],
    course_gap: ["default", "tight", "roomy"],
    course_card_style: ["classroom", "cover", "list", "overlay", "text"],
    course_card_pills: ["hide", "show"],
    course_card_description: ["show", "hide"],
    course_card_progress: ["bar", "ring", "fraction"],
    course_card_edge: ["border", "shadow", "none"],
    course_card_panel: ["shade", "tint", "accent", "plain", "custom"],
    course_cover_plate: ["none", "tint"],
    course_cover_fit: ["crop", "whole"],
    banner_name: ["show", "hide"],
    channels_look: ["current", "quiet", "reader", "publication"],
    rail_size: ["standard", "large"],
    rail_color: ["polynet", "blend", "tint", "brand"],
    sibling_communities: ["hide", "show"],
    pods_place: ["aside", "header", "tab"],
    classroom_chat: ["posts", "chat"],
    edges: ["soft", "sharp", "clean", "framed"],
};
const RANGES = {
    heading_weight: [300, 900],
    type_scale: [0.9, 1.2],
    radius: [0, 24],
    border_width: [0, 3],
};
// Settings that no longer exist. Saved themes may still carry them, so they
// load without a problem and are dropped. chat_view: every Channels chat is
// Wide now.
const RETIRED_KEYS = ["chat_view"];
const KNOWN_KEYS = new Set([
    "version", "schemes", "font_body", "font_heading", "font_mono", "course_card_panel_color",
    ...Object.keys(ENUMS), ...Object.keys(RANGES), ...RETIRED_KEYS,
]);
function parseHex(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
    if (!match)
        return null;
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
    return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
function luminance([r, g, b]) {
    const channel = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a, b) {
    const ra = parseHex(a);
    const rb = parseHex(b);
    if (!ra || !rb)
        return 0;
    const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}
function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
// `a` moved toward `b` by t (0..1), as hex; null for a malformed colour.
export function mixHex(a, b, t) {
    const ra = parseHex(a);
    const rb = parseHex(b);
    return ra && rb ? toHex(mix(ra, rb, t)) : null;
}
// The closest colour to `color` (moving toward black or white) that reaches
// `ratio` against `against`; null when even black or white can't.
export function nearestPassingColor(color, against, ratio) {
    const start = parseHex(color);
    const base = parseHex(against);
    if (!start || !base)
        return null;
    if (contrastRatio(color, against) >= ratio)
        return toHex(start);
    const target = luminance(base) > 0.18 ? [0, 0, 0] : [255, 255, 255];
    for (let step = 1; step <= 100; step += 1) {
        const candidate = toHex(mix(start, target, step / 100));
        if (contrastRatio(candidate, against) >= ratio)
            return candidate;
    }
    return null;
}
// Grey text floors, measured against the card surface. Dark schemes get
// higher floors: a grey that passes on paper still reads as grey-on-black.
const TEXT_FLOORS = {
    light: { secondary: 7, muted: 4.5, faint: 4.5 },
    dark: { secondary: 15, muted: 12, faint: 9 },
};
// Secondary, muted and faint text for a scheme, each lifted (toward the text
// colour's end) until it meets its floor on both the page and the card.
export function communityTextLevels(c, scheme) {
    const floors = TEXT_FLOORS[scheme];
    const text = parseHex(c.text);
    const muted = parseHex(c.muted);
    const background = parseHex(c.background);
    const lift = (start, ratio) => {
        if (!start || !text)
            return c.muted;
        for (let step = 0; step <= 100; step += 1) {
            const candidate = toHex(mix(start, text, step / 100));
            if (contrastRatio(candidate, c.surface) >= ratio && contrastRatio(candidate, c.background) >= ratio)
                return candidate;
        }
        return c.text;
    };
    return {
        secondary: lift(text && muted ? mix(muted, text, 0.7) : null, floors.secondary),
        muted: lift(muted, floors.muted),
        faint: lift(muted && background ? mix(muted, background, 0.25) : null, floors.faint),
    };
}
// ---------------------------------------------------------------------------
// Validation
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeColors(raw, path, problems) {
    if (!isRecord(raw)) {
        problems.push({ path, message: "A scheme needs its colours: " + COLOR_KEYS.join(", ") + "." });
        return null;
    }
    const colors = {};
    for (const key of Object.keys(raw)) {
        if (!COLOR_KEYS.includes(key)) {
            problems.push({ path: `${path}.${key}`, message: `"${key}" isn't a theme colour. Use: ${COLOR_KEYS.join(", ")}.` });
        }
    }
    for (const key of COLOR_KEYS) {
        const value = raw[key];
        const rgb = typeof value === "string" ? parseHex(value) : null;
        if (!rgb) {
            problems.push({ path: `${path}.${key}`, message: `${key} must be a hex colour like #2D8C3C.` });
            continue;
        }
        colors[key] = toHex(rgb);
    }
    if (Object.keys(colors).length !== COLOR_KEYS.length)
        return null;
    for (const [fg, bg, ratio] of CONTRAST_PAIRS) {
        const actual = contrastRatio(colors[fg], colors[bg]);
        if (actual < ratio) {
            // Button and accent fills are brand colours: suggest a nearby fill
            // rather than swapping their label colour.
            const adjust = bg === "accent" || bg === "button" ? bg : fg;
            const other = adjust === fg ? bg : fg;
            const fix = nearestPassingColor(colors[adjust], colors[other], ratio);
            problems.push({
                path: `${path}.${adjust}`,
                message: `${fg} ${colors[fg]} on ${bg} ${colors[bg]} is ${actual.toFixed(1)}:1; it needs ${ratio}:1 to be readable.`,
                ...(fix ? { suggestion: fix } : {}),
            });
        }
    }
    return colors;
}
function normalizeFont(value, path, allowed, problems) {
    const name = typeof value === "string" ? value.trim() : "";
    const font = COMMUNITY_THEME_FONTS[name];
    if (!font) {
        problems.push({
            path,
            message: `"${name || String(value)}" isn't an available font.`,
            suggestion: Object.keys(COMMUNITY_THEME_FONTS).filter((key) => allowed.includes(COMMUNITY_THEME_FONTS[key].role)).join(", "),
        });
        return null;
    }
    if (!allowed.includes(font.role)) {
        problems.push({
            path,
            message: font.role === "display"
                ? `${name} is a display face; use it for headings, and a text face for reading.`
                : `${name} is a ${font.role} face and can't be used here.`,
        });
        return null;
    }
    return name;
}
// Accepts a partial theme (anything left out keeps Polynet's default) and
// returns the full theme, or every problem at once so an agent can fix them
// in one pass.
export function normalizeCommunityTheme(raw) {
    const problems = [];
    if (!isRecord(raw))
        return { ok: false, problems: [{ path: "", message: "A theme is a JSON object." }] };
    if (raw.version !== undefined && raw.version !== COMMUNITY_THEME_VERSION) {
        problems.push({ path: "version", message: `Only theme version ${COMMUNITY_THEME_VERSION} is supported.` });
    }
    for (const key of Object.keys(raw)) {
        if (!KNOWN_KEYS.has(key))
            problems.push({ path: key, message: `"${key}" isn't a theme setting.` });
    }
    const theme = { ...DEFAULT_COMMUNITY_THEME, schemes: { ...DEFAULT_COMMUNITY_THEME.schemes } };
    if (raw.schemes !== undefined) {
        if (!isRecord(raw.schemes) || Object.keys(raw.schemes).length === 0) {
            problems.push({ path: "schemes", message: "Give a light scheme, a dark scheme, or both." });
        }
        else {
            theme.schemes = {};
            for (const key of Object.keys(raw.schemes)) {
                if (key !== "light" && key !== "dark") {
                    problems.push({ path: `schemes.${key}`, message: "Schemes are \"light\" and \"dark\"." });
                    continue;
                }
                const colors = normalizeColors(raw.schemes[key], `schemes.${key}`, problems);
                if (colors)
                    theme.schemes[key] = colors;
            }
        }
    }
    if (raw.font_body !== undefined)
        theme.font_body = normalizeFont(raw.font_body, "font_body", ["text"], problems) ?? theme.font_body;
    if (raw.font_heading !== undefined)
        theme.font_heading = normalizeFont(raw.font_heading, "font_heading", ["text", "display", "mono"], problems) ?? theme.font_heading;
    if (raw.font_mono !== undefined)
        theme.font_mono = normalizeFont(raw.font_mono, "font_mono", ["mono"], problems) ?? theme.font_mono;
    for (const key of Object.keys(ENUMS)) {
        const value = raw[key];
        if (value === undefined)
            continue;
        if (!ENUMS[key].includes(value)) {
            problems.push({ path: key, message: `${key} is one of: ${ENUMS[key].join(", ")}.` });
            continue;
        }
        theme[key] = value;
    }
    for (const key of Object.keys(RANGES)) {
        const value = raw[key];
        if (value === undefined)
            continue;
        const [min, max] = RANGES[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
            problems.push({ path: key, message: `${key} is a number from ${min} to ${max}.` });
            continue;
        }
        theme[key] = value;
    }
    if (raw.course_card_panel_color !== undefined) {
        const value = typeof raw.course_card_panel_color === "string" ? raw.course_card_panel_color.trim() : null;
        if (value === null || (value !== "" && !parseHex(value))) {
            problems.push({ path: "course_card_panel_color", message: "course_card_panel_color is a colour like \"#2B2B2B\", or \"\" for none." });
        }
        else {
            theme.course_card_panel_color = value.toUpperCase();
        }
    }
    if (theme.course_card_panel === "custom" && !theme.course_card_panel_color) {
        problems.push({
            path: "course_card_panel_color",
            message: "A custom card panel needs a colour.",
            suggestion: "Set course_card_panel_color to a colour like \"#2B2B2B\", or pick another course_card_panel.",
        });
    }
    return problems.length ? { ok: false, problems } : { ok: true, theme };
}
// ---------------------------------------------------------------------------
// Compilation
const SHAPE = {
    sketchButton: "255px 15px 225px 15px / 15px 225px 15px 255px",
};
function cardRadius(theme) {
    if (theme.corner_style === "sketch") {
        const minor = Math.max(2, Math.round(theme.radius / 4));
        return `${theme.radius}px ${minor}px ${theme.radius}px ${minor}px`;
    }
    return `${theme.radius}px`;
}
function cardTopRadius(theme) {
    const minor = theme.corner_style === "sketch" ? Math.max(2, Math.round(theme.radius / 4)) : theme.radius;
    return `${theme.radius}px ${minor}px 0 0`;
}
function buttonRadius(theme) {
    switch (theme.button_shape) {
        case "pill": return "999px";
        case "square": return `${Math.min(theme.radius, 3)}px`;
        case "sketch": return SHAPE.sketchButton;
        default: return `${Math.min(Math.max(theme.radius, 6), 12)}px`;
    }
}
function shadows(theme, scheme) {
    if (theme.shadow === "hard") {
        return {
            card: "3px 4px 0 color-mix(in srgb, var(--pn-text) 10%, transparent)",
            button: "3px 4px 0 color-mix(in srgb, var(--pn-text) 55%, transparent)",
        };
    }
    if (theme.shadow === "soft") {
        const alpha = scheme === "dark" ? 0.45 : 0.12;
        return { card: `0 10px 28px rgba(0, 0, 0, ${alpha})`, button: "none" };
    }
    return { card: "none", button: "none" };
}
const DENSITY = { compact: 0.85, comfortable: 1, roomy: 1.15 };
// Minimum card width per size; "default" keeps Polynet's two-column catalog.
const COURSE_CARD_MIN_WIDTH = { small: 200, medium: 260, large: 360 };
function courseColumns(theme) {
    if (theme.course_columns !== "auto")
        return fixedCourseColumns(Number(theme.course_columns));
    if (theme.course_card_size === "default")
        return "repeat(2, minmax(0, 1fr))";
    return `repeat(auto-fill, minmax(min(100%, ${COURSE_CARD_MIN_WIDTH[theme.course_card_size]}px), 1fr))`;
}
// At most `count` cards per row. Each column is at least its share of the row
// less the widest gap (2.5rem), so `count` always fit, and the row wraps
// before a card gets narrower than 160px.
function fixedCourseColumns(count) {
    if (count === 1)
        return "minmax(0, 1fr)";
    return `repeat(auto-fill, minmax(max(min(100%, 160px), calc((100% - ${count - 1} * 2.5rem) / ${count})), 1fr))`;
}
const COURSE_GAP = { tight: "0.75rem", roomy: "2.5rem" };
// Every text size inside a community is one of these roles, so one text-size
// setting moves all of them together. Sizes are Polynet's defaults at 100%.
export const COMMUNITY_TYPE_ROLES = {
    display: 32, title: 24, heading: 22, subheading: 18, reading: 16, body: 15, ui: 14, small: 13, label: 12, meta: 11, micro: 10,
};
// What each role renders at, at 100%. The roles above are the sizes Polynet's
// CSS is written in; communities show them a step larger, close to Skool's
// reading sizes (16 body, 13 smallest), with the small end raised the most.
export const COMMUNITY_TYPE_SIZES = {
    display: 34, title: 26, heading: 23, subheading: 20, reading: 17, body: 16, ui: 16, small: 15, label: 13, meta: 13, micro: 11,
};
function typeRoles(scale) {
    const px = (size) => `${Math.round(size * scale * 10) / 10}px`;
    const roles = {};
    for (const [role, size] of Object.entries(COMMUNITY_TYPE_SIZES))
        roles[`--pn-type-${role}`] = px(size);
    // Page titles still shrink on narrow screens, at the same proportions.
    roles["--pn-type-display"] = `clamp(${px(26)}, ${Math.round(3 * scale * 100) / 100}vw, ${px(COMMUNITY_TYPE_SIZES.display)})`;
    return roles;
}
// The text panel under a boxed course card's cover. Presets are mixes of the
// scheme's own colours, so they follow its text colours; a custom colour gets
// whichever text colour reads on it.
function courseCardPanel(theme, c, scheme) {
    const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
    const own = { text: c.text, muted: mix(c.text, 72, c.surface) };
    switch (theme.course_card_panel) {
        case "plain": return { background: c.surface, ...own };
        case "tint": return { background: mix(c.accent, 4, mix(c.text, 2.5, c.surface)), ...own };
        case "accent": return { background: mix(c.accent, 14, c.surface), ...own };
        case "custom": {
            const rgb = parseHex(theme.course_card_panel_color);
            if (!rgb)
                break;
            const background = toHex(rgb);
            const text = contrastRatio(c.text, background) >= 4.5 ? c.text : contrastRatio("#111111", background) >= contrastRatio("#FFFFFF", background) ? "#111111" : "#FFFFFF";
            return { background, text, muted: mix(text, 72, background) };
        }
        default: break;
    }
    // A clear step down from the card.
    return { background: mix(c.text, scheme === "dark" ? 14 : 10, c.surface), ...own };
}
// The variables a community area gets for one scheme: the public --pn-* set
// (also what custom sites and <polynet-account> read) and Polynet's internal
// variables derived from it.
export function communityThemeVariables(theme, scheme) {
    const c = theme.schemes[scheme];
    if (!c)
        throw new Error(`The theme has no ${scheme} scheme.`);
    const font = (name) => COMMUNITY_THEME_FONTS[name]?.stack ?? COMMUNITY_THEME_FONTS["IBM Plex Sans"].stack;
    // Accent-coloured text sits on the page and on cards, so it passes on both.
    const onPage = nearestPassingColor(c.accent, c.background, 4.5);
    const link = (onPage && nearestPassingColor(onPage, c.surface, 4.5)) ?? c.text;
    const shadow = shadows(theme, scheme);
    const upper = theme.heading_case === "upper";
    const plate = theme.media_plate === "light" && scheme === "dark";
    const coverTint = theme.course_cover_plate === "tint" && scheme === "light";
    const sizedCourseGrid = theme.course_columns === "auto" && theme.course_card_size !== "default";
    const ownerCourseGrid = sizedCourseGrid || theme.course_columns !== "auto";
    const grey = communityTextLevels(c, scheme);
    const panel = courseCardPanel(theme, c, scheme);
    const pn = {
        "--pn-background": c.background,
        "--pn-surface": c.surface,
        "--pn-text": c.text,
        "--pn-muted": grey.muted,
        "--pn-border": c.border,
        "--pn-accent": c.accent,
        "--pn-on-accent": c.on_accent,
        "--pn-button": c.button,
        "--pn-on-button": c.on_button,
        "--pn-link": link,
        "--pn-font-body": font(theme.font_body),
        "--pn-font-heading": font(theme.font_heading),
        "--pn-font-mono": font(theme.font_mono),
        "--pn-heading-weight": String(theme.heading_weight),
        "--pn-heading-case": upper ? "uppercase" : "none",
        "--pn-heading-tracking": upper ? "0.04em" : "normal",
        "--pn-type-scale": String(theme.type_scale),
        ...typeRoles(theme.type_scale),
        "--pn-numerals": theme.numerals === "tabular" ? "tabular-nums" : "normal",
        // Polynet's own corners scale with the theme's radius (16px is Polynet's default).
        "--pn-radius-scale": String(Math.round((theme.radius / DEFAULT_COMMUNITY_THEME.radius) * 1000) / 1000),
        "--pn-radius": `${theme.radius}px`,
        "--pn-radius-card": cardRadius(theme),
        "--pn-radius-card-top": cardTopRadius(theme),
        "--pn-radius-button": buttonRadius(theme),
        "--pn-border-width": `${theme.border_width}px`,
        "--pn-shadow-card": shadow.card,
        "--pn-shadow-button": shadow.button,
        "--pn-space": String(DENSITY[theme.density]),
        "--pn-media-plate": plate ? "#F4F4F0" : "transparent",
        "--pn-media-plate-pad": plate ? "8px" : "0px",
        "--pn-cover-plate": coverTint ? `color-mix(in srgb, ${c.accent} 9%, ${c.surface})` : "var(--bg-card-alt)",
        "--pn-cover-blend": coverTint ? "multiply" : "normal",
        "--pn-course-panel": panel.background,
        "--pn-course-panel-text": panel.text,
        "--pn-course-panel-muted": panel.muted,
        "--pn-course-columns": courseColumns(theme),
        // Set only when the owner picked them, so page styles keep their own
        // columns and spacing otherwise ("initial" makes var() use its fallback).
        "--pn-course-columns-owner": ownerCourseGrid ? courseColumns(theme) : "initial",
        // A picked card size fills the screen: the catalog widens (up to 90rem)
        // and each row fits as many cards of that size as there is room for.
        "--pn-course-catalog-max-owner": sizedCourseGrid ? "90rem" : "initial",
        "--pn-course-columns-phone": `repeat(${theme.course_columns_phone}, minmax(0, 1fr))`,
        "--pn-course-gap-owner": theme.course_gap === "default" ? "initial" : COURSE_GAP[theme.course_gap],
        "--pn-course-cover-ratio": theme.course_cover_ratio === "auto" ? "auto" : theme.course_cover_ratio.replace(":", " / "),
        "--pn-course-cover-height": theme.course_cover_ratio === "auto" ? "clamp(118px, 17vw, 158px)" : "auto",
        "--pn-banner-name": theme.banner_name === "hide" ? "hidden" : "visible",
        "--pn-siblings-display": theme.sibling_communities === "show" ? "flex" : "none",
        // With no name to carry, the dark fade only has to hold the icons.
        "--pn-banner-scrim": theme.banner_name === "hide" ? "0.45" : "1",
        // The site tokens community sites read (<polynet-account> and the rails).
        "--polynet-accent": c.accent,
        "--polynet-on-accent": c.on_accent,
        "--polynet-surface": c.surface,
        "--polynet-text": c.text,
        "--polynet-muted": grey.muted,
        "--polynet-border": c.border,
        "--polynet-font": font(theme.font_body),
        "--polynet-radius": `${Math.min(theme.radius, 16)}px`,
    };
    const mixed = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
    const arx = {
        "--bg-app": c.background,
        "--bg-workspace": c.background,
        "--surface-workspace": c.background,
        "--bg-header": c.background,
        "--bg-panel": mixed(c.background, 60, c.surface),
        "--surface-panel": mixed(c.background, 60, c.surface),
        // The community's own sidebar; the community rail sits outside the scope.
        "--surface-nav": mixed(c.background, 60, c.surface),
        "--bg-card": c.surface,
        "--bg-card-solid": c.surface,
        "--surface-card": c.surface,
        "--bg-modal": c.surface,
        "--bg-input": c.surface,
        "--surface-input": c.surface,
        "--workspace-composer-bg": c.surface,
        "--composer-surface": c.surface,
        "--bg-card-alt": c.background,
        "--surface-card-alt": c.background,
        "--bg-card-hover": mixed(c.surface, 92, c.text),
        "--surface-card-hover": mixed(c.surface, 92, c.text),
        "--text-primary": c.text,
        "--text-ink-primary": c.text,
        "--text-selected": c.text,
        "--text-secondary": grey.secondary,
        "--text-ink-secondary": grey.secondary,
        "--text-muted": grey.muted,
        "--text-ink-muted": grey.muted,
        "--text-faint": grey.faint,
        "--text-ink-faint": grey.faint,
        "--icon-default": grey.muted,
        "--icon-hover": c.text,
        "--border-default": c.border,
        "--stroke-default": c.border,
        "--stroke-panel-edge": c.border,
        "--stroke-divider-accent": c.border,
        "--composer-border": c.border,
        "--scrollbar-thumb": c.border,
        "--border-muted": mixed(c.border, 60, c.background),
        "--stroke-muted": mixed(c.border, 60, c.background),
        "--border-strong": mixed(c.border, 50, c.text),
        "--stroke-strong": mixed(c.border, 50, c.text),
        "--accent-gold": c.accent,
        "--accent-brand": c.accent,
        "--accent-selection": c.accent,
        "--accent-agent": c.accent,
        "--accent-attention": c.accent,
        "--accent-agent-foreground": link,
        "--accent-success": c.accent,
        "--border-active": c.accent,
        "--stroke-active": c.accent,
        "--icon-active": c.accent,
        "--accent-gold-subtle": mixed(c.accent, 84, c.text),
        "--accent-agent-strong": mixed(c.accent, 84, c.text),
        "--accent-gold-glow": mixed(c.accent, 18, "transparent"),
        "--accent-agent-surface": mixed(c.accent, 14, c.surface),
        "--surface-selected": mixed(c.accent, 14, c.surface),
        "--stroke-selected": mixed(c.accent, 50, c.border),
        "--focus-ring": mixed(c.accent, 45, "transparent"),
        "--text-link": link,
        "--chat-link": link,
        "--text-link-hover": mixed(link, 84, c.text),
        "--chat-link-hover": mixed(link, 84, c.text),
        // Polynet defines these at :root from its own text colour, so without them
        // a dark community inside a light Polynet showed messages in Polynet's
        // dark ink on the community's dark cards.
        // Text on an accent fill (badges, active chips); unset, it fell back to white.
        "--text-on-accent": c.on_accent,
        "--chat-author-text": c.text,
        "--chat-body-text": c.text,
        "--chat-meta-text": grey.muted,
        "--chat-system-text": grey.faint,
        "--composer-focus-ring": mixed(c.text, 44, "transparent"),
        "--accent-primary": c.accent,
        "--surface-app": c.background,
        "--surface-header": c.background,
        "--bg-button": c.button,
        "--bg-button-hover": mixed(c.button, 88, c.background),
        "--bg-button-text": c.on_button,
        "--conversation-primary-action-surface": c.button,
        "--conversation-primary-action-hover-surface": mixed(c.button, 88, c.background),
        "--conversation-primary-action-foreground": c.on_button,
        "--hover-overlay": mixed(c.text, 6, "transparent"),
        "--active-overlay": mixed(c.text, 10, "transparent"),
        // Polynet's shared corner sizes, at the theme's radius. Scaled exactly like
        // --pn-radius-scale corners, so rows that use either one match.
        "--radius-sm": `calc(8px * var(--pn-radius-scale))`,
        "--radius-md": `calc(14px * var(--pn-radius-scale))`,
        "--radius-lg": `calc(16px * var(--pn-radius-scale))`,
        "--font-sans": font(theme.font_body),
        "--font-mono": font(theme.font_mono),
    };
    return { ...pn, ...arx, ...edgeVariables(theme.edges, c, scheme, mixed) };
}
// Lines, panel colours and lifts for the Edges setting. Every value is
// worked out from the community's own colours. Dark schemes and "soft" keep
// the old values; the edge variables are still set so the shared rules in
// styles/edges.css always have something to read.
function edgeVariables(edges, c, scheme, mixed) {
    const soft = {
        "--pn-edge-card-line": mixed(c.border, 72, "transparent"),
        "--pn-edge-lift": "none",
        "--pn-edge-canvas": c.background,
        "--pn-edge-gap": "0rem",
        "--pn-edge-panel-radius": "0rem",
        "--pn-edge-frame": "none",
    };
    if (scheme === "dark" || edges === "soft")
        return soft;
    const ink = (pct, base) => mixed(c.text, pct, base);
    if (edges === "sharp") {
        return {
            ...soft,
            "--border-default": ink(19, c.background),
            "--stroke-default": ink(19, c.background),
            "--stroke-panel-edge": ink(19, c.background),
            "--stroke-divider-accent": ink(19, c.background),
            "--composer-border": ink(26, c.background),
            "--border-muted": ink(12, c.background),
            "--stroke-muted": ink(12, c.background),
            "--border-strong": ink(34, c.background),
            "--stroke-strong": ink(34, c.background),
            "--pn-edge-card-line": ink(19, c.background),
        };
    }
    // Clean takes Sharper's line strength.
    const line = edges === "clean" ? 19 : 12;
    const panels = {
        "--border-default": ink(line, c.surface),
        "--stroke-default": ink(line, c.surface),
        "--stroke-panel-edge": ink(line, c.surface),
        "--stroke-divider-accent": ink(line, c.surface),
        "--composer-border": ink(line + 7, c.surface),
        "--border-muted": ink(line - 7, c.surface),
        "--stroke-muted": ink(line - 7, c.surface),
        "--border-strong": ink(line + 15, c.surface),
        "--stroke-strong": ink(line + 15, c.surface),
        "--bg-workspace": c.surface,
        "--surface-workspace": c.surface,
        "--bg-header": c.surface,
        "--surface-header": c.surface,
        "--bg-panel": c.surface,
        "--surface-panel": c.surface,
        "--surface-nav": c.surface,
        "--pn-edge-card-line": ink(line, c.surface),
        "--pn-edge-lift": `0 1px 2px ${ink(7, "transparent")}, 0 4px 14px ${ink(4, "transparent")}`,
    };
    if (edges === "clean") {
        return { ...soft, ...panels, "--bg-app": c.surface, "--surface-app": c.surface, "--pn-edge-canvas": c.surface };
    }
    return {
        ...soft,
        ...panels,
        "--pn-edge-canvas": mixed(c.accent, 7, ink(3, c.background)),
        "--pn-edge-gap": "0.5rem",
        "--pn-edge-panel-radius": "0.75rem",
        "--pn-edge-frame": `0 0 0 1px ${ink(9, "transparent")}, 0 1px 3px ${ink(6, "transparent")}`,
    };
}
function block(selector, vars, scheme) {
    const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
    return `${selector} {\n  color-scheme: ${scheme};\n${lines.join("\n")}\n}`;
}
// The CSS for one community's area. `scope` is the selector of the element
// that wraps the community's content (never :root or the app frame). With
// both schemes, the member's own Light/Dark choice (data-theme on <html>)
// picks one; with one scheme, the community always looks that way.
export function compileCommunityThemeCss(theme, scope) {
    const schemes = ["light", "dark"].filter((scheme) => theme.schemes[scheme]);
    if (schemes.length === 0)
        throw new Error("The theme has no colour scheme.");
    const parts = schemes.length === 1
        ? [block(scope, communityThemeVariables(theme, schemes[0]), schemes[0])]
        : [
            block(scope, communityThemeVariables(theme, "dark"), "dark"),
            block(`:root[data-theme="light"] ${scope}`, communityThemeVariables(theme, "light"), "light"),
        ];
    // A cover's framing is written inline (StableFramedMedia), so showing it
    // whole has to outrank that framing. The bands around it are the media
    // plate when the theme has one (images drawn on white get white-ish bands),
    // otherwise the cover's own background.
    if (theme.course_cover_fit === "whole") {
        parts.push(`${scope} .resource-course-card-cover-image {\n  inset: 0 !important;\n  width: 100% !important;\n  height: 100% !important;\n  object-fit: contain !important;\n  padding: 0 !important;\n}`);
    }
    return `/* Community theme v${theme.version}; compiled, do not edit. */\n${parts.join("\n\n")}\n`;
}
// The Google Fonts stylesheet the theme needs, or null when it only uses
// Polynet's and the device's own faces.
export function communityThemeFontStylesheetUrl(theme) {
    const families = [...new Set([theme.font_body, theme.font_heading, theme.font_mono])]
        .map((name) => COMMUNITY_THEME_FONTS[name])
        .filter((font) => font?.source === "google" && font.googleFamily)
        .map((font) => `family=${encodeURIComponent(font.googleFamily).replace(/%20/g, "+").replace(/%3A/g, ":").replace(/%3B/g, ";").replace(/%40/g, "@")}`);
    return families.length ? `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap` : null;
}
