// Memory and swap: used, cached and in all, counted the way the system's
// own monitor counts them (Activity Monitor's sums on macOS, MemAvailable on
// Linux); elsewhere Node's free memory.

import { readFile } from 'node:fs/promises';
import os from 'node:os';
import type { Sample } from '../../shared/index.ts';
import type { Run } from './index.ts';

const PLATFORM = process.platform;

/** `vm_stat`'s pages as Activity Monitor counts them. */
export function macMemory(vmStat: string, total: number, swap: string): Sample['mem'] {
  const page = Number(/page size of (\d+) bytes/.exec(vmStat)?.[1] ?? 16384);
  const pages = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(vmStat)?.[1] ?? 0) * page;
  const app = pages('Anonymous pages') - pages('Pages purgeable');
  const used = Math.max(0, app) + pages('Pages wired down') + pages('Pages occupied by compressor');
  const cached = pages('File-backed pages') + pages('Pages purgeable');
  // vm.swapusage: total = 2048.00M  used = 1024.00M  free = …
  const mb = (label: string) => Number(new RegExp(`${label} = ([\\d.]+)M`).exec(swap)?.[1] ?? 0) * 1024 * 1024;
  return { total, used: Math.min(total, used), cached, swapTotal: mb('total'), swapUsed: mb('used') };
}

export function linuxMemory(meminfo: string): Sample['mem'] {
  const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(meminfo)?.[1] ?? 0) * 1024;
  const total = kb('MemTotal');
  const available = kb('MemAvailable') || kb('MemFree') + kb('Cached');
  return { total, used: total - available, cached: kb('Cached') + kb('Buffers'), swapTotal: kb('SwapTotal'), swapUsed: kb('SwapTotal') - kb('SwapFree') };
}

export async function memory(run: Run): Promise<Sample['mem']> {
  if (PLATFORM === 'linux') {
    const info = await readFile('/proc/meminfo', 'utf8').catch(() => null);
    if (info) return linuxMemory(info);
  }
  if (PLATFORM === 'darwin') {
    const [vm, swap] = await Promise.all([run('vm_stat', []), run('sysctl', ['-n', 'vm.swapusage'])]);
    if (vm) return macMemory(vm, os.totalmem(), swap ?? '');
  }
  const total = os.totalmem();
  return { total, used: total - os.freemem(), cached: 0, swapTotal: 0, swapUsed: 0 };
}
