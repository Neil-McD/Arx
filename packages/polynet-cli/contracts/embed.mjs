// Generated from shared/communityEmbed.ts by tools/build-contracts.mjs. Do not edit.
// Interactive HTML in lessons. A lesson places a widget with a fenced block:
//
//   ```polynet-embed
//   src: embeds/xray/business-map.html
//   title: Business map
//   height: 900
//   fallback: media/xray/business-map.png
//   ```
//
// The widget is a file the founder deployed to their community site. Polynet
// shows it in a sandboxed frame with an opaque origin: it can run its own
// scripts but cannot reach the member's session, the app, or other sites'
// storage. It talks to the page only through /__polynet/embed.js, whose
// messages are defined here.
export const COMMUNITY_EMBED_LANGUAGE = "polynet-embed";
export const COMMUNITY_EMBED_MIN_HEIGHT = 120;
export const COMMUNITY_EMBED_MAX_HEIGHT = 6000;
export const COMMUNITY_EMBED_DEFAULT_HEIGHT = 600;
export const COMMUNITY_EMBED_MAX_KEY_LENGTH = 100;
export const COMMUNITY_EMBED_MAX_VALUE_LENGTH = 64 * 1024;
// A path inside the community site: letters, digits and - _ . / only, no
// "..", no leading slash, no scheme. Widgets end in .html; fallbacks are images.
const SITE_PATH = /^(?!.*\.\.)(?!\/)[A-Za-z0-9_\-./]+$/;
const IMAGE_PATH = /\.(png|jpe?g|webp|gif|svg)$/i;
export function isCommunitySitePath(path) {
    return SITE_PATH.test(path) && !path.includes("//");
}
export function parseCommunityEmbedBlock(raw) {
    const fields = new Map();
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const separator = trimmed.indexOf(":");
        if (separator <= 0)
            return { ok: false, message: `Each line is "name: value". This one isn't: ${trimmed}` };
        fields.set(trimmed.slice(0, separator).trim().toLowerCase(), trimmed.slice(separator + 1).trim());
    }
    const src = fields.get("src") ?? "";
    if (!src)
        return { ok: false, message: "Add src: the widget's path on your community site, like embeds/quiz.html." };
    if (!isCommunitySitePath(src) || !/\.html?$/i.test(src)) {
        return { ok: false, message: `src must be an .html file on your community site, like embeds/quiz.html. Got: ${src}` };
    }
    const fallback = fields.get("fallback") || null;
    if (fallback && (!isCommunitySitePath(fallback) || !IMAGE_PATH.test(fallback))) {
        return { ok: false, message: `fallback must be an image on your community site, like media/quiz.png. Got: ${fallback}` };
    }
    const rawHeight = fields.get("height");
    const height = rawHeight === undefined ? COMMUNITY_EMBED_DEFAULT_HEIGHT : Number(rawHeight);
    if (!Number.isInteger(height) || height < COMMUNITY_EMBED_MIN_HEIGHT || height > COMMUNITY_EMBED_MAX_HEIGHT) {
        return { ok: false, message: `height is the starting height in pixels, ${COMMUNITY_EMBED_MIN_HEIGHT} to ${COMMUNITY_EMBED_MAX_HEIGHT}.` };
    }
    const title = (fields.get("title") || src.split("/").pop() || "Interactive").slice(0, 120);
    return { ok: true, block: { src, title, height, fallback } };
}
export function readCommunityEmbedChildMessage(data) {
    if (!data || typeof data !== "object")
        return null;
    const message = data;
    if (message.polynetEmbed !== 1)
        return null;
    const validKey = (key) => typeof key === "string" && key.length > 0 && key.length <= COMMUNITY_EMBED_MAX_KEY_LENGTH;
    const validId = (id) => typeof id === "number" && Number.isInteger(id);
    switch (message.type) {
        case "ready":
            return { polynetEmbed: 1, type: "ready" };
        case "resize":
            return typeof message.height === "number" && Number.isFinite(message.height)
                ? { polynetEmbed: 1, type: "resize", height: message.height }
                : null;
        case "load":
            return validId(message.id) && validKey(message.key)
                ? { polynetEmbed: 1, type: "load", id: message.id, key: message.key }
                : null;
        case "save":
            return validId(message.id) && validKey(message.key) && typeof message.value === "string"
                ? { polynetEmbed: 1, type: "save", id: message.id, key: message.key, value: message.value }
                : null;
        default:
            return null;
    }
}
export function clampCommunityEmbedHeight(height) {
    return Math.min(COMMUNITY_EMBED_MAX_HEIGHT, Math.max(COMMUNITY_EMBED_MIN_HEIGHT, Math.ceil(height)));
}
/** The theme variables a widget receives: the community's public --pn-* set. */
export const COMMUNITY_EMBED_THEME_VARIABLES = [
    "--pn-background",
    "--pn-surface",
    "--pn-text",
    "--pn-muted",
    "--pn-border",
    "--pn-accent",
    "--pn-on-accent",
    "--pn-button",
    "--pn-on-button",
    "--pn-link",
    "--pn-font-body",
    "--pn-font-heading",
    "--pn-font-mono",
    "--pn-radius",
    "--pn-radius-card",
    "--pn-radius-button",
];
