// What the machine is: its name, system, CPU, cores, memory, when it
// started and who runs the server. Read once, from Node.

import os from 'node:os';
import type { Machine } from '../../shared/index.ts';

export function machine(): Machine {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpu: cpus[0]?.model.trim() ?? os.arch(),
    cores: cpus.length,
    memory: os.totalmem(),
    bootedAt: Date.now() - os.uptime() * 1000,
    user: os.userInfo().username,
  };
}
