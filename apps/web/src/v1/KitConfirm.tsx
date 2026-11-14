// Design system v1: the app's own "are you sure?" (shared/inAppConfirm). One
// small card, the question in plain words, and two buttons that say what they
// do. Escape or a click outside is "no". The safe button has the focus, so
// Enter never removes anything by accident.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerInAppConfirmHost, type InAppQuestion } from "../../../../shared/inAppConfirm";
import { cx, KitApp } from "./kit";

export function KitConfirm() {
  const [asking, setAsking] = useState<{ question: InAppQuestion; answer: (yes: boolean) => void } | null>(null);
  const askingRef = useRef(asking);
  askingRef.current = asking;
  const noRef = useRef<HTMLButtonElement | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => registerInAppConfirmHost((question, answer) => {
    // A second question while one is open: the first is a "no".
    askingRef.current?.answer(false);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAsking({ question, answer });
  }), []);
  // Leaving the page with a question open is a "no".
  useEffect(() => () => askingRef.current?.answer(false), []);
  useEffect(() => {
    if (!asking) return;
    noRef.current?.focus();
    // If the focus is taken elsewhere (a click on the page behind is caught by
    // the veil, but scripts can move it), bring it back to the card.
    const back = (event: FocusEvent) => {
      const card = noRef.current?.closest("[role='alertdialog']");
      if (card && event.target instanceof Node && !card.contains(event.target)) noRef.current?.focus();
    };
    document.addEventListener("focusin", back);
    return () => document.removeEventListener("focusin", back);
  }, [asking]);

  if (!asking) return null;
  const answer = (yes: boolean) => {
    asking.answer(yes);
    setAsking(null);
    returnFocusRef.current?.focus?.();
  };
  return createPortal(
    <KitApp view="home" part="palette">
      <div className={cx("veil", "askveil")} onMouseDown={(event) => { if (event.target === event.currentTarget) answer(false); }}>
        <div className={cx("askcard")} role="alertdialog" aria-modal="true" aria-label={asking.question.message}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); answer(false); }
            // Tab stays on the card's two buttons until the question is answered.
            if (event.key === "Tab") {
              event.preventDefault();
              (document.activeElement === noRef.current ? yesRef.current : noRef.current)?.focus();
            }
          }}>
          <p>{asking.question.message}</p>
          <div className={cx("askacts")}>
            <button ref={noRef} type="button" className={cx("btn sm")} onClick={() => answer(false)}>{asking.question.no ?? "Cancel"}</button>
            <button ref={yesRef} type="button" className={cx("btn sm", asking.question.danger ? "no" : "go")} onClick={() => answer(true)}>{asking.question.yes}</button>
          </div>
        </div>
      </div>
    </KitApp>,
    document.body,
  );
}
