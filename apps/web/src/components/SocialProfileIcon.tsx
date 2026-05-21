import type { SVGProps } from "react";
import type { SocialProfileKind } from "../../../../shared/socialProfileLinks";

export type { SocialProfileKind };

type SocialProfileIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  kind: SocialProfileKind;
  title?: string;
};

export function SocialProfileIcon({ kind, title, ...svgProps }: SocialProfileIconProps) {
  const viewBox =
    kind === "youtube" ? "0 0 313.23315 216.02286" : kind === "x" ? "0 0 1200 1227" : "0 0 24 24";

  return (
    <svg
      viewBox={viewBox}
      fill="currentColor"
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.75 2h8.5A5.76 5.76 0 0 1 22 7.75v8.5A5.76 5.76 0 0 1 16.25 22h-8.5A5.76 5.76 0 0 1 2 16.25v-8.5A5.76 5.76 0 0 1 7.75 2Zm0 2A3.75 3.75 0 0 0 4 7.75v8.5A3.75 3.75 0 0 0 7.75 20h8.5A3.75 3.75 0 0 0 20 16.25v-8.5A3.75 3.75 0 0 0 16.25 4h-8.5ZM12 7.2A4.8 4.8 0 1 1 12 16.8 4.8 4.8 0 0 1 12 7.2Zm0 2A2.8 2.8 0 1 0 12 14.8 2.8 2.8 0 0 0 12 9.2Zm5.15-2.38a1.13 1.13 0 1 1-2.26 0 1.13 1.13 0 0 1 2.26 0Z"
    />
  );
}

function XGlyph() {
  return (
    <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894L144.011 79.694h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" />
  );
}

function YouTubeGlyph() {
  return (
    <g transform="translate(-54.079375 -5.2758072)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="m210.53177 221.29866s98.12514 0 122.46443-6.48069c13.70449-3.6724 24.01093-14.2575 27.62825-27.32688 6.68807-23.97854 6.68807-74.41988 6.68807-74.41988s0-50.117297-6.68807-73.879819c-3.61732-13.393411-13.92376-23.762521-27.62825-27.326876-24.33929-6.5887078-122.46443-6.5887078-122.46443-6.5887078s-97.9062 0-122.135976 6.5887078c-13.485335 3.564355-24.010529 13.933465-27.847831 27.326876-6.468588 23.762522-6.468588 73.879819-6.468588 73.879819s0 50.44134 6.468588 74.41988c3.837302 13.06938 14.362496 23.65448 27.847831 27.32688 24.229776 6.48069 122.135976 6.48069 122.135976 6.48069ZM259.30109 113.28723l-81.00858-45.904851v91.809711l81.00858-45.90486Z"
      />
    </g>
  );
}
