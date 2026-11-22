// Every process on the server in one table: sorted by any column, searched
// by name, command or pid, only yours, or as a tree by parent; the chosen
// one's command, and End (SIGTERM) or Force quit (SIGKILL). A narrow window
// does without the user, threads and start columns.

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListTree, Search, Skull, Square } from 'lucide-react';
import { formatAgo, useHost } from '@hyperpane/sdk/client';
import { Checkbox, ColumnResizer, NodeInput, ToolButton, Toolbar, ToolbarSeparator, cn, styles, useColumnWidths, useCompact } from '@hyperpane/ui';
import type { Proc, Signal } from '../shared/index.ts';
import { ID, State, pct, size, useProcs } from './parts.tsx';

type SortKey = 'name' | 'pid' | 'user' | 'cpu' | 'mem' | 'threads' | 'started';

export function Processes({ user }: { user: string }) {
  const host = useHost();
  const list = useProcs();
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'cpu', desc: true });
  const [tree, setTree] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const wide = !useCompact();

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

  const cols = useColumnWidths('activity.processes', { pid: 64, user: 96, cpu: 64, mem: 80, threads: 64, started: 88 }, { min: 40, max: 400 });
  if (!list) return <State title="Reading the processes" />;
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
  const head = (key: SortKey, title: string, cls = '') => (
    // Each cell holds to the top itself, on the window's ground, with that
    // ground reaching a couple of pixels above it too: no row shows through
    // between the bar and the names however the pixels round.
    <th
      className={cn(
        'sticky top-0 z-10 h-7 bg-[var(--node-bg)] px-2 font-medium text-[var(--node-muted)] shadow-[inset_0_-1px_0_var(--node-border)]',
        'before:pointer-events-none before:absolute before:inset-x-0 before:-top-1 before:h-1 before:bg-[var(--node-bg)]',
        cls,
      )}
    >
      <button
        type="button"
        className={cn('rounded-chip inline-flex items-center gap-1 transition-colors duration-100 hover:text-[var(--node-fg)]', styles.focusRing)}
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'user' }))}
      >
        {title}
        {sort.key === key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
      {key !== 'name' && <ColumnResizer {...cols.resizer(key, 'start')} />}
    </th>
  );

  const td = 'h-7 truncate px-2 touch:h-10';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <div className="relative min-w-32 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[var(--node-muted)]" />
          <NodeInput className="w-full pl-7" placeholder="Name, command or pid" value={find} onChange={(e) => setFind(e.target.value)} />
        </div>
        <Checkbox className="ms-1 flex-none gap-1.5 text-xs text-[var(--node-muted)]" label="Mine" checked={mine} onCheckedChange={setMine} />
        <ToolButton label={tree ? 'A list' : 'A tree (by parent)'} icon={ListTree} active={tree} onClick={() => setTree(!tree)} />
        <span className="mx-1 flex-none text-2xs text-[var(--node-muted)] tabular-nums max-sm:hidden">{rows.length} processes</span>
        <ToolbarSeparator />
        <ToolButton label="End (SIGTERM)" icon={Square} disabled={!sel} onClick={() => sel && void signal(sel, 'TERM', 'End')} />
        <ToolButton label="Force quit (SIGKILL)" icon={Skull} disabled={!sel} onClick={() => sel && void signal(sel, 'KILL', 'Force quit')} />
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <colgroup>
            <col />
            <col style={{ width: cols.widths.pid }} />
            {wide && <col style={{ width: cols.widths.user }} />}
            <col style={{ width: cols.widths.cpu }} />
            <col style={{ width: cols.widths.mem }} />
            {wide && <col style={{ width: cols.widths.threads }} />}
            {wide && <col style={{ width: cols.widths.started }} />}
          </colgroup>
          <thead className="text-left">
            <tr>
              {head('name', 'Name')}
              {head('pid', 'PID', 'text-right')}
              {wide && head('user', 'User')}
              {head('cpu', 'CPU', 'text-right')}
              {head('mem', 'Memory', 'text-right')}
              {wide && head('threads', 'Threads', 'text-right')}
              {wide && head('started', 'Started', 'text-right')}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 2000).map(({ p, depth }) => (
              <tr
                key={p.pid}
                onClick={() => setSelected(p.pid)}
                className={cn(
                  'cursor-default [&>td:first-child]:rounded-s-control [&>td:last-child]:rounded-e-control',
                  selected === p.pid ? '[&>td]:bg-[var(--node-selection,var(--node-hover))]' : 'hover:[&>td]:bg-[var(--node-hover)]',
                )}
                title={p.command}
              >
                <td className={td} style={{ paddingLeft: 8 + depth * 12 }}>
                  <span className="font-medium">{p.name}</span>
                </td>
                <td className={cn(td, 'text-right text-[var(--node-muted)] tabular-nums')}>{p.pid}</td>
                {wide && <td className={cn(td, 'text-[var(--node-muted)]')}>{p.user}</td>}
                <td className={cn(td, 'text-right tabular-nums', p.cpu > 50 && 'text-[var(--ansi-3)]')}>{pct(p.cpu)}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{size(p.mem)}</td>
                {wide && <td className={cn(td, 'text-right text-[var(--node-muted)] tabular-nums')}>{p.threads ?? ''}</td>}
                {wide && <td className={cn(td, 'text-right text-[var(--node-muted)]')}>{p.started ? formatAgo(p.started) : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="px-2 py-3 text-[var(--node-muted)]">No processes match</p>}
      </div>
      {sel && (
        <div className="flex h-8 flex-none items-center gap-3 border-t border-[var(--node-border)] px-3 touch:h-10">
          <span className="min-w-0 flex-1 truncate font-mono text-2xs select-text" title={sel.command}>
            {sel.command}
          </span>
          <span className="flex-none text-2xs text-[var(--node-muted)] tabular-nums">parent {sel.ppid}</span>
        </div>
      )}
    </div>
  );
}
