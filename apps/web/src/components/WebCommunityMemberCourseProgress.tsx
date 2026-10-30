import { useEffect, useState } from "react";
import type { CommunityMemberProgressReport } from "../../../../shared/cloudCommunityResourceProgressGateway";

/** An owner's view of one member's courses: percent done per course and their quiz results. */
export function WebCommunityMemberCourseProgress(props: {
  membershipId: string;
  load: (membershipId: string) => Promise<CommunityMemberProgressReport>;
}) {
  const [report, setReport] = useState<CommunityMemberProgressReport | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    props.load(props.membershipId)
      .then((value) => { if (alive) setReport(value); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [props.membershipId, props.load, attempt]);

  if (error) {
    return <div role="alert"><p>Course progress couldn't load.</p><button type="button" className="workflow-secondary-button" onClick={() => setAttempt((n) => n + 1)}>Retry</button></div>;
  }
  if (!report) return <p role="status">Loading course progress…</p>;
  if (!report.courses.length) return <p>This community has no lessons yet.</p>;

  const quizzes = report.lessons.flatMap((lesson) => (lesson.responses ?? []).filter((response) => response.correct !== null));
  const correct = quizzes.filter((response) => response.correct).length;
  return (
    <section className="member-course-progress" aria-label="Course progress">
      <ul>
        {report.courses.map((course) => (
          <li key={course.ref}>
            <div className="member-course-progress-row">
              <strong>{course.name ?? "Course"}</strong>
              <span>
                {course.done_count} of {course.lesson_count} lessons
                {course.completed_at ? ` · Finished ${new Date(course.completed_at).toLocaleDateString()}` : ""}
              </span>
            </div>
            <div className="resource-course-card-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.percent} aria-label={`${course.name ?? "Course"} progress`}>
              <span style={{ width: `${course.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {quizzes.length ? <p>Quizzes: {correct} of {quizzes.length} answered right.</p> : null}
      {report.truncated ? <p>Showing the first lessons only; this community has more than Polynet reads at once.</p> : null}
    </section>
  );
}
