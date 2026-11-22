// The Activity window: the server's CPU (every core), memory, GPUs,
// network, disk and volumes as they go, charted over the last minutes, and
// its processes: the busiest on the overview, all of them (sorted, searched,
// as a tree) on Processes, to end or force to quit.
//
// The header and tabs are here; the overview is Overview.tsx, the process
// table Processes.tsx.

import { useEffect, useState } from 'react';
import { formatAgo, useHost } from '@hyperpane/sdk/client';
import { Tabs, Toolbar } from '@hyperpane/ui';
import type { Machine, Sample, WatchEvent } from '../shared/index.ts';
import { Overview } from './Overview.tsx';
import { ID, State, pct, size } from './parts.tsx';
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

  if (error)
    return (
      <State error title="Can’t read the server">
        {error}
      </State>
    );
  if (!machine) return <State title="Reading the server" />;
  const now = history.at(-1);

  return (
    <div className="flex h-full flex-col text-xs text-[var(--node-fg)]">
      <Toolbar className="gap-3">
        <Tabs
          variant="pills"
          label="View"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'processes', label: 'Processes' },
          ]}
        />
        <span className="min-w-0 flex-1 truncate text-2xs text-[var(--node-muted)]" title={`${machine.os} · ${machine.arch}`}>
          <span className="font-medium text-[var(--node-fg)]">{machine.hostname.replace(/\.local$/, '')}</span> · {machine.cpu} · {machine.cores} cores ·{' '}
          {size(machine.memory)} · up {formatAgo(machine.bootedAt).replace(/ ago$/, '')}
        </span>
        {/* The overview's cards say these too: a narrow window does without. */}
        {now && (
          <span className="flex flex-none gap-3 text-2xs text-[var(--node-muted)] tabular-nums max-sm:hidden">
            <span>
              CPU <span className="font-medium text-[var(--node-fg)]">{pct(now.cpu.total)}</span>
            </span>
            <span>
              Memory <span className="font-medium text-[var(--node-fg)]">{pct((now.mem.used / now.mem.total) * 100)}</span>
            </span>
            {now.gpus[0]?.util != null && (
              <span>
                GPU <span className="font-medium text-[var(--node-fg)]">{pct(now.gpus[0].util)}</span>
              </span>
            )}
          </span>
        )}
      </Toolbar>
      {tab === 'overview' ? <Overview history={history} machine={machine} onProcesses={() => setTab('processes')} /> : <Processes user={machine.user} />}
    </div>
  );
}
