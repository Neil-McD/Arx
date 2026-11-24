// Example maps for the design lab (staging only): Sunrise as it is on
// staging today, a middling community, and a full one.
import type { BrainAttach, BrainMap, BrainPoint } from "../../../../shared/communityBrain";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";

const DAY = 86_400_000;

function base(name: string): BrainMap {
  return { center: { name, kind: "community" }, counts: { courses: 0, lessons: 0, learned: 0, this_week: 0 }, can_manage: true,
    courses: [], subjects: [], points: [], pods: [], arcs: [], hidden: {} };
}

function finish(map: BrainMap, now: number): BrainMap {
  const sizes = new Map<string, { first: number; size: number }>();
  for (const p of map.points) {
    if (p.at.kind !== "subject") continue;
    const at = Date.parse(p.learned_at);
    const entry = sizes.get(p.at.name) ?? { first: at, size: 0 };
    entry.first = Math.min(entry.first, at); entry.size += 1;
    sizes.set(p.at.name, entry);
  }
  map.subjects = [...sizes].map(([name, s]) => ({ name, first_at: new Date(s.first).toISOString(), size: s.size })).sort((a, b) => a.first_at.localeCompare(b.first_at));
  const community = map.points.filter((p) => p.at.kind !== "pod");
  map.counts = { courses: map.courses.length, lessons: map.courses.reduce((n, c) => n + c.lessons.length, 0), learned: community.length,
    this_week: community.filter((p) => now - Date.parse(p.learned_at) <= 7 * DAY).length };
  return map;
}

function pt(id: string, title: string | null, at: BrainAttach, daysAgo: number, now: number, extra: Partial<BrainPoint> = {}): BrainPoint {
  return { id: `note:${id}`, title, kind: "learned", at, learned_at: new Date(now - daysAgo * DAY).toISOString(), fresh: daysAgo <= 7, use: 0, mine: false, ...extra };
}

export function sunriseExample(now: number): BrainMap {
  const m = base("Sunrise Climbing Club");
  m.courses = [{ id: "course:basics", name: "Board basics", order: 0, lessons: [
    { id: "resource:read", title: "Reading the board", order: 1, done: true, use: 2 },
    { id: "resource:warm", title: "Warming up at 5:45am", order: 2, done: true, use: 6 },
    { id: "resource:bench", title: "Your first board benchmark", order: 3, done: false, use: 0 },
  ] }];
  m.pods = [{ id: "pod:setters", name: "Setters", inside: true, count: 2 }];
  const L = (id: string): BrainAttach => ({ kind: "lesson", id: `resource:${id}` });
  const S = (name: string): BrainAttach => ({ kind: "subject", name });
  m.points = [
    pt("etiquette", "Board etiquette", L("read"), 40, now, { use: 1 }),
    pt("warmer", "Early sessions need warmer fingers", L("warm"), 40, now),
    pt("chalk", "Liquid chalk for sweaty hands", L("warm"), 1, now, { use: 2 }),
    pt("seq", "Beginner warm-up sequence", L("warm"), 1, now, { use: 3 }),
    pt("crimpy", "Warm-up before crimpy climbs", L("warm"), 0, now, { use: 4, mine: true }),
    pt("bench", "Track board benchmarks every four weeks", L("bench"), 40, now),
    pt("runs", "How a Sunrise session runs", S("Sunrise sessions"), 45, now, { use: 3 }),
    pt("dawn", "Who runs dawn sessions", S("Sunrise sessions"), 2, now, { use: 2 }),
    pt("shoes", "Borrowing spare climbing shoes", S("Sunrise sessions"), 30, now),
    pt("closure", "Gym maintenance closure", S("Sunrise sessions"), 20, now),
    pt("led", "Board row 12 LED outage", S("Sunrise sessions"), 12, now),
    pt("v5", "Yellow V5 start beta", S("Board beta"), 2, now, { use: 5, mine: true }),
    pt("tips", "Beta tips and shared supplies", S("Board beta"), 2, now, { use: 1 }),
    pt("circuit", "Beginner board circuit: basic approach", S("Beginner board circuit"), 3, now),
    pt("brush", "Setters' brush storage", { kind: "pod", id: "pod:setters" }, 1, now),
    pt("rota", "Setters reset rota and hold labeling", { kind: "pod", id: "pod:setters" }, 1, now, { mine: true }),
  ];
  m.arcs = [{ a: "note:v5", b: "resource:read", count: 3 }, { a: "note:crimpy", b: "note:seq", count: 2 }, { a: "note:runs", b: "note:dawn", count: 2 }];
  return finish(m, now);
}

// A deterministic spread of learned things over places.
function grow(m: BrainMap, now: number, count: number, places: BrainAttach[], seed: number) {
  let s = seed;
  const next = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < count; i++) {
    const at = places[Math.floor(next() * places.length)];
    const days = Math.floor(next() * next() * 120);
    const use = Math.floor(next() * next() * 18);
    m.points.push(pt(`g${seed}-${i}`, `Learned thing ${i + 1}`, at, days, now, { use, mine: next() < 0.08, kind: next() < 0.12 ? "taught" : "learned" }));
  }
  const ids = m.points.map((p) => p.id);
  for (let i = 0; i < 12; i++) m.arcs.push({ a: ids[Math.floor(next() * ids.length)], b: ids[Math.floor(next() * ids.length)], count: 1 + Math.floor(next() * 6) });
  m.arcs = m.arcs.filter((arc) => arc.a !== arc.b);
}

