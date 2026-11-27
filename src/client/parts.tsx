// What the Activity window's parts share: the plugin's id, the colours each
// measure is drawn in (the kit's named colours, so light and dark both
// read), how values are written, a card with a title, a legend, what shows
// while there's nothing yet (or why), and the process list as the server
// part sends it.

import { useEffect, useState } from 'react';
import { TriangleAlert } from '@hyperpane/icons';
import { formatSize, useHost } from '@hyperpane/sdk/client';
import { Card as KitCard, Dot, Empty, Spinner, cn } from '@hyperpane/ui';
import type { Proc } from '../shared/index.ts';

export const ID = 'activity';

/** One colour per measure, everywhere (the chart, its legend, the header's
 * stats): the kit's named colours. */
export const C = {
  cpu: 'var(--blue)',
  mem: 'var(--violet)',
  cached: 'var(--cyan)',
  gpu: 'var(--green)',
  rx: 'var(--green)',
  tx: 'var(--amber)',
  read: 'var(--cyan)',
  write: 'var(--rose)',
  /** Busy (a core past 60%, a process past 50%) and nearly full (past 85% or 90%). */
  warn: 'var(--amber)',
  hot: 'var(--rose)',
  muted: 'var(--node-muted)',
};

export const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
/** Bytes a second, whole below a kilobyte (a rate is an average: 491.4 B/s is noise). */
export const rate = (v: number) => `${formatSize(v < 1024 ? Math.round(v) : v)}/s`;
export const size = (v: number) => formatSize(v);

/** A measure's card: an icon, its name, its value now at the end; its
 * chart and details under it. */
export function Card({
  icon: Icon,
  title,
  value,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string; variant?: 'fill' | 'outline' }>;
  title: string;
  value?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <KitCard className={cn('gap-4 p-4', className)}>
      <header className="flex h-5 min-w-0 items-center gap-2">
        <Icon className="size-4 flex-none text-[var(--node-muted)]" />
        <h3 className="m-0 truncate text-[13px] leading-5 font-medium">{title}</h3>
        <span className="ms-auto min-w-0 truncate text-xs text-[var(--node-muted)] tabular-nums">{value}</span>
      </header>
      {children}
    </KitCard>
  );
}

export function Legend({ items }: { items: { color: string; label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--node-muted)]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <Dot color={i.color} />
          {i.label} <span className="text-[var(--node-fg)] tabular-nums">{i.value}</span>
        </span>
      ))}
    </div>
  );
}

/** The window (or a tab) with nothing to show yet: a spinner and what's
 * being read, or why it couldn't be. */
export function State({ error, title, children }: { error?: boolean; title: string; children?: React.ReactNode }) {
  if (error)
    return (
      <Empty
        bordered={false}
        size="compact"
        className="h-full min-h-0 flex-1"
        icon={<TriangleAlert className="text-[var(--rose)]" />}
        title={title}
        description={children}
      />
    );
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center gap-2 p-6 text-[13px] text-[var(--node-muted)]">
      <Spinner size="xs" className="flex-none" />
      {title}
    </div>
  );
}

export function useProcs(): Proc[] | null {
  const host = useHost();
  const [list, setList] = useState<Proc[] | null>(null);
  useEffect(() => host.subscribe<Proc[]>(ID, { op: 'processes' }, setList), [host]);
  return list;
}
