// Every process on the server in one table: sorted by any column, searched
// by name, command or pid, only yours, or as a tree by parent; the chosen
// one's command, and End (SIGTERM) or Force quit (SIGKILL).

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListTree, Search, Skull, Square } from 'lucide-react';
import { formatAgo, useHost } from '@hyperpane/sdk/client';
import { Checkbox, ColumnResizer, NodeInput, NodeMessage, ToolButton, cn, styles, useColumnWidths } from '@hyperpane/ui';
import type { Proc, Signal } from '../shared/index.ts';
import { ID, pct, size, useProcs } from './parts.tsx';

type SortKey = 'name' | 'pid' | 'user' | 'cpu' | 'mem' | 'threads' | 'started';

export function Processes({ user }: { user: string }) {
  const host = useHost();
  const list = useProcs();
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'cpu', desc: true });
  const [tree, setTree] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [mine, setMine] = useState(false);

  const rows = useMemo(() => {
    if (!list) return [];
    const q = find.trim().toLowerCase();
    let l = list.filter(
      (p) => (!q || p.name.toLowerCase().includes(q) || p.command.toLowerCase().includes(q) || String(p.pid) === q) && (!mine || p.user === user),
    );
    const dir = sort.desc ? -1 : 1;
    const cmp = (a: Proc, b: Proc) => {
      const x = a[sort.key] ?? 0;
      const y = b[sort.key] ?? 0;
      return (typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)) * dir;
    };
    l = [...l].sort(cmp);
    if (!tree || q) return l.map((p) => ({ p, depth: 0 }));
    // As a tree: each process under its parent, siblings sorted.
    const kids = new Map<number, Proc[]>();
    const pids = new Set(l.map((p) => p.pid));
    for (const p of l) {
      const parent = pids.has(p.ppid) && p.ppid !== p.pid ? p.ppid : 0;
      kids.set(parent, [...(kids.get(parent) ?? []), p]);
    }
    const out: { p: Proc; depth: number }[] = [];
    const walk = (pid: number, depth: number) => {
      for (const c of kids.get(pid) ?? []) {
        out.push({ p: c, depth });
        if (depth < 30) walk(c.pid, depth + 1);
      }
    };
    walk(0, 0);
    return out;
  }, [list, find, sort, tree, mine, user]);

  if (!list) return <NodeMessage>Reading the processes</NodeMessage>;
  const sel = list.find((p) => p.pid === selected) ?? null;
  const signal = async (p: Proc, sig: Signal, word: string) => {
    if (
      !(await host.ui.confirm({
        title: `${word} ${p.name} (${p.pid})?`,
        message: sig === 'KILL' ? 'It ends at once, without saving anything' : 'It’s asked to end, and can save first',
        confirm: word,
        destructive: true,
      }))
    )
      return;
    try {
      await host.call(ID, { op: 'signal', pid: p.pid, signal: sig });
    } catch (e) {
      host.app.toast((e as Error).message, { error: true });
    }
  };
  // Name takes what's left; the others are as wide as they were dragged
  // (from their left edge, kept on this machine).
  const cols = useColumnWidths('activity.processes', { pid: 64, user: 96, cpu: 64, mem: 80, threads: 64, started: 88 }, { min: 40, max: 400 });
  const head = (key: SortKey, title: string, cls = '') => (
    <th className={cn('relative border-b border-[var(--node-border)] px-2 py-1.5 font-medium text-[var(--node-muted)] first:pl-3', cls)}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 hover:text-[var(--node-fg)]"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'user' }))}
      >
        {title}
        {sort.key === key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
      {key !== 'name' && <ColumnResizer {...cols.resizer(key, 'start')} />}
    </th>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--node-border)] px-3 py-1.5">
        <div className="relative min-w-32 flex-1">
          <Search className="absolute top-1.5 left-1.5 size-3 text-[var(--node-muted)]" />
          <NodeInput className="w-full pl-6" placeholder="Name, command or pid" value={find} onChange={(e) => setFind(e.target.value)} />
        </div>
        <Checkbox className="gap-1.5 text-xs text-[var(--node-muted)]" label="Mine" checked={mine} onCheckedChange={setMine} />
        <ToolButton label={tree ? 'A list' : 'A tree (by parent)'} icon={ListTree} active={tree} onClick={() => setTree(!tree)} />
        <span className="text-[var(--node-muted)]">{rows.length} processes</span>
        <ToolButton label="End (SIGTERM)" icon={Square} disabled={!sel} onClick={() => sel && void signal(sel, 'TERM', 'End')} />
        <ToolButton label="Force quit (SIGKILL)" icon={Skull} disabled={!sel} onClick={() => sel && void signal(sel, 'KILL', 'Force quit')} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col />
            <col style={{ width: cols.widths.pid }} />
            <col style={{ width: cols.widths.user }} />
            <col style={{ width: cols.widths.cpu }} />
            <col style={{ width: cols.widths.mem }} />
            <col style={{ width: cols.widths.threads }} />
            <col style={{ width: cols.widths.started }} />
          </colgroup>
          <thead className={cn(styles.stickyTableHead, 'bg-[var(--node-bg)] text-left')}>
            <tr>
              {head('name', 'Name')}
              {head('pid', 'PID', 'text-right')}
              {head('user', 'User')}
              {head('cpu', 'CPU', 'text-right')}
              {head('mem', 'Memory', 'text-right')}
              {head('threads', 'Threads', 'text-right')}
              {head('started', 'Started', 'text-right')}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 2000).map(({ p, depth }) => (
              <tr
                key={p.pid}
                onClick={() => setSelected(p.pid)}
                className={cn(
                  'cursor-default border-b border-[var(--node-border)]',
                  selected === p.pid ? 'bg-[var(--node-selection,var(--node-hover))]' : 'hover:bg-[var(--node-hover)]',
                )}
                title={p.command}
              >
                <td className="truncate px-2 py-1 pl-3" style={{ paddingLeft: 12 + depth * 12 }}>
                  <span className="font-medium">{p.name}</span>
                </td>
                <td className="truncate px-2 py-1 text-right text-[var(--node-muted)] tabular-nums">{p.pid}</td>
                <td className="truncate px-2 py-1 text-[var(--node-muted)]">{p.user}</td>
                <td className={cn('px-2 py-1 text-right tabular-nums', p.cpu > 50 && 'text-[var(--ansi-3)]')}>{pct(p.cpu)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{size(p.mem)}</td>
                <td className="px-2 py-1 text-right text-[var(--node-muted)] tabular-nums">{p.threads ?? ''}</td>
                <td className="truncate px-2 py-1 text-right text-[var(--node-muted)]">{p.started ? formatAgo(p.started) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="flex items-center gap-2 border-t border-[var(--node-border)] px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] select-text" title={sel.command}>
            {sel.command}
          </span>
          <span className="flex-none text-[var(--node-muted)]">parent {sel.ppid}</span>
        </div>
      )}
    </div>
  );
}
