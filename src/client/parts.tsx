// What the Activity window's parts share: the plugin's id, the colours each
// measure is drawn in, how values are written, a card with a title, a
// legend, and the process list as the server part sends it.

import { useEffect, useState } from 'react';
import { formatSize, useHost } from '@hyperpane/sdk/client';
import { cn } from '@hyperpane/ui';
import type { Proc } from '../shared/index.ts';

export const ID = 'activity';
export const C = { cpu: 'var(--ansi-4)', mem: 'var(--ansi-5)', cached: 'var(--ansi-6)', gpu: 'var(--ansi-2)', rx: 'var(--ansi-2)', tx: 'var(--ansi-3)', read: 'var(--ansi-6)', write: 'var(--ansi-1)' };

export const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
export const rate = (v: number) => `${formatSize(v)}/s`;
export const size = (v: number) => formatSize(v);

export function Card({ icon: Icon, title, value, children, className }: { icon: React.ComponentType<{ className?: string }>; title: string; value?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-1.5 rounded-lg border border-[var(--node-border)] p-2.5', className)}>
      <header className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-[var(--node-muted)]" />
        <h3 className="font-medium">{title}</h3>
        <span className="ml-auto truncate text-[var(--node-muted)]">{value}</span>
      </header>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { color: string; label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--node-muted)]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: i.color }} />
          {i.label} <span className="text-[var(--node-fg)]">{i.value}</span>
        </span>
      ))}
    </div>
  );
}

export function useProcs(): Proc[] | null {
  const host = useHost();
  const [list, setList] = useState<Proc[] | null>(null);
  useEffect(() => host.subscribe<Proc[]>(ID, { op: 'processes' }, setList), [host]);
  return list;
}
