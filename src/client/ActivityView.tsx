// The Activity window: the server's CPU (every core), memory, GPUs,
// network, disk and volumes as they go, charted over the last minutes, and
// its processes: the busiest on the overview, all of them (sorted, searched,
// as a tree) on Processes, to end or force to quit.
//
// The header and tabs are here; the overview is Overview.tsx, the process
// table Processes.tsx.

import { useEffect, useState } from 'react';
import { formatAgo, useHost } from '@hyperpane/sdk/client';
import { NodeMessage, cn } from '@hyperpane/ui';
import type { Machine, Sample, WatchEvent } from '../shared/index.ts';
import { Overview } from './Overview.tsx';
import { ID, pct, size } from './parts.tsx';
import { Processes } from './Processes.tsx';

type Tab = 'overview' | 'processes';

export function ActivityView() {
  const host = useHost();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(
    () =>
      host.subscribe<WatchEvent>(
        ID,
        { op: 'watch' },
        (e) => {
          if ('machine' in e) {
            setMachine(e.machine);
            setHistory(e.history);
          } else setHistory((h) => [...h, e.sample].slice(-150));
        },
        { onEnd: (e) => e && setError(e) },
      ),
    [host],
  );

  if (error) return <NodeMessage error>{error}</NodeMessage>;
  if (!machine) return <NodeMessage>Reading the server…</NodeMessage>;
  const now = history.at(-1);

  return (
    <div className="flex h-full flex-col text-xs text-[var(--node-fg)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--node-border)] px-3 py-2">
        <div className="rounded-control flex h-7 overflow-hidden border border-[var(--node-border)]">
          {(['overview', 'processes'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('px-3', tab === t ? 'bg-[color-mix(in_srgb,var(--node-accent)_22%,transparent)]' : 'text-[var(--node-muted)] hover:bg-[var(--node-hover)]')}
            >
              {t === 'overview' ? 'Overview' : 'Processes'}
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-[var(--node-muted)]" title={`${machine.os} · ${machine.arch}`}>
          <span className="font-medium text-[var(--node-fg)]">{machine.hostname.replace(/\.local$/, '')}</span> · {machine.cpu} · {machine.cores} cores · {size(machine.memory)} · up{' '}
          {formatAgo(machine.bootedAt).replace(/ ago$/, '')}
        </span>
        {now && (
          <span className="flex gap-3 text-[var(--node-muted)]">
            <span>
              CPU <b className="text-[var(--node-fg)]">{pct(now.cpu.total)}</b>
            </span>
            <span>
              Memory <b className="text-[var(--node-fg)]">{pct((now.mem.used / now.mem.total) * 100)}</b>
            </span>
            {now.gpus[0]?.util != null && (
              <span>
                GPU <b className="text-[var(--node-fg)]">{pct(now.gpus[0].util)}</b>
              </span>
            )}
          </span>
        )}
      </div>
      {tab === 'overview' ? <Overview history={history} machine={machine} onProcesses={() => setTab('processes')} /> : <Processes user={machine.user} />}
    </div>
  );
}
