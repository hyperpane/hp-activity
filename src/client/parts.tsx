// What the Activity window's parts share: the plugin's id, the colours each
// measure is drawn in, how values are written, a card with a title, a
// legend, what shows while there's nothing yet (or why), and the process
// list as the server part sends it.

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { formatSize, useHost } from '@hyperpane/sdk/client';
import { Empty, Spinner, cn } from '@hyperpane/ui';
import type { Proc } from '../shared/index.ts';

export const ID = 'activity';
export const C = {
  cpu: 'var(--ansi-4)',
  mem: 'var(--ansi-5)',
  cached: 'var(--ansi-6)',
  gpu: 'var(--ansi-2)',
  rx: 'var(--ansi-2)',
  tx: 'var(--ansi-3)',
  read: 'var(--ansi-6)',
  write: 'var(--ansi-1)',
};

export const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
export const rate = (v: number) => `${formatSize(v)}/s`;
export const size = (v: number) => formatSize(v);

export function Card({
  icon: Icon,
  title,
  value,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-surface flex min-w-0 flex-col gap-3 bg-[var(--node-header)] p-3', className)}>
      <header className="flex h-5 min-w-0 items-center gap-2">
        <Icon className="size-3.5 flex-none text-[var(--node-muted)]" />
        <h3 className="truncate font-medium">{title}</h3>
        <span className="ms-auto truncate text-2xs text-[var(--node-muted)] tabular-nums">{value}</span>
      </header>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { color: string; label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-[var(--node-muted)]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full" style={{ background: i.color }} />
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
        className="h-full min-h-0 flex-1"
        icon={<TriangleAlert className="text-[var(--ansi-1)]" />}
        title={title}
        description={children}
      />
    );
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center gap-2 p-6 text-xs text-[var(--node-muted)]">
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
