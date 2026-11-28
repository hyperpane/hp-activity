// Every process on the server in one table: sorted by any column, searched
// by name, command or pid, only yours, or as a tree by parent; the chosen
// one's command, and End (SIGTERM) or Force quit (SIGKILL). A narrow window
// does without the user, threads and start columns.

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListTree, Power, Search, Skull } from '@hyperpane/icons';
import { formatAgo, useHost } from '@hyperpane/sdk/client';
import { Button, Checkbox, Chip, ColumnResizer, HeaderBar, Input, ToolButton, cn, styles, useColumnWidths, useCompact, useMenu } from '@hyperpane/ui';
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
  const menu = useMenu();

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

  const cols = useColumnWidths('activity.processes', { pid: 72, user: 112, cpu: 72, mem: 88, threads: 72, started: 112 }, { min: 40, max: 400 });
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
        'sticky top-0 z-10 h-8 bg-[var(--node-bg)] px-2.5 text-xs font-medium text-[var(--node-muted)] shadow-[inset_0_-1px_0_var(--hairline)]',
        'before:pointer-events-none before:absolute before:inset-x-0 before:-top-1 before:h-1 before:bg-[var(--node-bg)]',
        cls,
      )}
    >
      <button
        type="button"
        className={cn('rounded-chip inline-flex items-center gap-1 tabular-nums transition-colors duration-100 hover:text-[var(--node-fg)]', styles.focusRing)}
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'user' }))}
      >
        {title}
        {sort.key === key && (sort.desc ? <ArrowDown variant="outline" className="size-3" /> : <ArrowUp variant="outline" className="size-3" />)}
      </button>
      {key !== 'name' && <ColumnResizer {...cols.resizer(key, 'start')} />}
    </th>
  );

  const td = 'h-8 truncate px-2.5 touch:h-10';
  const rowMenu = (e: React.MouseEvent, p: Proc) => {
    setSelected(p.pid);
    menu.open(e, [
      { label: `End ${p.name}`, run: () => void signal(p, 'TERM', 'End') },
      { label: 'Force quit', danger: true, run: () => void signal(p, 'KILL', 'Force quit') },
      null,
      { label: 'Copy command', run: () => void navigator.clipboard?.writeText(p.command || p.name) },
      { label: 'Copy pid', run: () => void navigator.clipboard?.writeText(String(p.pid)) },
    ]);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HeaderBar className="gap-2 px-2">
        <Input
          variant="secondary"
          size="sm"
          containerClassName="min-w-32 flex-1"
          icon={<Search variant="outline" className="size-4" />}
          clearable
          placeholder="Find by name, command or pid"
          value={find}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFind(e.target.value)}
        />
        <Checkbox className="ms-1 flex-none gap-1.5 text-[13px] text-[var(--node-muted)]" label="Only mine" checked={mine} onCheckedChange={setMine} />
        <ToolButton label={tree ? 'Show as a list' : 'Show as a tree (by parent)'} icon={ListTree} iconVariant="outline" active={tree} onClick={() => setTree(!tree)} />
        <span className="ms-1 flex-none text-xs text-[var(--node-muted)] tabular-nums max-sm:hidden">
          {rows.length.toLocaleString('en-US')} {rows.length === 1 ? 'process' : 'processes'}
        </span>
      </HeaderBar>
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
                onContextMenu={(e) => rowMenu(e, p)}
                className={cn(
                  'cursor-default text-[13px] [&>td:first-child]:rounded-s-control [&>td:last-child]:rounded-e-control',
                  selected === p.pid
                    ? '[&>td]:bg-[var(--state-selected-accent)] hover:[&>td]:bg-[var(--state-selected-accent-hover)]'
                    : 'hover:[&>td]:bg-[var(--node-hover)]',
                )}
                title={p.command}
              >
                <td className={td} style={{ paddingLeft: 10 + depth * 14 }}>
                  {depth > 0 && <span className="me-1.5 text-[var(--node-muted)] opacity-60">└</span>}
                  {p.name}
                </td>
                <td className={cn(td, 'text-right text-[var(--node-muted)] tabular-nums')}>{p.pid}</td>
                {wide && <td className={cn(td, 'text-[var(--node-muted)]')}>{p.user}</td>}
                <td className={cn(td, 'text-right tabular-nums', p.cpu > 90 ? 'text-[var(--rose)]' : p.cpu > 50 && 'text-[var(--amber)]')}>{pct(p.cpu)}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{size(p.mem)}</td>
                {wide && <td className={cn(td, 'text-right text-[var(--node-muted)] tabular-nums')}>{p.threads ?? ''}</td>}
                {wide && <td className={cn(td, 'text-right text-[var(--node-muted)] tabular-nums')}>{p.started ? formatAgo(p.started) : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="m-0 flex h-16 items-center justify-center text-[13px] text-[var(--node-muted)]">
            {find.trim() ? `No process matches “${find.trim()}”` : 'No processes of yours'}
          </p>
        )}
      </div>
      {/* The buttons 8px in from the ends, as a bar's are; the words on the
          table's names' line, 16px in. */}
      <div className="flex h-11 flex-none items-center gap-3 border-t border-[var(--hairline)] px-2 touch:h-12">
        {sel ? (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2 ps-2">
              <span className="flex-none font-medium">{sel.name}</span>
              <Chip className="flex-none">pid {sel.pid}</Chip>
              <Chip className="flex-none max-sm:hidden">parent {sel.ppid}</Chip>
              <span className="min-w-0 truncate font-mono text-xs text-[var(--node-muted)] select-text max-sm:hidden" title={sel.command}>
                {sel.command}
              </span>
            </span>
            <Button variant="secondary" size="sm" className="flex-none" onClick={() => void signal(sel, 'TERM', 'End')} title="End (SIGTERM): it can save first">
              <Power variant="outline" /> End
            </Button>
            <Button
              variant="secondary"
              color="destructive"
              size="sm"
              className="flex-none"
              onClick={() => void signal(sel, 'KILL', 'Force quit')}
              title="Force quit (SIGKILL): it ends at once"
            >
              <Skull variant="outline" /> Force quit
            </Button>
          </>
        ) : (
          <span className="ps-2 text-xs text-[var(--node-muted)]">Pick a process to end it, or right-click one</span>
        )}
      </div>
      {menu.element}
    </div>
  );
}
