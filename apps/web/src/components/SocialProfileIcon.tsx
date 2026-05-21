import type { SVGProps } from "react";

export type SocialProfileKind = "instagram" | "x" | "youtube";

type SocialProfileIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  kind: SocialProfileKind;
  title?: string;
};

export function SocialProfileIcon({ kind, title, ...svgProps }: SocialProfileIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...svgProps}
    >
      {title ? <title>{title}</title> : null}
      {kind === "instagram" ? <InstagramGlyph /> : null}
      {kind === "x" ? <XGlyph /> : null}
      {kind === "youtube" ? <YouTubeGlyph /> : null}
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <>
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.25" />
      <circle cx="16.2" cy="7.8" r="0.65" fill="currentColor" stroke="none" />
    </>
  );
}

function XGlyph() {
  return (
    <>
      <path d="M6.25 5.75 17.75 18.25" />
      <path d="M17.75 5.75 6.25 18.25" />
    </>
  );
}

function YouTubeGlyph() {
  return (
    <>
      <rect x="4" y="7" width="16" height="10" rx="4" />
      <path d="m10.5 9.75 4.5 2.25-4.5 2.25V9.75Z" />
    </>
  );
}
