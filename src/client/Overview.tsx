// The Activity overview: a card each for CPU (every core), memory, each
// GPU, network and disk (with its volumes), charted over the last minutes,
// and the busiest processes under them.

import { useMemo } from 'react';
import { Cpu, HardDrive, MemoryStick, Monitor, Network } from 'lucide-react';
import { NodeButton, NodeMessage, cn } from '@hyperpane/ui';
import type { Machine, Sample } from '../shared/index.ts';
import { Bar, Chart } from './chart.tsx';
import { C, Card, Legend, pct, rate, size, useProcs } from './parts.tsx';

export function Overview({ history, machine, onProcesses }: { history: Sample[]; machine: Machine; onProcesses(): void }) {
  const now = history.at(-1);
  if (!now) return <NodeMessage>Reading</NodeMessage>;
  const s = <T,>(f: (x: Sample) => T) => history.map(f);
  const cores = now.cpu.cores;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
        <Card icon={Cpu} title="CPU" value={`${pct(now.cpu.total)} · load ${now.cpu.load.map((l) => l.toFixed(2)).join(' ')}`} className="row-span-2">
          <Chart series={[{ label: 'CPU', values: s((x) => x.cpu.total), color: C.cpu }]} max={100} format={pct} />
          <div className={cn('grid gap-x-3 gap-y-1', cores.length > 8 ? 'grid-cols-2' : 'grid-cols-1')}>
            {cores.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-5 text-right text-[10px] text-[var(--node-muted)]">{i + 1}</span>
                <Bar value={c} color={c > 85 ? 'var(--ansi-1)' : c > 60 ? 'var(--ansi-3)' : C.cpu} title={`Core ${i + 1}: ${pct(c)}`} />
                <span className="w-9 text-right text-[10px] text-[var(--node-muted)] tabular-nums">{pct(c)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card icon={MemoryStick} title="Memory" value={`${size(now.mem.used)} of ${size(now.mem.total)}`}>
          <Chart
            stacked
            series={[
              { label: 'Used', values: s((x) => x.mem.used), color: C.mem },
              { label: 'Cached', values: s((x) => x.mem.cached), color: C.cached },
            ]}
            max={machine.memory}
            format={size}
          />
          <Legend
            items={[
              { color: C.mem, label: 'Used', value: size(now.mem.used) },
              { color: C.cached, label: 'Cached', value: size(now.mem.cached) },
              { color: 'var(--node-muted)', label: 'Swap', value: now.mem.swapTotal ? `${size(now.mem.swapUsed)} of ${size(now.mem.swapTotal)}` : 'none' },
            ]}
          />
        </Card>
        {now.gpus.map((g, i) => (
          <Card key={i} icon={Monitor} title={g.name} value={g.util == null ? '' : pct(g.util)}>
            <Chart series={[{ label: 'GPU', values: s((x) => x.gpus[i]?.util ?? 0), color: C.gpu }]} max={100} format={pct} />
            <Legend
              items={[
                ...(g.memUsed != null
                  ? [{ color: C.gpu, label: 'Memory', value: g.memTotal ? `${size(g.memUsed)} of ${size(g.memTotal)}` : size(g.memUsed) }]
                  : []),
                ...(g.temp != null ? [{ color: 'var(--ansi-3)', label: 'Temp', value: `${g.temp} °C` }] : []),
                ...(g.power != null ? [{ color: 'var(--ansi-1)', label: 'Power', value: `${g.power.toFixed(0)} W` }] : []),
              ]}
            />
          </Card>
        ))}
        <Card icon={Network} title="Network" value={`↓ ${rate(now.net.rx)} · ↑ ${rate(now.net.tx)}`}>
          <Chart
            series={[
              { label: 'In', values: s((x) => x.net.rx), color: C.rx },
              { label: 'Out', values: s((x) => x.net.tx), color: C.tx },
            ]}
            format={rate}
          />
          <Legend
            items={[
              { color: C.rx, label: 'In', value: rate(now.net.rx) },
              { color: C.tx, label: 'Out', value: rate(now.net.tx) },
            ]}
          />
        </Card>
        <Card icon={HardDrive} title="Disk" value={`read ${rate(now.disk.read)} · write ${rate(now.disk.write)}`}>
          <Chart
            series={[
              { label: 'Read', values: s((x) => x.disk.read), color: C.read },
              { label: 'Write', values: s((x) => x.disk.write), color: C.write },
            ]}
            format={rate}
          />
          <div className="flex flex-col gap-1">
            {now.volumes.map((v) => (
              <div key={v.mount} className="flex items-center gap-2" title={v.mount}>
                <span className="w-24 truncate text-[var(--node-muted)]">{v.mount}</span>
                <Bar value={(v.used / v.size) * 100} color={v.used / v.size > 0.9 ? 'var(--ansi-1)' : C.read} />
                <span className="w-28 flex-none text-right text-[10px] text-[var(--node-muted)]">
                  {size(v.used)} / {size(v.size)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <TopProcesses onAll={onProcesses} />
    </div>
  );
}

function TopProcesses({ onAll }: { onAll(): void }) {
  const list = useProcs();
  const top = useMemo(() => (list ? [...list].sort((a, b) => b.cpu - a.cpu).slice(0, 8) : []), [list]);
  return (
    <section className="mt-2 rounded-lg border border-[var(--node-border)] p-2.5">
      <header className="mb-1 flex items-center">
        <h3 className="font-medium">Busiest processes</h3>
        <NodeButton className="ml-auto" onClick={onAll}>
          All {list ? list.length : ''}
        </NodeButton>
      </header>
      {!list ? (
        <p className="text-[var(--node-muted)]">Reading</p>
      ) : (
        top.map((p) => (
          <div key={p.pid} className="flex items-center gap-2 py-0.5" title={p.command}>
            <span className="w-40 truncate font-medium">{p.name}</span>
            <span className="w-14 text-right text-[var(--node-muted)] tabular-nums">{p.pid}</span>
            <Bar value={p.cpu / 1} color={C.cpu} />
            <span className="w-14 flex-none text-right tabular-nums">{pct(p.cpu)}</span>
            <span className="w-16 flex-none text-right text-[var(--node-muted)] tabular-nums">{size(p.mem)}</span>
          </div>
        ))
      )}
    </section>
  );
}
