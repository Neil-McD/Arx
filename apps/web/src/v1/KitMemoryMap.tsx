// Design system v1: the mock's small memory map (lib.py mini_map), shared by
// the classroom's right column and Home's.
import { cx } from "./kit";

// The mock's small constellation (lib.py mini_map): a quiet picture of memory.
const NODES: Array<[number, number, "" | "big" | "new"]> = [
  [40, 96, ""], [92, 48, ""], [150, 84, "big"], [206, 40, "new"], [238, 104, ""], [120, 126, ""], [64, 30, ""], [184, 128, ""],
];
const EDGES: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [1, 6], [4, 7], [5, 0]];

export function KitMemoryMap() {
  return (
    <svg className={cx("mini")} viewBox="0 0 280 156" aria-hidden="true">
      <defs>
        <radialGradient id="kit-class-aurora" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: "var(--aurora)" }} stopOpacity=".6" />
          <stop offset="1" style={{ stopColor: "var(--aurora)" }} stopOpacity="0" />
        </radialGradient>
      </defs>
      {EDGES.map(([a, b]) => <path key={`${a}-${b}`} d={`M${NODES[a][0]} ${NODES[a][1]}L${NODES[b][0]} ${NODES[b][1]}`} stroke="currentColor" strokeOpacity=".16" strokeWidth=".8" />)}
      {NODES.map(([x, y, kind]) => (
        <g key={`${x}-${y}`}>
          {kind === "new" ? <circle cx={x} cy={y} r="16" fill="url(#kit-class-aurora)" /> : null}
          <circle cx={x} cy={y} r={kind === "big" ? 4 : 2.6} fill="currentColor" opacity={kind ? 1 : 0.8} />
        </g>
      ))}
    </svg>
  );
}

