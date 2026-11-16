// A time chart: lines (filled) over the last minutes, a grid, and the
// value under the pointer.

import { useState } from 'react';
import { cn } from '@hyperpane/ui';

export interface Series {
  label: string;
  values: number[];
  color: string;
}

export function Chart({
  series,
  max,
  format,
  height = 96,
  stacked,
  className,
}: {
  series: Series[];
  /** The top of the chart; else the highest value (rounded up). */
  max?: number;
  format(v: number): string;
  height?: number;
  /** Each series on top of the ones before (memory: used, then cached). */
  stacked?: boolean;
  className?: string;
}) {
  const [at, setAt] = useState<number | null>(null);
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const sums = stacked
    ? series.map((_, i) => Array.from({ length: n }, (_, j) => series.slice(0, i + 1).reduce((a, s) => a + (s.values[j] ?? 0), 0)))
    : series.map((s) => s.values);
  const top = max ?? niceTop(Math.max(1, ...sums.flat()));
  const W = 600;
  const H = 100;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - Math.min(1, v / top) * H;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + n - vals.length).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = (vals: number[], below?: number[]) => {
    if (!vals.length) return '';
    const off = n - vals.length;
    const base = below
      ? below
          .map((v, i) => `L${x(i + n - below.length).toFixed(1)},${y(v).toFixed(1)}`)
          .reverse()
          .join('')
      : `L${x(n - 1)},${H}L${x(off)},${H}`;
    return `${path(vals)}${base}Z`;
  };
  return (
    <div
      className={cn('relative', className)}
      style={{ height }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setAt(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
      }}
      onPointerLeave={() => setAt(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={0}
            x2={W}
            y1={H * g}
            y2={H * g}
            stroke="var(--node-border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="2 3"
          />
        ))}
        {sums.map((vals, i) => (
          <path key={`a${i}`} d={area(vals, stacked && i > 0 ? sums[i - 1] : undefined)} fill={series[i].color} fillOpacity={0.18} />
        ))}
        {sums.map((vals, i) => (
          <path key={`l${i}`} d={path(vals)} fill="none" stroke={series[i].color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
        {at !== null && <line x1={x(at)} x2={x(at)} y1={0} y2={H} stroke="var(--node-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="absolute top-0 right-1 text-[10px] text-[var(--node-muted)]">{format(top)}</span>
      {at !== null && (
        <div className="pointer-events-none absolute top-1 left-1 rounded border border-[var(--node-border)] bg-[var(--node-bg)] px-1.5 py-0.5 text-[10px] shadow-sm">
          {series.map((s) => {
            const v = s.values[at - (n - s.values.length)];
            return (
              <div key={s.label} className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: s.color }} />
                {s.label} {v === undefined ? '—' : format(v)}
              </div>
            );
          })}
          <div className="text-[var(--node-muted)]">{Math.round(((n - 1 - at) * 2) / 1)} s ago</div>
        </div>
      )}
    </div>
  );
}

/** 1, 2, 5 × 10ⁿ above v. */
function niceTop(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** A bar, 0 to 100 (htop's per-core meters). */
export function Bar({ value, color, title }: { value: number; color: string; title?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--node-fg)_10%,transparent)]" title={title}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}
