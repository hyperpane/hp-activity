// The Activity window: the server's CPU (every core), memory, GPUs,
// network, disk and volumes as they go, charted over the last minutes, and
// its processes: the busiest on the overview, all of them (sorted, searched,
// as a tree) on Processes, to end or force to quit.
//
// The header and tabs are here; the overview is Overview.tsx, the process
// table Processes.tsx.

import { useEffect, useState } from 'react';
import { formatAgo, useHost } from '@hyperpane/sdk/client';
import { Dot, HeaderBar, SegmentedControl } from '@hyperpane/ui';
import type { Machine, Sample, WatchEvent } from '../shared/index.ts';
import { Overview } from './Overview.tsx';
import { C, ID, State, pct, size } from './parts.tsx';
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
    <div className="flex h-full flex-col text-[13px] leading-5 text-[var(--node-fg)]">
      <HeaderBar className="gap-3 px-3">
        <SegmentedControl
          size="sm"
          label="View"
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'processes', label: 'Processes' },
          ]}
        />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate" title={`${machine.os} · ${machine.arch}`}>
          <span className="flex-none font-medium">{machine.hostname.replace(/\.local$/, '')}</span>
          <span className="min-w-0 truncate text-xs text-[var(--node-muted)] tabular-nums max-sm:hidden">
            {machine.cpu} · {machine.cores} cores · {size(machine.memory)} · up {formatAgo(machine.bootedAt).replace(/ ago$/, '')}
          </span>
        </span>
        {/* The overview's cards say these too: a narrow window does without. */}
        {now && (
          <span className="flex flex-none items-center gap-4 text-xs text-[var(--node-muted)] tabular-nums max-md:hidden">
            <Stat color={C.cpu} label="CPU" value={pct(now.cpu.total)} />
            <Stat color={C.mem} label="Memory" value={pct((now.mem.used / now.mem.total) * 100)} />
            {now.gpus[0]?.util != null && <Stat color={C.gpu} label="GPU" value={pct(now.gpus[0].util)} />}
          </span>
        )}
      </HeaderBar>
      {tab === 'overview' ? <Overview history={history} machine={machine} onProcesses={() => setTab('processes')} /> : <Processes user={machine.user} />}
    </div>
  );
}

function Stat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Dot color={color} />
      {label} <span className="font-medium text-[var(--node-fg)]">{value}</span>
    </span>
  );
}
