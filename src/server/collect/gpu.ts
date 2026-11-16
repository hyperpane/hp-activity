// GPUs: NVIDIA's through nvidia-smi (anywhere it's installed), Apple's
// through ioreg, AMD's and Intel Arc's from the kernel on Linux. How busy
// each is, and its memory, temperature and power where it says.

import { readFile } from 'node:fs/promises';
import type { Gpu } from '../../shared/index.ts';
import type { Run } from './index.ts';

const PLATFORM = process.platform;

/** nvidia-smi's CSV: index, name, utilization, memory used and total (MiB),
 * temperature, power. */
export function nvidia(out: string): Gpu[] {
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [, name, util, used, total, temp, power] = line.split(',').map((x) => x.trim());
      const n = (v: string) => (v && !/N\/A|not supported/i.test(v) ? Number(v) : null);
      const mib = (v: string) => (n(v) === null ? null : n(v)! * 1024 * 1024);
      return { name, util: n(util), memUsed: mib(used), memTotal: mib(total), temp: n(temp), power: n(power) };
    });
}

/** ioreg's IOAccelerator: Apple's GPU, its "Device Utilization %". */
export function appleGpu(out: string, name: string): Gpu[] {
  const util = /"Device Utilization %"=(\d+)/.exec(out);
  if (!util) return [];
  const mem = /"In use system memory"=(\d+)/.exec(out);
  return [{ name, util: Number(util[1]), memUsed: mem ? Number(mem[1]) : null, memTotal: null, temp: null, power: null }];
}

let hasNvidia: boolean | null = null;

export async function gpus(run: Run, cpuName: string): Promise<Gpu[]> {
  if (hasNvidia !== false) {
    const out = await run(
      'nvidia-smi',
      ['--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw', '--format=csv,noheader,nounits'],
      4000,
    );
    hasNvidia = out !== null;
    if (out) return nvidia(out);
  }
  if (PLATFORM === 'darwin') {
    const out = await run('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator']);
    if (out) return appleGpu(out, /Apple/.test(cpuName) ? `${cpuName} GPU` : 'GPU');
  }
  if (PLATFORM === 'linux') {
    // AMD (and Intel Arc): the kernel says how busy each card is.
    const list: Gpu[] = [];
    for (let i = 0; i < 8; i++) {
      const busy = await readFile(`/sys/class/drm/card${i}/device/gpu_busy_percent`, 'utf8').catch(() => null);
      if (busy === null) continue;
      const used = await readFile(`/sys/class/drm/card${i}/device/mem_info_vram_used`, 'utf8').catch(() => null);
      const total = await readFile(`/sys/class/drm/card${i}/device/mem_info_vram_total`, 'utf8').catch(() => null);
      list.push({ name: `GPU ${i}`, util: Number(busy), memUsed: used ? Number(used) : null, memTotal: total ? Number(total) : null, temp: null, power: null });
    }
    return list;
  }
  return [];
}
