// A time chart: lines over a soft wash of their colour, quiet hairline
// grid, the scale's top at the right, and the values under the pointer.
// Colours are the kit's (parts.tsx); numbers tabular.

import { useId, useState } from 'react';
import { Dot, cn } from '@hyperpane/ui';

export interface Series {
  label: string;
  values: number[];
  color: string;
}

export function Chart({
  series,
  max,
  format,
  height = 88,
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
  const uid = useId().replace(/:/g, '');
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
  const left = at === null ? 0 : at / (n - 1);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className="relative"
        style={{ height }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
        onPointerLeave={() => setAt(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.label} id={`${uid}-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={stacked ? 0.2 : 0.22} />
                <stop offset="1" stopColor={s.color} stopOpacity={stacked ? 0.12 : 0.02} />
              </linearGradient>
            ))}
          </defs>
          {[0, 0.5, 1].map((g) => (
            <line
              key={g}
              x1={0}
              x2={W}
              y1={H * g}
              y2={H * g}
              stroke="var(--hairline)"
              strokeWidth={1}
              strokeDasharray={g === 1 ? undefined : '2 3'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {sums.map((vals, i) => (
            <path key={`a${i}`} d={area(vals, stacked && i > 0 ? sums[i - 1] : undefined)} fill={`url(#${uid}-${i})`} />
          ))}
          {sums.map((vals, i) => (
            <path
              key={`l${i}`}
              d={path(vals)}
              fill="none"
              stroke={series[i].color}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {at !== null && <line x1={x(at)} x2={x(at)} y1={0} y2={H} stroke="var(--node-muted)" strokeWidth={1} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />}
        </svg>
        {at !== null && (
          <div
            className={cn(
              'rounded-control pointer-events-none absolute top-1 z-10 flex min-w-28 flex-col gap-1 px-2.5 py-2 text-xs tabular-nums',
              'border border-[var(--hairline-strong)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--shadow-popover)]',
            )}
            // Beside the pointer's line, on the side with room.
            style={left > 0.55 ? { right: `calc(${(1 - left) * 100}% + 8px)` } : { left: `calc(${left * 100}% + 8px)` }}
          >
            {series.map((s) => {
              const v = s.values[at - (n - s.values.length)];
              return (
                <div key={s.label} className="flex items-center gap-1.5">
                  <Dot color={s.color} />
                  <span className="text-[var(--node-muted)]">{s.label}</span>
                  <span className="ms-auto ps-3 font-medium">{v === undefined ? '—' : format(v)}</span>
                </div>
              );
            })}
            <div className="text-[11px] text-[var(--node-muted)]">{(n - 1 - at) * 2} s ago</div>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[11px] leading-3 text-[var(--node-muted)] tabular-nums">
        <span>{(n - 1) * 2 < 90 ? `${(n - 1) * 2} s ago` : `${Math.round(((n - 1) * 2) / 60)} min ago`}</span>
        <span>max {format(top)}</span>
      </div>
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
export function Bar({ value, color, title, className }: { value: number; color: string; title?: string; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-[var(--fill)]', className)} title={title}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}
