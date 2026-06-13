import type { DayPlan, ChargeStop } from "@/types";

interface StepSvgMapProps {
  day: DayPlan;
  width?: number;
  height?: number;
}

export function StepSvgMap({ day, width = 320, height = 200 }: StepSvgMapProps) {
  const hasLeg = !!day.leg;
  const chargeStops = day.leg?.chargeStops ?? [];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Plan de l'étape ${day.location}`}
      style={{ background: "var(--bg-card)", borderRadius: 8 }}
    >
      {hasLeg ? (
        <RouteDiagram
          from={day.leg!.from}
          to={day.leg!.to}
          chargeStops={chargeStops}
          width={width}
          height={height}
        />
      ) : (
        <StayDiagram location={day.location} width={width} height={height} />
      )}
    </svg>
  );
}

function RouteDiagram({
  from,
  to,
  chargeStops,
  width,
  height,
}: {
  from: string;
  to: string;
  chargeStops: ChargeStop[];
  width: number;
  height: number;
}) {
  const margin = 40;
  const lineY = height / 2;
  const totalStops = chargeStops.length + 2;
  const spacing = (width - 2 * margin) / (totalStops - 1);

  const points = [
    { x: margin, label: from, type: "start" as const },
    ...chargeStops.map((s, i) => ({
      x: margin + (i + 1) * spacing,
      label: s.superchargerName,
      type: "charge" as const,
    })),
    { x: width - margin, label: to, type: "end" as const },
  ];

  return (
    <g>
      <line
        x1={margin}
        y1={lineY}
        x2={width - margin}
        y2={lineY}
        stroke="var(--border-strong)"
        strokeWidth={2}
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={lineY}
            r={p.type === "charge" ? 6 : 8}
            fill={
              p.type === "charge"
                ? "var(--accent-amber)"
                : p.type === "start"
                ? "var(--accent-vine)"
                : "var(--accent-success)"
            }
          />
          <text
            x={p.x}
            y={lineY + 22}
            textAnchor="middle"
            fontSize={9}
            fill="var(--text-secondary)"
          >
            {p.label.length > 12 ? p.label.slice(0, 10) + "…" : p.label}
          </text>
          {p.type === "charge" && (
            <text
              x={p.x}
              y={lineY - 14}
              textAnchor="middle"
              fontSize={8}
              fill="var(--accent-amber)"
            >
              ⚡
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

function StayDiagram({
  location,
  width,
  height,
}: {
  location: string;
  width: number;
  height: number;
}) {
  return (
    <g>
      <circle
        cx={width / 2}
        cy={height / 2}
        r={30}
        fill="var(--accent-vine)"
        opacity={0.2}
      />
      <circle cx={width / 2} cy={height / 2} r={10} fill="var(--accent-vine)" />
      <text
        x={width / 2}
        y={height / 2 + 48}
        textAnchor="middle"
        fontSize={11}
        fontWeight="600"
        fill="var(--text-primary)"
      >
        {location}
      </text>
    </g>
  );
}
