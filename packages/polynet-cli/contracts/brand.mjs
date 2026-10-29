// Generated from shared/communityBrand.ts by tools/build-contracts.mjs. Do not edit.
// A community's brand: what it should feel like, in the founder's own words
// and choices, stored on Polynet and read by every template, agent and design
// tool before it designs anything. Each community keeps its own (one founder
// can run the same green light in one community and dark in another). The
// community's theme is derived from it (themeFromCommunityBrand). Every field
// is optional: a brand fills in over time.
import { COMMUNITY_THEME_FONTS, contrastRatio, mixHex, nearestPassingColor, normalizeCommunityTheme, } from "./theme.mjs";
export const COMMUNITY_BRAND_VERSION = 1;
export const COMMUNITY_BRAND_COLOUR_ROLES = ["primary", "accent", "neutral", "avoid"];
export const COMMUNITY_BRAND_FONT_USES = ["headings", "body", "both"];
export const EMPTY_COMMUNITY_BRAND = { version: 1 };
const LIMITS = {
    words: { items: 3, chars: 24 },
    feels_like: 200,
    colours: 12,
    colour_note: 120,
    fonts: 4,
    photos: 8,
    phrases: { items: 12, chars: 160 },
    dos: { items: 12, chars: 200 },
    donts: { items: 12, chars: 200 },
    notes: 2000,
    url: 2048,
};
const KNOWN_KEYS = ["version", "words", "feels_like", "colours", "fonts", "logo", "photos", "phrases", "dos", "donts", "notes"];
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(raw, path, max, problems) {
    if (raw === undefined)
        return undefined;
    if (typeof raw !== "string" || !raw.trim()) {
        problems.push({ path, message: "Must be some text." });
        return undefined;
    }
    if (raw.trim().length > max)
        problems.push({ path, message: `Keep it to ${max} characters.` });
    return raw.trim();
}
function textList(raw, path, items, chars, problems) {
    if (raw === undefined)
        return undefined;
    if (!Array.isArray(raw)) {
        problems.push({ path, message: "Must be a list of text." });
        return undefined;
    }
    if (raw.length > items)
        problems.push({ path, message: `At most ${items}.` });
    return raw.map((entry, index) => text(entry, `${path}[${index}]`, chars, problems)).filter((entry) => Boolean(entry));
}
function url(raw, path, problems) {
    const value = text(raw, path, LIMITS.url, problems);
    if (value && !/^https:\/\/\S+$/.test(value))
        problems.push({ path, message: "Must be an https:// link." });
    return value;
}
/** Checks a brand. Unknown keys are errors so a typo never silently drops a choice. */
export function normalizeCommunityBrand(raw) {
    const problems = [];
    if (!isRecord(raw))
        return { ok: false, problems: [{ path: "", message: "A brand is an object." }] };
    for (const key of Object.keys(raw)) {
        if (!KNOWN_KEYS.includes(key))
            problems.push({ path: key, message: `"${key}" isn't a brand field. Use: ${KNOWN_KEYS.slice(1).join(", ")}.` });
    }
    if (raw.version !== undefined && raw.version !== COMMUNITY_BRAND_VERSION)
        problems.push({ path: "version", message: "Use version 1." });
    const brand = { version: 1 };
    const words = textList(raw.words, "words", LIMITS.words.items, LIMITS.words.chars, problems);
    if (words?.length)
        brand.words = words;
    const feelsLike = text(raw.feels_like, "feels_like", LIMITS.feels_like, problems);
    if (feelsLike)
        brand.feels_like = feelsLike;
    if (raw.colours !== undefined) {
        if (!Array.isArray(raw.colours))
            problems.push({ path: "colours", message: "Must be a list of { hex, role, note }." });
        else {
            if (raw.colours.length > LIMITS.colours)
                problems.push({ path: "colours", message: `At most ${LIMITS.colours}.` });
            const colours = [];
            raw.colours.forEach((entry, index) => {
                const path = `colours[${index}]`;
                if (!isRecord(entry))
                    return problems.push({ path, message: "Must be { hex, role, note }." });
                for (const key of Object.keys(entry))
                    if (!["hex", "role", "note"].includes(key))
                        problems.push({ path: `${path}.${key}`, message: "Use hex, role and note." });
                const hex = typeof entry.hex === "string" && /^#[0-9a-f]{6}$/i.test(entry.hex.trim()) ? entry.hex.trim().toUpperCase() : null;
                if (!hex)
                    problems.push({ path: `${path}.hex`, message: "Must be a hex colour like #2D8C3C." });
                const role = COMMUNITY_BRAND_COLOUR_ROLES.find((value) => value === entry.role);
                if (!role)
                    problems.push({ path: `${path}.role`, message: `Use one of: ${COMMUNITY_BRAND_COLOUR_ROLES.join(", ")}.` });
                const note = text(entry.note, `${path}.note`, LIMITS.colour_note, problems);
                if (hex && role)
                    colours.push({ hex, role, ...(note ? { note } : {}) });
            });
            if (colours.length)
                brand.colours = colours;
        }
    }
    if (raw.fonts !== undefined) {
        if (!Array.isArray(raw.fonts))
            problems.push({ path: "fonts", message: "Must be a list of { name, use }." });
        else {
            if (raw.fonts.length > LIMITS.fonts)
                problems.push({ path: "fonts", message: `At most ${LIMITS.fonts}.` });
            const fonts = [];
            raw.fonts.forEach((entry, index) => {
                const path = `fonts[${index}]`;
                if (!isRecord(entry))
                    return problems.push({ path, message: "Must be { name, use }." });
                for (const key of Object.keys(entry))
                    if (!["name", "use"].includes(key))
                        problems.push({ path: `${path}.${key}`, message: "Use name and use." });
                const name = text(entry.name, `${path}.name`, 60, problems);
                const use = COMMUNITY_BRAND_FONT_USES.find((value) => value === entry.use);
                if (!use)
                    problems.push({ path: `${path}.use`, message: `Use one of: ${COMMUNITY_BRAND_FONT_USES.join(", ")}.` });
                if (name && use)
                    fonts.push({ name, use });
            });
            if (fonts.length)
                brand.fonts = fonts;
        }
    }
    const logo = url(raw.logo, "logo", problems);
    if (logo)
        brand.logo = logo;
    if (raw.photos !== undefined) {
        if (!Array.isArray(raw.photos))
            problems.push({ path: "photos", message: "Must be a list of https:// links." });
        else {
            if (raw.photos.length > LIMITS.photos)
                problems.push({ path: "photos", message: `At most ${LIMITS.photos}.` });
            const photos = raw.photos.map((entry, index) => url(entry, `photos[${index}]`, problems)).filter((entry) => Boolean(entry));
            if (photos.length)
                brand.photos = photos;
        }
    }
    for (const key of ["phrases", "dos", "donts"]) {
        const list = textList(raw[key], key, LIMITS[key].items, LIMITS[key].chars, problems);
        if (list?.length)
            brand[key] = list;
    }
    const notes = text(raw.notes, "notes", LIMITS.notes, problems);
    if (notes)
        brand.notes = notes;
    return problems.length ? { ok: false, problems } : { ok: true, brand };
}
function colourFor(brand, role) {
    return brand.colours?.find((colour) => colour.role === role)?.hex ?? null;
}
function fontFor(brand, use) {
    const font = brand.fonts?.find((entry) => (entry.use === use || entry.use === "both") && COMMUNITY_THEME_FONTS[entry.name]);
    return font?.name ?? null;
}
const LABEL_LIGHT = "#FFFFFF";
const LABEL_DARK = "#0B0B0B";
// The label colour that reads best on a fill, and the fill nudged until it
// reaches 4.5:1 against that label (a brand green under white text, say).
function fillWithLabel(fill) {
    const label = contrastRatio(fill, LABEL_LIGHT) >= contrastRatio(fill, LABEL_DARK) ? LABEL_LIGHT : LABEL_DARK;
    return { fill: nearestPassingColor(fill, label, 4.5) ?? fill, label };
}
function schemeFromBrand(brand, scheme, base) {
    const primary = colourFor(brand, "primary") ?? colourFor(brand, "accent") ?? base.accent;
    const accentColour = colourFor(brand, "accent") ?? primary;
    const neutral = colourFor(brand, "neutral");
    const neutralIsLight = neutral ? contrastRatio(neutral, "#000000") > contrastRatio(neutral, "#FFFFFF") : null;
    // A light neutral is the light page; a dark one is the dark page.
    const background = scheme === "light"
        ? (neutral && neutralIsLight ? neutral : "#F6F7F5")
        : (neutral && !neutralIsLight ? neutral : "#0E100F");
    const text = scheme === "light" ? "#14171A" : "#F2F4F2";
    const surface = scheme === "light"
        ? (background.toUpperCase() === "#FFFFFF" ? "#FFFFFF" : "#FFFFFF")
        : mixHex(background, "#FFFFFF", 0.06) ?? background;
    const page = scheme === "light" && background.toUpperCase() === "#FFFFFF" ? (mixHex("#FFFFFF", primary, 0.03) ?? background) : background;
    const muted = nearestPassingColor(mixHex(text, surface, 0.42) ?? text, surface, 4.5) ?? text;
    const border = mixHex(surface, text, scheme === "light" ? 0.12 : 0.16) ?? base.border;
    const button = fillWithLabel(primary);
    const accent = fillWithLabel(accentColour);
    // The accent also marks controls on the page: keep it at 3:1 there.
    const accentFill = nearestPassingColor(accent.fill, page, 3) ?? accent.fill;
    const accentPair = contrastRatio(accentFill, accent.label) >= 4.5 ? { fill: accentFill, label: accent.label } : fillWithLabel(accentFill);
    return {
        background: page, surface, text, muted, border,
        accent: accentPair.fill, on_accent: accentPair.label,
        button: button.fill, on_button: button.label,
    };
}
/**
 * The brand as a community theme: brand colours and fonts on top of
 * `base` (a template's theme, or Polynet's), in the scheme(s) asked for. One
 * scheme fixes the community's look; "both" follows each member's choice.
 * The result always passes the theme contract (contrast included).
 */
