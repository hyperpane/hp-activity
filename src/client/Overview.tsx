// The Activity overview: a card each for CPU (every core), memory, each
// GPU, network and disk (with its volumes), charted over the last minutes,
// and the busiest processes under them.

import { useMemo } from 'react';
import { ChevronRight, Cpu, HardDrive, MemoryStick, Monitor, Network } from '@hyperpane/icons';
import { Button, Card as KitCard, SectionHeader, cn, styles } from '@hyperpane/ui';
import type { Machine, Sample } from '../shared/index.ts';
import { Bar, Chart } from './chart.tsx';
import { C, Card, Legend, State, pct, rate, size, useProcs } from './parts.tsx';

/** A core's or a volume's colour by how full it is. */
const level = (v: number, base: string, warn = 60, hot = 85) => (v > hot ? C.hot : v > warn ? C.warn : base);

export function Overview({ history, machine, onProcesses }: { history: Sample[]; machine: Machine; onProcesses(): void }) {
  const now = history.at(-1);
  if (!now) return <State title="Reading" />;
  const s = <T,>(f: (x: Sample) => T) => history.map(f);
  const cores = now.cpu.cores;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 max-sm:p-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
        <Card icon={Cpu} title="CPU" value={`${pct(now.cpu.total)} · load ${now.cpu.load.map((l) => l.toFixed(2)).join(' ')}`} className="row-span-2">
          <Chart series={[{ label: 'CPU', values: s((x) => x.cpu.total), color: C.cpu }]} max={100} format={pct} />
          <div>
            <div className={cn('mb-1.5 flex h-4 items-center', styles.text.label)}>
              Cores <span className="ms-1.5 font-normal tracking-normal tabular-nums opacity-70">{cores.length}</span>
            </div>
            <div className={cn('grid gap-x-5 gap-y-2', cores.length > 8 ? 'grid-cols-2' : 'grid-cols-1')}>
              {cores.map((c, i) => (
                <div key={i} className="flex h-4 items-center gap-2 text-xs tabular-nums">
                  <span className="w-4 flex-none text-right text-[var(--node-muted)]">{i + 1}</span>
                  <Bar value={c} color={level(c, C.cpu)} title={`Core ${i + 1}: ${pct(c)}`} />
                  <span className="w-10 flex-none text-right">{pct(c)}</span>
                </div>
              ))}
            </div>
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
              { color: C.muted, label: 'Swap', value: now.mem.swapTotal ? `${size(now.mem.swapUsed)} of ${size(now.mem.swapTotal)}` : 'none' },
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
                ...(g.temp != null ? [{ color: C.warn, label: 'Temp', value: `${g.temp} °C` }] : []),
                ...(g.power != null ? [{ color: C.hot, label: 'Power', value: `${g.power.toFixed(0)} W` }] : []),
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
          <div className="flex flex-col gap-2">
            {now.volumes.map((v) => {
              const full = (v.used / v.size) * 100;
              return (
                <div key={v.mount} className="flex h-4 items-center gap-2 text-xs tabular-nums" title={`${v.mount}: ${pct(full)} full`}>
                  <span className="max-w-24 flex-none truncate font-mono text-[var(--node-muted)]">{v.mount}</span>
                  <Bar value={full} color={level(full, C.read, 85, 90)} />
                  <span className="flex-none text-right">
                    {size(v.used)} <span className="text-[var(--node-muted)]">of {size(v.size)}</span>
                  </span>
                </div>
              );
            })}
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
    <KitCard className="mt-3 py-2">
      <SectionHeader
        className="h-9 px-4"
        label="Busiest processes"
        count={list?.length}
        actions={
          <Button variant="ghost" size="sm" className="-me-2 text-[var(--node-muted)] hover:text-[var(--node-fg)]" onClick={onAll}>
            All processes
            <ChevronRight variant="outline" />
          </Button>
        }
      />
      {!list ? (
        <p className="m-0 flex h-8 items-center px-4 text-[13px] text-[var(--node-muted)]">Reading</p>
      ) : (
        <div className="flex flex-col px-1.5">
          {top.map((p) => (
            <div key={p.pid} className="flex h-8 items-center gap-3 px-2.5 text-[13px] tabular-nums touch:h-10" title={p.command}>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="w-14 flex-none text-right text-xs text-[var(--node-muted)] max-sm:hidden">{p.pid}</span>
              <Bar value={p.cpu} color={level(p.cpu, C.cpu, 50, 90)} className="w-40 flex-none max-sm:w-20" />
              <span className="w-14 flex-none text-right">{pct(p.cpu)}</span>
              <span className="w-16 flex-none text-right text-[var(--node-muted)]">{size(p.mem)}</span>
            </div>
          ))}
        </div>
      )}
    </KitCard>
  );
}
