// Design lab mock (staging only): a lesson page with its lessons on the left
// and no right panel. /design-lab?page=lesson, &lessons=1 for a course with a
// single lesson, &light=1 for light mode. Sample content only.
import { useState, type CSSProperties, type ReactNode } from "react";
import { cx, Icon, KitApp, Main } from "./kit";

type Lesson = { id: string; title: string; minutes: number; group: string };

const LESSONS: Lesson[] = [
  { id: "l1", group: "Start here", title: "What an AI employee is", minutes: 6 },
  { id: "l2", group: "Start here", title: "Map your business in one page", minutes: 12 },
  { id: "l3", group: "Build", title: "Install The Builder", minutes: 9 },
  { id: "l4", group: "Build", title: "Your first employee: content", minutes: 18 },
  { id: "l5", group: "Build", title: "Hand it real work", minutes: 14 },
];

const ACCENT = "var(--v1-accent, var(--accent))";
const ACCENT_INK = "var(--v1-accent-ink, var(--accent))";

function Mark(props: { state: "done" | "now" | "todo" }) {
  const base: CSSProperties = { flex: "none", width: 16, height: 16, borderRadius: "50%", display: "grid", placeItems: "center" };
  if (props.state === "done") {
    return <span style={{ ...base, background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`, color: ACCENT_INK }}><Icon name="check" extra="lesson-tick" /></span>;
  }
  return <span style={{ ...base, border: `1.5px solid ${props.state === "now" ? ACCENT : "var(--line2)"}` }} />;
}

function LessonList(props: { lessons: Lesson[]; current: string; done: Set<string>; onPick: (id: string) => void }) {
  const percent = Math.round((props.done.size / props.lessons.length) * 100);
  const groups = [...new Set(props.lessons.map((lesson) => lesson.group))];
  return (
    <aside aria-label="Lessons" style={{ width: 272, flex: "none", borderRight: "1px solid var(--line)", padding: "20px 14px 20px 20px", overflowY: "auto" }}>
      <div className={cx("kline")}><span>{props.done.size} of {props.lessons.length} done</span><em>{percent}%</em></div>
      <div className={cx("bar")} style={{ marginTop: 8 }}><i style={{ width: `${percent}%`, background: ACCENT }} /></div>
      {groups.map((group) => (
        <div key={group} style={{ marginTop: 22 }}>
          <span className={cx("lab")} style={{ display: "block", marginBottom: 6 }}>{group}</span>
          {props.lessons.filter((lesson) => lesson.group === group).map((lesson) => {
            const now = lesson.id === props.current;
            const done = props.done.has(lesson.id);
            return (
              <button key={lesson.id} type="button" onClick={() => props.onPick(lesson.id)} aria-current={now ? "true" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 34, padding: "6px 10px", margin: "1px 0", borderRadius: 8, textAlign: "left", cursor: "pointer",
                  fontSize: 13.5, lineHeight: 1.3, fontWeight: now ? 500 : 400,
                  background: now ? "var(--s2)" : "transparent", color: now ? "var(--ink)" : done ? "var(--ink3)" : "var(--ink2)",
                }}>
                <Mark state={done ? "done" : now ? "now" : "todo"} />
                <span style={{ flex: 1, minWidth: 0 }}>{lesson.title}</span>
                <em style={{ fontStyle: "normal", fontSize: 12, color: "var(--ink3)" }}>{lesson.minutes}m</em>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

function Video() {
  return (
    <div role="img" aria-label="Lesson video" style={{
      position: "relative", aspectRatio: "16 / 9", marginTop: 22, borderRadius: 12, overflow: "hidden",
      background: "radial-gradient(120% 90% at 30% 20%, #2a2f55 0%, #14162a 55%, #0b0c14 100%)", border: "1px solid var(--line)",
    }}>
      <span style={{ position: "absolute", left: 20, top: 16, color: "rgba(255,255,255,.86)", fontSize: 14, fontWeight: 600 }}>Map your business in one page</span>
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,.14)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", color: "#fff" }}><Icon name="play" /></span>
      </span>
      <span style={{ position: "absolute", right: 16, bottom: 14, color: "rgba(255,255,255,.7)", fontSize: 12 }}>12:04</span>
    </div>
  );
}

function Resource(props: { title: string; place: string }) {
  return (
    <a className={cx("kresrow", "klink")} href="#resource" onClick={(event) => event.preventDefault()}>
      <Icon name="link" /><span><b>{props.title}</b><em>{props.place}</em></span><Icon name="arrow" />
    </a>
  );
}

function Header(props: { course: string; right?: ReactNode }) {
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 10, height: 52, padding: "0 20px", flex: "none" }}>
        <button type="button" className={cx("kback")} aria-label="Back to Knowledge" style={{ marginLeft: 0 }}><Icon name="back" />Knowledge</button>
        <span style={{ color: "var(--ink3)" }}>›</span>
        <h1 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{props.course}</h1>
        <span style={{ flex: 1 }} />
        {props.right}
      </header>
      <div style={{ height: 1, flex: "none", background: "var(--line)" }} />
    </>
  );
}

export function LessonLab() {
  const params = new URLSearchParams(window.location.search);
  const single = params.get("lessons") === "1";
  const light = params.get("light") === "1";
  const lessons = single ? [{ ...LESSONS[1], title: "AI Employees Masterclass: Build Digital Workforce", minutes: 58, group: "" }] : LESSONS;
  const [current, setCurrent] = useState(single ? lessons[0].id : "l2");
  const [done, setDone] = useState<Set<string>>(() => new Set(single ? [] : ["l1"]));
  const index = Math.max(0, lessons.findIndex((lesson) => lesson.id === current));
  const lesson = lessons[index];
  const next = lessons[index + 1];
  const previous = lessons[index - 1];
  const isDone = done.has(lesson.id);
  const finish = () => {
    setDone((before) => new Set(before).add(lesson.id));
    if (next) setCurrent(next.id);
  };
  return (
    <KitApp view="know" host={false} fillWindow light={light}>
      <LabSide />
      <Main>
        <Header course={single ? "AI Employees Masterclass" : "Start Here"} />
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {single ? null : <LessonList lessons={lessons} current={current} done={done} onPick={setCurrent} />}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "34px 40px 56px" }}>
            <article style={{ maxWidth: 780, margin: "0 auto" }}>
              {single ? null : <span className={cx("lab")}>Lesson {index + 1} of {lessons.length} · {lesson.minutes} min</span>}
              <h2 style={{ margin: single ? 0 : "8px 0 0", fontSize: 28, fontWeight: 600, letterSpacing: "-.018em", lineHeight: 1.18 }}>{lesson.title}</h2>
              <p style={{ margin: "12px 0 0", fontSize: 16, lineHeight: 1.6, color: "var(--ink2)" }}>
                Before you build anything, draw the business on one page: where work comes in, who touches it, and where it waits. The gaps are where an AI employee earns its keep.
              </p>
              <Video />
              <p style={{ margin: "22px 0 0", fontSize: 16, lineHeight: 1.6, color: "var(--ink2)" }}>
                When you're done, open your Build Board, fill in the map, and share it in the Business X Ray channel so others can poke holes in it.
              </p>
              <div className={cx("kres")}>
                <span className={cx("lab")}>Resources for this lesson</span>
                <Resource title="Business map template" place="Google Docs" />
                <Resource title="Three worked examples" place="PDF · 4 pages" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 30, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                {previous ? <button type="button" className={cx("btn", "txt")} onClick={() => setCurrent(previous.id)}><Icon name="back" />Previous</button> : null}
                <span style={{ flex: 1 }} />
                {isDone ? (
                  <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink3)" }}><Mark state="done" />Done</span>
                    {next ? <button type="button" className={cx("btn", "go")} onClick={() => setCurrent(next.id)}>Next lesson <Icon name="arrow" /></button> : null}
                  </>
                ) : (
                  <button type="button" className={cx("btn", "go")} onClick={finish}>
                    <Icon name="check" />{next ? "Mark done and continue" : "Mark done"}
                  </button>
                )}
              </div>
              {next && !isDone ? <p style={{ margin: "10px 0 0", textAlign: "right", fontSize: 12.5, color: "var(--ink3)" }}>Up next: {next.title}</p> : null}
            </article>
          </div>
        </div>
      </Main>
    </KitApp>
  );
}

// The app's own left column, as it is today, so the three columns can be judged together.
function LabSide() {
  const row = (label: string, on = false, hint?: string) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, height: 28, padding: "0 8px", borderRadius: 6, fontSize: 14,
      background: on ? "var(--s3)" : "transparent", color: on ? "var(--ink)" : "var(--ink2)", fontWeight: on ? 500 : 450,
    }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--ink4)", flex: "none" }} />
      <span style={{ flex: 1 }}>{label}</span>
      {hint ? <em style={{ fontStyle: "normal", fontSize: 12, color: "var(--ink3)" }}>{hint}</em> : null}
    </div>
  );
  const group = (label: string) => <div style={{ margin: "16px 8px 6px", fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}>{label}</div>;
  return (
    <nav aria-label="Community" style={{ width: 232, flex: "none", padding: 10, borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 60, borderRadius: 8, background: "linear-gradient(135deg,#1c2340,#0e1020)", display: "flex", alignItems: "flex-end", padding: 10, color: "#fff", fontSize: 14, fontWeight: 600 }}>AI Employee Builders</div>
      <div style={{ height: 10 }} />
      {row("Home")}{row("Inbox")}
      {group("Channels")}
      {row("General")}{row("Business X Ray")}{row("Wins")}
      {group("Community")}
      {row("Pods")}{row("Knowledge", true)}{row("Events")}{row("Members", false, "12")}
      <span style={{ flex: 1 }} />
      {row("Neil")}
    </nav>
  );
}
