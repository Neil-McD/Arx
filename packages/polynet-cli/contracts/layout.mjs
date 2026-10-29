// Generated from shared/communityLayout.ts by tools/build-contracts.mjs. Do not edit.
// A community's layout: where its navigation sits, which tabs it shows and in
// what order, and how the community page is arranged. Like the theme
// (shared/communityTheme.ts) it is data a founder or their agent edits, checked
// here before it is stored. The two are separate records, so changing one
// never resets the other.
//
// Only Polynet systems that already exist are offered: channels and posts,
// courses (resources), events, members, the community agent and the public
// About page. The community rail on the far left is Polynet's own and is never
// part of a layout. Owner tools (workflows, analytics, settings) are pinned:
// managers always see them after the community's own tabs.
export const COMMUNITY_LAYOUT_VERSION = 1;
export const COMMUNITY_LAYOUT_TABS = ["chat", "resources", "events", "members", "agent", "about"];
export const COMMUNITY_LAYOUT_POSITIONS = ["top", "side"];
export const COMMUNITY_LAYOUT_ASIDE_BLOCKS = ["community_card", "upcoming_events"];
export const COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT = 12;
export const COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT = 20_000;
const MAX_CAPTION_LENGTH = 140;
export const COMMUNITY_LAYOUT_TAB_DEFAULT_LABELS = {
    chat: "Chat",
    resources: "Knowledge",
    events: "Events",
    members: "Members",
    agent: "Agent",
    about: "About",
};
// Polynet's own layout, so a community with no layout record looks as it always has.
export const DEFAULT_COMMUNITY_LAYOUT = {
    version: 1,
    navigation: {
        position: "side",
        tabs: [
            { tab: "chat", label: "", hidden: false },
            { tab: "agent", label: "", hidden: false },
            { tab: "resources", label: "", hidden: false },
            { tab: "events", label: "", hidden: false },
            { tab: "members", label: "", hidden: true },
            { tab: "about", label: "", hidden: true },
        ],
        home: "chat",
        member_choice: [],
    },
    width: "wide",
    pages: {
        chat: { presentation: "messages", aside: [] },
        about: { presentation: "page", media: [], text: "", show_members: true },
    },
};
const MAX_LABEL_LENGTH = 24;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function unknownKeys(raw, known, path, problems) {
    for (const key of Object.keys(raw)) {
        if (!known.includes(key)) {
            problems.push({ path: path ? `${path}.${key}` : key, message: `"${key}" isn't a layout setting here.` });
        }
    }
}
function oneOf(value, allowed, path, problems) {
    if (typeof value === "string" && allowed.includes(value))
        return value;
    problems.push({ path, message: `${path} is one of: ${allowed.join(", ")}.` });
    return null;
}
function normalizeTabs(raw, problems) {
    const path = "navigation.tabs";
    if (!Array.isArray(raw) || raw.length === 0) {
        problems.push({ path, message: "List the community's tabs in order." });
        return null;
    }
    const seen = new Set();
    const tabs = [];
    raw.forEach((entry, index) => {
        const at = `${path}.${index}`;
        if (!isRecord(entry)) {
            problems.push({ path: at, message: "Each tab is an object with a \"tab\"." });
            return;
        }
        unknownKeys(entry, ["tab", "label", "hidden"], at, problems);
        const tab = oneOf(entry.tab, COMMUNITY_LAYOUT_TABS, `${at}.tab`, problems);
        if (!tab)
            return;
        if (seen.has(tab)) {
            problems.push({ path: `${at}.tab`, message: `"${tab}" is listed twice.` });
            return;
        }
        seen.add(tab);
        let label = "";
        if (entry.label !== undefined) {
            if (typeof entry.label !== "string" || entry.label.trim().length > MAX_LABEL_LENGTH) {
                problems.push({ path: `${at}.label`, message: `A tab label is text of up to ${MAX_LABEL_LENGTH} characters.` });
            }
            else {
                label = entry.label.trim();
            }
        }
        let hidden = false;
        if (entry.hidden !== undefined) {
            if (typeof entry.hidden !== "boolean")
                problems.push({ path: `${at}.hidden`, message: "hidden is true or false." });
            else
                hidden = entry.hidden;
        }
        tabs.push({ tab, label, hidden });
    });
    // Tabs left out keep working by link but are not shown, so a layout written
    // before a tab existed still renders.
    for (const tab of COMMUNITY_LAYOUT_TABS) {
        if (!seen.has(tab))
            tabs.push({ tab, label: "", hidden: true });
    }
    return tabs;
}
function isWebAddress(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    }
    catch {
        return false;
    }
}
// The video links the gallery plays: YouTube, Vimeo, Loom and Wistia over
// https, plus Descript share links.
export function isCommunityLayoutVideoUrl(raw) {
    let url;
    try {
        url = new URL(raw.trim());
    }
    catch {
        return false;
    }
    if (url.protocol !== "https:")
        return false;
    const host = url.hostname.toLowerCase();
    const on = (domain) => host === domain || host.endsWith(`.${domain}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "youtu.be")
        return Boolean(parts[0]);
    if (on("youtube.com") || on("youtube-nocookie.com")) {
        if (url.pathname === "/watch" && url.searchParams.get("v"))
            return true;
        return ["embed", "shorts", "live", "v"].includes(parts[0] ?? "") && Boolean(parts[1]);
    }
    if (on("vimeo.com"))
        return parts.some((part) => /^\d{6,}$/.test(part));
    if (on("loom.com"))
        return ["share", "embed"].includes(parts[0] ?? "") && Boolean(parts[1]);
    if (host === "share.descript.com")
        return ["view", "embed"].includes(parts[0] ?? "") && (parts[1] ?? "").length >= 6;
    if (on("wistia.com") || on("wistia.net")) {
        if (url.searchParams.get("wvideo"))
            return true;
        return parts.some((part, index) => ["medias", "iframe"].includes(part) && Boolean(parts[index + 1]));
    }
    return false;
}
function normalizeAboutMedia(raw, problems) {
    if (!Array.isArray(raw)) {
        problems.push({ path: "pages.about.media", message: "media is a list of { kind, url, caption }." });
        return [];
    }
    if (raw.length > COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT) {
        problems.push({ path: "pages.about.media", message: `Up to ${COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT} pictures and videos.` });
    }
    const media = [];
    raw.slice(0, COMMUNITY_LAYOUT_ABOUT_MEDIA_LIMIT).forEach((entry, index) => {
        const path = `pages.about.media.${index}`;
        if (!isRecord(entry)) {
            problems.push({ path, message: "Each item is { kind, url, caption }." });
            return;
        }
        unknownKeys(entry, ["kind", "url", "caption"], path, problems);
        const kind = oneOf(entry.kind, ["image", "video"], `${path}.kind`, problems);
        const url = typeof entry.url === "string" ? entry.url.trim() : "";
        const caption = entry.caption === undefined ? "" : typeof entry.caption === "string" ? entry.caption.trim() : null;
        if (!kind)
            return;
        if (!url || url.length > 2048 || !isWebAddress(url)) {
            problems.push({ path: `${path}.url`, message: "url is a web address (https://…)." });
            return;
        }
        if (kind === "video" && !isCommunityLayoutVideoUrl(url)) {
            problems.push({ path: `${path}.url`, message: "Videos are YouTube, Vimeo, Loom, Wistia or Descript links." });
            return;
        }
        if (caption === null || caption.length > MAX_CAPTION_LENGTH) {
            problems.push({ path: `${path}.caption`, message: `caption is text up to ${MAX_CAPTION_LENGTH} characters.` });
            return;
        }
        media.push({ kind, url, caption });
    });
    return media;
}
export function normalizeCommunityLayout(raw) {
    const problems = [];
    if (!isRecord(raw))
        return { ok: false, problems: [{ path: "", message: "A layout is a JSON object." }] };
    unknownKeys(raw, ["version", "navigation", "width", "pages"], "", problems);
    if (raw.version !== undefined && raw.version !== COMMUNITY_LAYOUT_VERSION) {
        problems.push({ path: "version", message: `Only layout version ${COMMUNITY_LAYOUT_VERSION} is supported.` });
    }
    const layout = {
        version: 1,
        navigation: { ...DEFAULT_COMMUNITY_LAYOUT.navigation, tabs: DEFAULT_COMMUNITY_LAYOUT.navigation.tabs.map((t) => ({ ...t })) },
        width: DEFAULT_COMMUNITY_LAYOUT.width,
        pages: {
            chat: { ...DEFAULT_COMMUNITY_LAYOUT.pages.chat, aside: [] },
            about: { ...DEFAULT_COMMUNITY_LAYOUT.pages.about, media: [] },
        },
    };
    if (raw.navigation !== undefined) {
        if (!isRecord(raw.navigation)) {
            problems.push({ path: "navigation", message: "navigation is an object." });
        }
        else {
            const nav = raw.navigation;
            unknownKeys(nav, ["position", "tabs", "home", "member_choice"], "navigation", problems);
            if (nav.position !== undefined) {
                layout.navigation.position = oneOf(nav.position, ["side", "top"], "navigation.position", problems) ?? layout.navigation.position;
            }
            if (nav.tabs !== undefined) {
                layout.navigation.tabs = normalizeTabs(nav.tabs, problems) ?? layout.navigation.tabs;
            }
            if (nav.home !== undefined) {
                layout.navigation.home = oneOf(nav.home, COMMUNITY_LAYOUT_TABS, "navigation.home", problems) ?? layout.navigation.home;
            }
        }
    }
    const rawChoice = isRecord(raw.navigation) ? raw.navigation.member_choice : undefined;
    if (rawChoice === undefined) {
        layout.navigation.member_choice = layout.navigation.position === "top" ? ["top", "side"] : [];
    }
    else if (!Array.isArray(rawChoice)) {
        problems.push({ path: "navigation.member_choice", message: "member_choice is a list of positions: top, side." });
    }
    else {
        const choice = [];
        rawChoice.forEach((entry, index) => {
            const value = oneOf(entry, COMMUNITY_LAYOUT_POSITIONS, `navigation.member_choice.${index}`, problems);
            if (value && !choice.includes(value))
                choice.push(value);
        });
        if (choice.length > 0 && !choice.includes(layout.navigation.position)) {
            problems.push({ path: "navigation.member_choice", message: "Members can always keep the owner's layout: include its position." });
        }
        layout.navigation.member_choice = choice.length > 1 ? choice : [];
    }
    const home = layout.navigation.tabs.find((entry) => entry.tab === layout.navigation.home);
    if (!home || home.hidden) {
        problems.push({ path: "navigation.home", message: "The home tab has to be one of the tabs members can see." });
    }
    if (!layout.navigation.tabs.some((entry) => !entry.hidden)) {
        problems.push({ path: "navigation.tabs", message: "Show at least one tab." });
    }
    if (raw.width !== undefined) {
        layout.width = oneOf(raw.width, ["wide", "centered"], "width", problems) ?? layout.width;
    }
    if (raw.pages !== undefined) {
        if (!isRecord(raw.pages)) {
            problems.push({ path: "pages", message: "pages is an object." });
        }
        else {
            unknownKeys(raw.pages, ["chat", "about"], "pages", problems);
            const about = raw.pages.about;
            if (about !== undefined) {
                if (!isRecord(about)) {
                    problems.push({ path: "pages.about", message: "pages.about is an object." });
                }
                else {
                    unknownKeys(about, ["presentation", "media", "text", "show_members"], "pages.about", problems);
                    if (about.show_members !== undefined) {
                        if (typeof about.show_members === "boolean")
                            layout.pages.about.show_members = about.show_members;
                        else
                            problems.push({ path: "pages.about.show_members", message: "show_members is true or false." });
                    }
                    if (about.presentation !== undefined) {
                        layout.pages.about.presentation =
                            oneOf(about.presentation, ["page", "funnel"], "pages.about.presentation", problems) ?? layout.pages.about.presentation;
                    }
                    if (about.media !== undefined) {
                        layout.pages.about.media = normalizeAboutMedia(about.media, problems);
                    }
                    if (about.text !== undefined) {
                        if (typeof about.text !== "string") {
                            problems.push({ path: "pages.about.text", message: "text is Markdown text." });
                        }
                        else if (about.text.length > COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT) {
                            problems.push({ path: "pages.about.text", message: `Keep the text under ${COMMUNITY_LAYOUT_ABOUT_TEXT_LIMIT.toLocaleString("en-US")} characters.` });
                        }
                        else {
                            layout.pages.about.text = about.text.trim();
                        }
                    }
                }
            }
            const chat = raw.pages.chat;
            if (chat !== undefined) {
                if (!isRecord(chat)) {
                    problems.push({ path: "pages.chat", message: "pages.chat is an object." });
                }
                else {
                    unknownKeys(chat, ["presentation", "aside"], "pages.chat", problems);
                    if (chat.presentation !== undefined) {
                        layout.pages.chat.presentation =
                            oneOf(chat.presentation, ["messages", "posts"], "pages.chat.presentation", problems) ?? layout.pages.chat.presentation;
                    }
                    if (chat.aside !== undefined) {
                        if (!Array.isArray(chat.aside)) {
                            problems.push({ path: "pages.chat.aside", message: "aside is a list of blocks." });
                        }
                        else {
                            const aside = [];
                            chat.aside.forEach((block, index) => {
                                const value = oneOf(block, COMMUNITY_LAYOUT_ASIDE_BLOCKS, `pages.chat.aside.${index}`, problems);
                                if (!value)
                                    return;
                                if (aside.includes(value))
                                    problems.push({ path: `pages.chat.aside.${index}`, message: `"${value}" is listed twice.` });
                                else
                                    aside.push(value);
                            });
                            layout.pages.chat.aside = aside;
                        }
                    }
                }
            }
        }
    }
    return problems.length ? { ok: false, problems } : { ok: true, layout };
}
// What a member sees: their own pick when the owner allows it, else the
// owner's layout. A switch keeps the owner's tabs, labels and About page and
// changes only the arrangement: "top" is the tab bar with the posts feed and
// side blocks, "side" is the channel column with the chat timeline.
export function layoutForMemberChoice(layout, choice) {
    if (!choice || choice === layout.navigation.position || !layout.navigation.member_choice.includes(choice))
        return layout;
    const chat = choice === "top"
        ? { presentation: "posts", aside: ["community_card", "upcoming_events"] }
        : { presentation: "messages", aside: [] };
    return {
        ...layout,
        navigation: { ...layout.navigation, position: choice },
        width: choice === "top" ? "centered" : "wide",
        pages: { ...layout.pages, chat },
    };
}
// Classroom's Community tab follows the theme's classroom_chat, whatever the
// layout record says. A layout moved to the top without
// side blocks gets Classroom's usual ones.
export function layoutForClassroomChat(layout, style) {
    if (layout.navigation.position !== "top")
        return layout;
    const chat = style === "posts"
        ? { presentation: "posts", aside: layout.pages.chat.aside.length ? layout.pages.chat.aside : ["community_card", "upcoming_events"] }
        : { presentation: "messages", aside: layout.pages.chat.aside };
    if (chat.presentation === layout.pages.chat.presentation && chat.aside === layout.pages.chat.aside)
        return layout;
    return { ...layout, pages: { ...layout.pages, chat } };
}
export function communityLayoutTabLabel(layout, tab) {
    const entry = layout.navigation.tabs.find((candidate) => candidate.tab === tab);
    return entry?.label || COMMUNITY_LAYOUT_TAB_DEFAULT_LABELS[tab];
}
export function visibleCommunityLayoutTabs(layout) {
    return layout.navigation.tabs.filter((entry) => !entry.hidden);
}
