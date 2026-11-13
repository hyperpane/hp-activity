// The server part's calls, apart from main.ts so the tests can make it with
// a test host.
//   watch (subscription)      the machine and the history so far, then a reading every 2 s
//   processes (subscription)  the process list, every 2 s
//   signal                    sends a process a signal (end, kill, stop, go on)
//
// Readings are taken while someone watches, and the last 5 minutes are
// kept, so a window opened again shows what happened meanwhile.

import { execFile } from 'node:child_process';
import os from 'node:os';
import { type Host, PluginError, json } from '@hyperpane/sdk/server';
import { type Proc, type Sample, SIGNALS, type Signal } from '../shared/index.ts';
import { CpuMeter, type Counters, type Run, counters, gpus, machine, memory, volumes } from './collect/index.ts';
import { Procs } from './procs.ts';

export interface Options {
  /** Runs a tool: its output, or null when it fails (the tests give theirs). */
  run?: Run;
  /** ms between readings. */
  every?: number;
}

const KEEP = 150;

export function make(o: Options = {}) {
  return json((host: Host) => {
    const run: Run =
      o.run ??
      ((cmd, args, timeout = 8000) =>
        new Promise((resolve) => {
          execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => resolve(err && !stdout ? null : String(stdout)));
        }));
    const every = o.every ?? 2000;
    const info = machine();
    const cpu = new CpuMeter();
    const procs = new Procs(run);
    const history: Sample[] = [];
    const listeners = new Set<(s: Sample) => void>();
    let last: { at: number; c: Counters } | null = null;
    let volumesAt = 0;
    let lastVolumes: Sample['volumes'] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function sample(): Promise<Sample> {
      const now = Date.now();
      const [mem, c, g] = await Promise.all([memory(run), counters(run), gpus(run, info.cpu)]);
      // Volumes change slowly: every 30 s.
      if (now - volumesAt > 30_000) {
        lastVolumes = await volumes(run);
        volumesAt = now;
      }
      const span = last ? (now - last.at) / 1000 : 0;
      const rate = (a: number, b: number) => (span > 0 && a >= b ? (a - b) / span : 0);
      const s: Sample = {
        at: now,
        cpu: { ...cpu.read(), load: os.loadavg() as [number, number, number] },
        mem,
        net: { rx: last ? rate(c.rx, last.c.rx) : 0, tx: last ? rate(c.tx, last.c.tx) : 0 },
        disk: { read: last ? rate(c.read, last.c.read) : 0, write: last ? rate(c.write, last.c.write) : 0 },
        gpus: g,
        volumes: lastVolumes,
      };
      last = { at: now, c };
      return s;
    }

    async function tick() {
      timer = null;
      if (!listeners.size) return;
      try {
        const s = await sample();
        history.push(s);
        if (history.length > KEEP) history.shift();
        for (const f of listeners) f(s);
      } catch (e) {
        host.log(`a reading failed: ${(e as Error).message}`);
      }
      if (listeners.size && !timer) timer = setTimeout(tick, every);
    }

    const wait = (signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });

    return {
      calls: {
        signal: ({ pid, signal }) => {
          const p = Number(pid);
          if (!Number.isInteger(p) || p <= 1) throw new PluginError('That isn’t a process this can signal.');
          if (!SIGNALS.includes(signal as Signal)) throw new PluginError(`There's no signal “${signal}”.`);
          if (p === process.pid) throw new PluginError('That’s this plugin’s own process.');
          try {
            process.kill(p, `SIG${signal}` as NodeJS.Signals);
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (code === 'ESRCH') throw new PluginError('It isn’t running any more.');
            if (code === 'EPERM') throw new PluginError('Not allowed: it belongs to another user (the server runs as you).');
            throw new PluginError((e as Error).message);
          }
          return null;
        },
      },
      subscriptions: {
        watch: async (_req, out) => {
          out.emit({ machine: info, history });
          const send = (s: Sample) => out.emit({ sample: s });
          listeners.add(send);
          if (!timer) timer = setTimeout(tick, history.length ? 0 : 50);
          await wait(out.signal);
          listeners.delete(send);
        },
        processes: async (_req, out) => {
          // The first reading only starts the CPU count on Linux and
          // Windows: the second, a moment later, says something.
          await procs.read();
          while (!out.signal.aborted) {
            const list: Proc[] = await procs.read().catch(() => []);
            if (!out.signal.aborted) out.emit(list);
            await Promise.race([new Promise((r) => setTimeout(r, every)), wait(out.signal)]);
          }
        },
      },
      busy: () => false,
    };
  });
}

export const plugin = make();
