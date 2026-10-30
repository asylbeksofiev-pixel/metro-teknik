"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Single-series charts: one validated hue (primary), no legend box (the card title names the series).
const SERIES = "var(--color-primary)";
const GRID = "var(--color-border)";
const AXIS = { fontSize: 12, fill: "var(--color-muted-foreground)" };
const tooltipStyle = { borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12, boxShadow: "0 4px 12px rgb(16 24 40 / 0.08)" };

export function ColumnChart({ data, valueLabel, height = 220 }: { data: { label: string; value: number }[]; valueLabel: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={valueLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} formatter={(v) => [v, valueLabel]} />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data, valueLabel, height = 240, domain = [0, 100] }: { data: { label: string; value: number }[]; valueLabel: string; height?: number; domain?: [number, number] }) {
  return (
    <div style={{ height }} role="img" aria-label={valueLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis domain={domain} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, valueLabel]} cursor={{ stroke: GRID }} />
          <Line type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2} isAnimationActive={false} dot={{ r: 4, fill: SERIES, stroke: "var(--color-surface)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--color-surface)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal percentage bars rendered as HTML (accessible, readable labels, no chart library needed). */
export function PercentBars({ rows, empty }: { rows: { label: string; percent: number; note?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_48px] items-center gap-3 text-sm" title={`${r.label}: ${r.percent}%`}>
          <span className="truncate">{r.label}{r.note && <span className="ml-1 text-xs text-muted-foreground">{r.note}</span>}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, r.percent))}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{r.percent}%</span>
        </li>
      ))}
    </ul>
  );
}
