// CPU use per core and in all, from Node's own counters (the same on every
// system): each reading is the use since the one before.

import os from 'node:os';

/** CPU use since the last call, per core and in all. */
export class CpuMeter {
  #last = os.cpus().map((c) => c.times);
  read(): { total: number; cores: number[] } {
    const now = os.cpus().map((c) => c.times);
    const cores = now.map((t, i) => {
      const was = this.#last[i] ?? t;
      const busy = t.user + t.nice + t.sys + t.irq - (was.user + was.nice + was.sys + was.irq);
      const all = busy + t.idle - was.idle;
      return all > 0 ? Math.min(100, Math.max(0, (busy / all) * 100)) : 0;
    });
    this.#last = now;
    const total = cores.length ? cores.reduce((a, b) => a + b, 0) / cores.length : 0;
    return { total, cores };
  }
}
