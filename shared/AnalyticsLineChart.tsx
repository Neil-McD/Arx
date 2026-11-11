import { useId, useLayoutEffect, useRef, useState } from "react";
import { formatCount } from "./contentFormatting";

export type AnalyticsLineChartPoint = {
  label: string;
  value: number;
};

export function AnalyticsLineChart({
  height = 180,
  points,
  valueFormatter,
}: {
  height?: number;
  points: AnalyticsLineChartPoint[];
  valueFormatter?: (value: number) => string;
}) {
  const paddingX = 22;
  const paddingY = 22;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const [chartWidth, setChartWidth] = useState(720);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const formatValue = valueFormatter ?? ((value: number) => formatCount(value));

  useLayoutEffect(() => {
    const node = chartRef.current;
    if (!node) return;

    const measure = () => {
      const nextWidth = node.getBoundingClientRect().width;
      if (nextWidth > 0) {
        setChartWidth((current) =>
          current != null && Math.abs(current - nextWidth) < 0.5 ? current : nextWidth,
        );
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!points || points.length === 0) {
    return <div className="analytics-line-chart analytics-line-chart-empty">No trend data yet.</div>;
  }

  const startLabel = points[0]?.label ?? "";
  const endLabel = points[points.length - 1]?.label ?? "";

  const width = Math.max(chartWidth, paddingX * 2 + 1);
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const bottomY = height - paddingY;

  const coords = points.map((point, index) => {
    const x = paddingX + stepX * index;
    const y = paddingY + innerHeight - (point.value / maxValue) * innerHeight;
    return { x, y };
  });

  const linePath = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `M${coords[0].x.toFixed(2)},${bottomY.toFixed(2)} L ${coords
    .map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(" L ")} L ${coords[coords.length - 1].x.toFixed(2)},${bottomY.toFixed(2)} Z`;

  const gradientId = `analyticsAreaGradient-${reactId.replace(/:/g, "")}`;
  const activeIndex = hoverIndex == null ? null : Math.min(Math.max(hoverIndex, 0), points.length - 1);
  const activeCoord = activeIndex == null ? null : coords[activeIndex];
  const activePoint = activeIndex == null ? null : points[activeIndex];
  const activeLabel = activePoint?.label ?? "";
  const activeValue = activePoint?.value ?? null;
  const shouldFlipTooltip =
    activeCoord != null && activeCoord.x >= paddingX + innerWidth * (2 / 3);

  return (
    <div className="analytics-line-chart" ref={chartRef}>
      <svg
        className="analytics-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Trend chart"
        style={{ height }}
        onPointerLeave={() => setHoverIndex(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const x = (event.clientX - rect.left) * (width / rect.width);
          const idx = Math.round((x - paddingX) / stepX);
          const clamped = Math.min(Math.max(idx, 0), points.length - 1);
          setHoverIndex(clamped);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = paddingY + innerHeight * ratio;
          return (
            <line
              key={ratio}
              className="analytics-chart-grid"
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        <path className="analytics-chart-area" d={areaPath} fill={`url(#${gradientId})`} />
        <path className="analytics-chart-line" d={linePath} vectorEffect="non-scaling-stroke" />

        {activeCoord && (
          <>
            <line
              className="analytics-chart-hover-line"
              x1={activeCoord.x}
              y1={paddingY}
              x2={activeCoord.x}
              y2={height - paddingY}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              className="analytics-chart-hover-dot"
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="4"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {coords.length > 0 && !activeCoord && (
          <circle
            className="analytics-chart-dot"
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {activeCoord && (
        <div
          className={`analytics-chart-tooltip${shouldFlipTooltip ? " is-flipped" : ""}`}
          style={{
            left: `${activeCoord.x}px`,
            top: "50%",
          }}
        >
          <div className="analytics-chart-tooltip-label">{activeLabel}</div>
          <div className="analytics-chart-tooltip-value">
            {activeValue == null ? "—" : formatValue(activeValue)}
          </div>
        </div>
      )}
      <div className="analytics-chart-axis">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
