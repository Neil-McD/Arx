// Design system v1: the guide's question, above the box where you type. When
// you tell your guide to post for you, reply in your direct messages, remove
// posts, or change, remove or ban members, it shows exactly what it would do
// (the words, the posts, or the people) and waits here: Yes, No, and for
// posts only "Always allow" (shared/guideQuestions.ts). A message's question
// names who it goes to; a post with pictures shows them, as small as the
// pictures waiting in the box below. Nothing is done before the click. After it, one line
// says what happened, with the way to see it.
import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { answerGuideQuestion } from "../../../../shared/cloudGuideQuestionsGateway";
import type { GuideAnswerResult, GuideQuestionAnswer, GuideQuestionView } from "../../../../shared/guideQuestions";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { Btn, cx } from "./kit";

// How many posts a question about removing lists before "and N more".
export const GUIDE_ASK_ITEMS_SHOWN = 6;

// The questions waiting on this person in this community, live. Oldest first.
export function useGuideQuestions(session: unknown, communityId: string | null, enabled = true): GuideQuestionView[] {
  const subject = session ? resolveAuthSubject(session as AuthSessionLike) : null;
  const { data } = useLiveQuery<GuideQuestionView[]>(session, "communityGuideQuestions:listGuideQuestions",
    subject && communityId && enabled ? { authSubject: subject, communityId } : null);
  return enabled ? data ?? [] : [];
}

// The pictures a post's question shows, and a line for any the person has
// since deleted from their talk (a yes is then refused, so they are told).
export function guideAskPictures(question: Pick<GuideQuestionView, "pictures">): {
  shown: Array<{ id: string; name: string; url: string }>; goneLine: string | null;
} {
  const pictures = question.pictures ?? [];
  const shown = pictures.flatMap((picture) => (picture.url ? [{ id: picture.id, name: picture.name, url: picture.url }] : []));
  const gone = pictures.length - shown.length;
  return { shown, goneLine: gone === 0 ? null
    : `${gone === 1 ? "1 picture is" : `${gone} pictures are`} no longer in your talk, so this can't be posted. Say No and ask again.` };
}

export function alwaysLabel(question: Pick<GuideQuestionView, "kind">): string {
  return question.kind === "post" ? "Always allow posts" : "Always allow";
}

export function GuideAsks(props: {
  session: unknown;
  communityId: string;
  questions: GuideQuestionView[];
}) {
  const [busy, setBusy] = useState<GuideQuestionAnswer | null>(null);
  const [result, setResult] = useState<GuideAnswerResult | null>(null);
  const [allShown, setAllShown] = useState(false);
  const question = props.questions[0] ?? null;
  const answer = async (choice: GuideQuestionAnswer) => {
    if (!question || busy) return;
    setBusy(choice);
    try {
      setResult(await answerGuideQuestion({ session: props.session, communityId: props.communityId, questionId: question.id, answer: choice }));
    } catch {
      setResult({ status: "failed", line: "That didn't go through. Try again.", path: null });
    }
    setBusy(null);
    setAllShown(false);
  };
  if (!question && !result) return null;
  const items = question ? (allShown ? question.items : question.items.slice(0, GUIDE_ASK_ITEMS_SHOWN)) : [];
  const hidden = question ? question.items.length - items.length : 0;
  const pictures = guideAskPictures(question ?? {});
  return (
    <div className={cx("gask")}>
      {/* What the last answer did, until the guide asks again. */}
      {result && !question ? (
        <div className={cx("gdid", result.status === "failed" && "bad")} role="status">
          <span>{result.line}</span>
          {result.path && result.status === "done" ? <a className={cx("gopen")} href={result.path}>Open</a> : null}
          <button type="button" className={cx("gx")} aria-label="Dismiss" onClick={() => setResult(null)}><X size={14} strokeWidth={1.8} aria-hidden="true" /></button>
        </div>
      ) : null}
      {question ? (
        <section className={cx("gbox")} aria-label="Your guide asks">
          <h3><Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />{question.question}</h3>
          {question.text ? <p className={cx("gwhat")}>{question.text}</p> : null}
          {/* The talk's own picture tiles (WebCommunityAgentDock.css), without the remove button. */}
          {pictures.shown.length > 0 ? (
            <div className="community-agent-dock-composer-attachments" style={{ marginTop: 10, padding: 0 }}>
              {pictures.shown.map((picture) => (
                <div className="community-agent-dock-composer-image" key={picture.id}><img src={picture.url} alt={picture.name} /></div>
              ))}
            </div>
          ) : null}
          {pictures.goneLine ? <p className={cx("gwhat")}>{pictures.goneLine}</p> : null}
          {items.length > 0 ? (
            <ul className={cx("gwhat", "list")}>
              {items.map((item, index) => <li key={index}><b>{item.who}</b><span>{item.text}</span></li>)}
              {hidden > 0 ? <li><button type="button" className={cx("gopen")} onClick={() => setAllShown(true)}>and {hidden} more</button></li> : null}
            </ul>
          ) : null}
          <div className={cx("gacts")}>
            <Btn small go disabled={busy !== null} onClick={() => void answer("yes")}>{busy === "yes" ? "…" : "Yes"}</Btn>
            <Btn small disabled={busy !== null} onClick={() => void answer("no")}>No</Btn>
            {question.canAlways ? <Btn small disabled={busy !== null} onClick={() => void answer("always")}>{busy === "always" ? "…" : alwaysLabel(question)}</Btn> : null}
            {props.questions.length > 1 ? <small>{props.questions.length - 1} more after this</small> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