function course(id: string, name: string, order: number, lessons: number, done: number) {
  return { id: `course:${id}`, name, order, lessons: Array.from({ length: lessons }, (_, i) => ({ id: `resource:${id}${i}`, title: `${name} ${i + 1}`, order: i + 1, done: i < done, use: (i * 7) % 5 })) };
}

export function middlingExample(now: number): BrainMap {
  const m = base("Founders Club");
  m.courses = [course("start", "Getting started", 0, 4, 4), course("price", "Pricing", 1, 6, 2), course("sales", "First sales", 2, 5, 0)];
  m.pods = [{ id: "pod:a", name: "Founders", inside: true, count: 8 }, { id: "pod:b", name: "Agency owners", inside: false, count: 12 }];
  const lessons = m.courses.flatMap((c) => c.lessons.map((l) => ({ kind: "lesson", id: l.id }) as BrainAttach));
  const subjects = ["Tools", "Hiring", "Taxes", "Events", "Community rules", "Fundraising"].map((name) => ({ kind: "subject", name }) as BrainAttach);
  grow(m, now, 60, [...lessons, ...subjects, ...subjects, { kind: "pod", id: "pod:a" }, { kind: "other" }], 7);
  return finish(m, now);
}

// Courses and nothing learned yet: the shape of a real eleven-course community.
export function coursesExample(now: number): BrainMap {
  const m = base("AI Employee Builders");
  const shape: Array<[string, string, number]> = [["p1", "Phase 1: Get set up", 7], ["p2", "Phase 2: Map the business", 4], ["p3", "Phase 3: Your first skill", 6],
    ["p4", "Phase 4: A skill system", 3], ["p5", "Phase 5: Make it reliable", 6], ["p6", "Phase 6: Your AI Employee", 4], ["cc", "Claude Code 101", 8],
    ["gh", "GitHub Basics", 1], ["xr", "Business X-Ray", 15], ["ws", "Workshops & live recordings", 9], ["sh", "Skill Handbook", 11]];
  m.courses = shape.map(([id, name, lessons], order) => course(id, name, order, lessons, 0));
  return finish(m, now);
}

export function fullExample(now: number): BrainMap {
  const m = base("Big Community");
  m.courses = [course("a", "Foundations", 0, 8, 5), course("b", "Growth", 1, 6, 1), course("c", "Content", 2, 7, 0), course("d", "Ops", 3, 4, 0), course("e", "Money", 4, 5, 0), course("f", "Leadership", 5, 6, 0)];
  m.pods = [{ id: "pod:a", name: "Inner circle", inside: true, count: 20 }, { id: "pod:b", name: "Coaches", inside: true, count: 9 }, { id: "pod:c", name: "VIP", inside: false, count: 30 }];
  const lessons = m.courses.flatMap((c) => c.lessons.map((l) => ({ kind: "lesson", id: l.id }) as BrainAttach));
  const subjects = ["Tools", "Hiring", "Taxes", "Events", "Rules", "Fundraising", "Design", "Legal", "Partners", "Travel"].map((name) => ({ kind: "subject", name }) as BrainAttach);
  grow(m, now, 150, [...lessons, ...subjects, ...subjects, { kind: "pod", id: "pod:a" }, { kind: "pod", id: "pod:b" }, { kind: "other" }], 11);
  m.hidden = { "subject:Tools": 14, other: 3 };
  return finish(m, now);
}

// What Knowledge would hand the brain page for an example map: a short
// description per course and a few paragraphs per lesson, so every side
// panel can be looked at in the lab.
export function labBrainContent(map: BrainMap): { courses: CommunityResourceModule[]; lessons: CommunityResource[]; community: { oneLiner: string | null; about: string | null } } {
  const courses = map.courses.map((course, index) => ({
    id: course.id.replace(/^course:/, ""), directory_uri: "", directory_path: "", module_status: "live" as const, name: course.name,
    description_md: `Everything you need for ${course.name.toLowerCase()}, one short lesson at a time. Work through it in order, or jump to what you need today.`,
    banner_url: null, banner_focus_x: null, banner_focus_y: null, banner_zoom: null, sort_order: index,
  }));
  const lessons = map.courses.flatMap((course) => course.lessons.map((lesson) => ({
    id: lesson.id.replace(/^resource:/, ""), title: lesson.title, url: null, module_id: course.id.replace(/^course:/, ""),
    body_md: `This lesson walks through **${lesson.title}**.\n\n## What you'll do\n\n- Read the short overview\n- Try it on your own community\n- Post what you made in #wins\n\n> [!TIP] Keep it small\n> One change you can finish today beats a plan you never start.\n\nWhen you're done, mark it finished and move to the next lesson.`,
  }) as unknown as CommunityResource));
  return { courses, lessons, community: { oneLiner: "Where founders build their first paid community, together.", about: `${map.center.name} is a place to learn by doing: short courses, weekly calls, and a guide that remembers what everyone is working on.\n\nStart with the first course, say hello in #general, and come to Friday's call.` } };
}