export function themeFromCommunityBrand(brand, base, schemes) {
    const wanted = schemes === "both" ? ["light", "dark"] : [schemes];
    const baseScheme = (scheme) => base.schemes[scheme] ?? base.schemes.light ?? base.schemes.dark;
    const theme = {
        ...base,
        schemes: Object.fromEntries(wanted.map((scheme) => [scheme, schemeFromBrand(brand, scheme, baseScheme(scheme))])),
        font_heading: fontFor(brand, "headings") ?? base.font_heading,
        font_body: fontFor(brand, "body") ?? base.font_body,
        // A brand photographed on white needs a light plate in a dark room.
        media_plate: wanted.length === 1 && wanted[0] === "dark" ? "light" : base.media_plate,
    };
    const checked = normalizeCommunityTheme(theme);
    return checked.ok ? checked.theme : base;
}
/** Brand colours the theme's accent and button sit far from, for `polynet check` warnings. */
export function themeDriftsFromBrand(theme, brand) {
    const brandColours = (brand.colours ?? []).filter((colour) => colour.role !== "avoid").map((colour) => colour.hex);
    const avoid = (brand.colours ?? []).filter((colour) => colour.role === "avoid").map((colour) => colour.hex);
    if (!brandColours.length && !avoid.length)
        return [];
    const warnings = [];
    const distance = (a, b) => {
        const [x, y] = [a, b].map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
        return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    for (const [scheme, colors] of Object.entries(theme.schemes)) {
        if (!colors)
            continue;
        for (const key of ["accent", "button"]) {
            const value = colors[key];
            if (brandColours.length && Math.min(...brandColours.map((hex) => distance(hex, value))) > 90) {
                warnings.push(`schemes.${scheme}.${key} ${value} is far from every brand colour (${brandColours.join(", ")}).`);
            }
            if (avoid.some((hex) => distance(hex, value) < 40)) {
                warnings.push(`schemes.${scheme}.${key} ${value} is close to a colour the brand avoids.`);
            }
        }
    }
    return warnings;
}
