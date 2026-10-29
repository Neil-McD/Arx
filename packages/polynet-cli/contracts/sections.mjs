// Generated from shared/communityLessonSections.ts by tools/build-contracts.mjs. Do not edit.
// A long lesson is one page in sections. Each `## ` heading starts a section;
// the text before the first heading is the opening section. Members read the
// whole lesson on one page with a section list, agents read it a section at a
// time, and every section fits the size one change or one read can carry, so
// a lesson can be long without anything being cut off.
//
// The server refuses a body that breaks these limits instead of truncating it.
// The CLI copies this file (packages/polynet-cli/contracts/sections.mjs) so
// `polynet check` refuses the same bodies before they are pushed.
/** The most one section can hold: what one agent read or one change carries. */
export const COMMUNITY_LESSON_SECTION_MAX_CHARS = 20_000;
export const COMMUNITY_LESSON_MAX_SECTIONS = 24;
/** The most a page body can hold, in sections. */
export const COMMUNITY_RESOURCE_BODY_MAX_CHARS = 240_000;
const FENCE = /^(\s{0,3})(`{3,}|~{3,})/;
const SECTION_HEADING = /^## +(.+?)\s*#*\s*$/;
function slug(text) {
    return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
}
/** Splits a body into sections at its `## ` headings, ignoring headings inside code fences. */
export function communityLessonSections(bodyMd) {
    const body = String(bodyMd ?? "");
    if (!body)
        return [];
    const starts = [{ offset: 0, heading: null }];
    let fence = null;
    let offset = 0;
    for (const line of body.split("\n")) {
        const open = FENCE.exec(line);
        if (fence) {
            if (open && open[2][0] === fence[0] && open[2].length >= fence.length)
                fence = null;
        }
        else if (open) {
            fence = open[2];
        }
        else {
            const heading = SECTION_HEADING.exec(line);
            if (heading && offset > 0)
                starts.push({ offset, heading: heading[1] });
            else if (heading)
                starts[0].heading = heading[1];
        }
        offset += line.length + 1;
    }
    const used = new Map();
    return starts.map((start, index) => {
        const end = index + 1 < starts.length ? starts[index + 1].offset : body.length;
        const base = start.heading ? slug(start.heading) : "start";
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        return { index, heading: start.heading, id: count ? `${base}-${count + 1}` : base, offset: start.offset, chars: end - start.offset };
    }).filter((section) => section.chars > 0 && body.slice(section.offset, section.offset + section.chars).trim());
}
/** The section texts, in order. */
export function communityLessonSectionTexts(bodyMd) {
    const body = String(bodyMd ?? "");
    return communityLessonSections(body).map((section) => ({ ...section, text: body.slice(section.offset, section.offset + section.chars) }));
}
const formatChars = (chars) => chars.toLocaleString("en-US");
/** What stops a body from being saved whole. Empty means it fits. */
export function checkCommunityResourceBody(bodyMd) {
    const body = String(bodyMd ?? "");
    const problems = [];
    if (body.length > COMMUNITY_RESOURCE_BODY_MAX_CHARS) {
        problems.push({ code: "body_too_long",
            message: `This page is ${formatChars(body.length)} characters; a page can hold up to ${formatChars(COMMUNITY_RESOURCE_BODY_MAX_CHARS)}. Move part of it to its own lesson.` });
    }
    const sections = communityLessonSections(body);
    if (sections.length > COMMUNITY_LESSON_MAX_SECTIONS) {
        problems.push({ code: "too_many_sections",
            message: `This page has ${sections.length} sections; a page can have up to ${COMMUNITY_LESSON_MAX_SECTIONS}. Join some of its ## headings, or move part of it to its own lesson.` });
    }
    for (const section of sections) {
        if (section.chars <= COMMUNITY_LESSON_SECTION_MAX_CHARS)
            continue;
        const name = section.heading ? `The section "${section.heading}"` : "The text before the first ## heading";
        problems.push({ code: "section_too_long",
            message: `${name} is ${formatChars(section.chars)} characters; a section can hold up to ${formatChars(COMMUNITY_LESSON_SECTION_MAX_CHARS)}. Add a ## heading inside it to split it into sections. Members still read it as one page.`,
            section: { index: section.index, heading: section.heading, chars: section.chars } });
    }
    return problems;
}
