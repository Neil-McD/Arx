import { CircleArrowRight, Info, KeyRound, Lightbulb, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { LessonCalloutType } from "./lessonCallouts";

const ICONS: Record<LessonCalloutType, () => ReactNode> = {
  tip: () => <Lightbulb />,
  note: () => <Info />,
  important: () => <KeyRound />,
  action: () => <CircleArrowRight />,
  warning: () => <TriangleAlert />,
};

export function LessonCalloutIcon({ type }: { type: LessonCalloutType }) {
  return <>{ICONS[type]()}</>;
}
