// Reading the machine: CPU per core (from Node), memory and swap, network
// and disk counters, GPUs and volumes, each the way its system says it:
// /proc on Linux; vm_stat, sysctl, netstat, iostat and ioreg on macOS;
// PowerShell (CIM) on Windows. What can't be read is zero or empty, not an
// error: one missing tool mustn't hide the rest.
//
// One file each: machine.ts (what it is), cpu.ts, memory.ts, counters.ts
// (network and disk), gpu.ts and volumes.ts.

export type Run = (cmd: string, args: string[], timeout?: number) => Promise<string | null>;

export { counters, type Counters, linuxDisk, linuxNet, macDisk, macNet } from './counters.ts';
export { CpuMeter } from './cpu.ts';
export { appleGpu, gpus, nvidia } from './gpu.ts';
export { machine } from './machine.ts';
export { linuxMemory, macMemory, memory } from './memory.ts';
export { dfVolumes, volumes } from './volumes.ts';
