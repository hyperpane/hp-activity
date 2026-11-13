// The processes: on macOS from ps (its %CPU is recent, as Activity
// Monitor's); on Linux from /proc, with CPU as the time each used since the
// last reading (ps's %CPU there is over its whole life); on Windows from
// CIM, the same way.

import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import type { Proc } from '../shared/index.ts';
import type { Run } from './collect/index.ts';

const PLATFORM = process.platform;

/** ps's etime, `[[dd-]hh:]mm:ss`, in seconds. */
export function etime(s: string): number {
  const [days, rest] = s.includes('-') ? s.split('-') : ['0', s];
  const parts = rest.split(':').map(Number).reverse();
  return Number(days) * 86400 + (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600;
}

/** `pid=,X=` lines as pid → X (X may have spaces). */
function byPid(out: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const line of out.split('\n')) {
    const t = line.trimStart();
    const at = t.indexOf(' ');
    if (at > 0) m.set(Number(t.slice(0, at)), t.slice(at + 1).trim());
  }
  return m;
}

export function psProcs(nums: string, comms: string, args: string, now = Date.now()): Proc[] {
  const names = byPid(comms);
  const commands = byPid(args);
  const list: Proc[] = [];
  for (const line of nums.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 6) continue;
    const [pid, ppid, user, cpu, rss, et] = f;
    const p = Number(pid);
    const path = names.get(p) ?? '';
    list.push({
      pid: p,
      ppid: Number(ppid),
      name: path.split('/').pop() || path,
      command: commands.get(p) ?? path,
      user,
      cpu: Number(cpu) || 0,
      mem: (Number(rss) || 0) * 1024,
      threads: null,
      started: now - etime(et) * 1000,
    });
  }
  return list;
}

/** /proc/<pid>/stat's fields after the name (which may hold spaces and
 * parentheses: it's up to the last `)`). */
export function procStat(stat: string): { name: string; f: string[] } {
  const open = stat.indexOf('(');
  const close = stat.lastIndexOf(')');
  return { name: stat.slice(open + 1, close), f: stat.slice(close + 2).split(' ') };
}

const TICKS = 100;
const PAGE = 4096;

export class Procs {
  readonly #run: Run;
  /** Each process's CPU time at the last reading (seconds), and when. */
  #last = new Map<number, number>();
  #lastAt = 0;
  #users: Map<string, string> | null = null;
  #boot = 0;

  constructor(run: Run) {
    this.#run = run;
  }

  async read(): Promise<Proc[]> {
    if (PLATFORM === 'linux') return this.#linux();
    if (PLATFORM === 'win32') return this.#windows();
    const [nums, comms, args] = await Promise.all([
      this.#run('ps', ['-axww', '-o', 'pid=,ppid=,user=,pcpu=,rss=,etime=']),
      this.#run('ps', ['-axww', '-o', 'pid=,comm=']),
      this.#run('ps', ['-axww', '-o', 'pid=,args=']),
    ]);
    return nums ? psProcs(nums, comms ?? '', args ?? '') : [];
  }

  /** CPU since the last reading, in percent of one core. */
  #cpu(pid: number, seconds: number, now: number, next: Map<number, number>): number {
    next.set(pid, seconds);
    const was = this.#last.get(pid);
    const span = (now - this.#lastAt) / 1000;
    return was === undefined || span <= 0 ? 0 : Math.max(0, ((seconds - was) / span) * 100);
  }

  async #linux(): Promise<Proc[]> {
    if (!this.#users) {
      const passwd = await readFile('/etc/passwd', 'utf8').catch(() => '');
      this.#users = new Map(passwd.split('\n').map((l) => l.split(':')).filter((f) => f.length > 2).map((f) => [f[2], f[0]]));
      const stat = await readFile('/proc/stat', 'utf8').catch(() => '');
      this.#boot = Number(/^btime (\d+)/m.exec(stat)?.[1] ?? 0) * 1000;
    }
    const now = Date.now();
    const next = new Map<number, number>();
    const pids = (await readdir('/proc').catch(() => [] as string[])).filter((d) => /^\d+$/.test(d));
    const list = await Promise.all(
      pids.map(async (d): Promise<Proc | null> => {
        const [stat, status, cmdline] = await Promise.all([
          readFile(`/proc/${d}/stat`, 'utf8').catch(() => null),
          readFile(`/proc/${d}/status`, 'utf8').catch(() => ''),
          readFile(`/proc/${d}/cmdline`, 'utf8').catch(() => ''),
        ]);
        if (!stat) return null;
        const { name, f } = procStat(stat);
        const pid = Number(d);
        const uid = /^Uid:\s+(\d+)/m.exec(status)?.[1] ?? '';
        return {
          pid,
          ppid: Number(f[1]),
          name,
          command: cmdline.replace(/\0+$/, '').replace(/\0/g, ' ') || `[${name}]`,
          user: this.#users!.get(uid) ?? uid,
          cpu: this.#cpu(pid, (Number(f[11]) + Number(f[12])) / TICKS, now, next),
          mem: Number(f[21]) * PAGE,
          threads: Number(f[17]) || null,
          started: this.#boot ? this.#boot + (Number(f[19]) / TICKS) * 1000 : null,
        };
      }),
    );
    this.#last = next;
    this.#lastAt = now;
    return list.filter((p): p is Proc => !!p);
  }

  async #windows(): Promise<Proc[]> {
    const out = await this.#run(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | ForEach-Object { "{0}`t{1}`t{2}`t{3}`t{4}`t{5}`t{6}`t{7}" -f $_.ProcessId,$_.ParentProcessId,$_.Name,$_.WorkingSetSize,$_.ThreadCount,($_.KernelModeTime+$_.UserModeTime),$_.CreationDate.ToFileTimeUtc(),$_.CommandLine }',
      ],
      15_000,
    );
    if (!out) return [];
    const now = Date.now();
    const next = new Map<number, number>();
    const user = os.userInfo().username;
    const list = out
      .split('\n')
      .filter(Boolean)
      .map((line): Proc => {
        const [pid, ppid, name, ws, threads, time, created, ...cmd] = line.replace(/\r$/, '').split('\t');
        const p = Number(pid);
        const filetime = Number(created);
        return {
          pid: p,
          ppid: Number(ppid),
          name,
          command: cmd.join('\t') || name,
          user,
          cpu: this.#cpu(p, Number(time) / 1e7 / os.cpus().length, now, next),
          mem: Number(ws) || 0,
          threads: Number(threads) || null,
          started: filetime ? filetime / 10_000 - 11_644_473_600_000 : null,
        };
      });
    this.#last = next;
    this.#lastAt = now;
    return list;
  }
}
