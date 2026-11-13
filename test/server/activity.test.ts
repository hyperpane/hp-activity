// Reading each system's own words (macOS's vm_stat, netstat, ioreg and df;
// Linux's /proc; nvidia-smi), and the server part on this machine: the
// machine, readings as they come, the processes, and signals refused.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { invoke, stream, testHost } from '@hyperpane/sdk/testing';
import { appleGpu, dfVolumes, linuxDisk, linuxMemory, linuxNet, macDisk, macMemory, macNet, nvidia } from '../../src/server/collect/index.ts';
import { make } from '../../src/server/plugin.ts';
import { etime, procStat, psProcs } from '../../src/server/procs.ts';
import type { Proc, WatchEvent } from '../../src/shared/index.ts';

test('macOS memory, as Activity Monitor counts it', () => {
  const vm = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                    30142.
Pages wired down:                             285972.
Pages purgeable:                               45590.
File-backed pages:                            974826.
Anonymous pages:                             1591339.
Pages occupied by compressor:                 137406.`;
  const m = macMemory(vm, 51539607552, 'total = 2048.00M  used = 512.50M  free = 1535.50M  (encrypted)');
  const page = 16384;
  assert.equal(m.used, (1591339 - 45590 + 285972 + 137406) * page);
  assert.equal(m.cached, (974826 + 45590) * page);
  assert.equal(m.swapTotal, 2048 * 1024 * 1024);
  assert.equal(m.swapUsed, 512.5 * 1024 * 1024);
});

test('Linux memory, network and disks from /proc', () => {
  const m = linuxMemory('MemTotal:       16000000 kB\nMemFree:  1000000 kB\nMemAvailable:    6000000 kB\nBuffers:  100000 kB\nCached:  3000000 kB\nSwapTotal: 2000000 kB\nSwapFree: 1500000 kB\n');
  assert.equal(m.total, 16000000 * 1024);
  assert.equal(m.used, 10000000 * 1024);
  assert.equal(m.swapUsed, 500000 * 1024);
  const dev = 'Inter-|   Receive |  Transmit\n face |bytes    packets\n    lo: 999 1 0 0 0 0 0 0 999 1 0 0 0 0 0 0\n  eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0\n wlan0: 5 1 0 0 0 0 0 0 7 1 0 0 0 0 0 0\n';
  assert.deepEqual(linuxNet(dev), { rx: 1005, tx: 2007 });
  const disks = ['   8       0 sda 100 0 10 0 50 0 20 0 0 0 0', '   8       1 sda1 100 0 10 0 50 0 20 0 0 0 0', ' 259       0 nvme0n1 1 0 4 0 1 0 6 0 0 0 0', '   7       0 loop0 1 0 999 0 1 0 999 0 0 0 0'].join('\n');
  assert.deepEqual(linuxDisk(disks), { read: (10 + 4) * 512, write: (20 + 6) * 512 }, 'whole disks only: not partitions, not loops');
});

test('macOS network (netstat -ib) and disks (ioreg)', () => {
  const net = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                      27654577     0 34883376546 27654577     0 34883376546     0
lo0        16384 127           localhost       27654577     - 34883376546 27654577     - 34883376546     -
en0        1500  <Link#11>   a4:fc:14:1a:2b:3c 1000000     0 900000000   800000     0 100000000     0
en0        1500  192.168.1     192.168.1.5     1000000     - 900000000   800000     - 100000000     -
utun0      1380  <Link#18>                         10     0       1234        5     0        567     0`;
  assert.deepEqual(macNet(net), { rx: 900000000 + 1234, tx: 100000000 + 567 }, 'each interface once, not lo');
  const io = '"Statistics" = {"Bytes (Read)"=0,"Bytes (Write)"=0}\n"Statistics" = {"Operations (Write)"=3,"Bytes (Read)"=477367275520,"Bytes (Write)"=677494067200}';
  assert.deepEqual(macDisk(io), { read: 477367275520, write: 677494067200 });
});

test('GPUs: NVIDIA, and Apple’s', () => {
  assert.deepEqual(nvidia('0, NVIDIA GeForce RTX 4090, 37, 2048, 24564, 61, 120.45\n1, Tesla T4, [N/A], 0, 15360, 40, [N/A]\n'), [
    { name: 'NVIDIA GeForce RTX 4090', util: 37, memUsed: 2048 * 1048576, memTotal: 24564 * 1048576, temp: 61, power: 120.45 },
    { name: 'Tesla T4', util: null, memUsed: 0, memTotal: 15360 * 1048576, temp: 40, power: null },
  ]);
  assert.deepEqual(appleGpu('"PerformanceStatistics" = {"Device Utilization %"=32,"In use system memory"=1462599680}', 'Apple M4 Max GPU'), [
    { name: 'Apple M4 Max GPU', util: 32, memUsed: 1462599680, memTotal: null, temp: null, power: null },
  ]);
  assert.deepEqual(appleGpu('nothing', 'x'), []);
});

test('volumes: real disks, macOS’s Data volume as /', () => {
  const df = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/disk3s1s1   971350180  13751688 344496496     4%    /
devfs                  359       359         0   100%    /dev
/dev/disk3s5     971350180 587781316 344496496    64%    /System/Volumes/Data
/dev/disk3s6     971350180   1048576 344496496     1%    /System/Volumes/VM
/dev/disk5s1        429256    426184      3072   100%    /Volumes/hyperpane 0.2.1-arm64
/dev/disk2s1     500000000 100000000 400000000    20%    /Volumes/Backup Drive`;
  assert.deepEqual(dfVolumes(df), [
    { mount: '/', size: 971350180 * 1024, used: 587781316 * 1024 },
    { mount: '/Volumes/Backup Drive', size: 500000000 * 1024, used: 100000000 * 1024 },
  ]);
});

test('processes: ps (names with spaces), /proc/<pid>/stat, etime', () => {
  assert.equal(etime('05:03'), 303);
  assert.equal(etime('2-01:00:00'), 2 * 86400 + 3600);
  const list = psProcs('  1     0 root      0.3  12000 10-00:00:00\n 501   1 me       25.5 204800 01:00\n', '    1 /sbin/launchd\n  501 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n', '  501 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=gpu\n', 1_000_000_000);
  assert.deepEqual(list[1], { pid: 501, ppid: 1, name: 'Google Chrome', command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=gpu', user: 'me', cpu: 25.5, mem: 204800 * 1024, threads: null, started: 1_000_000_000 - 60_000 });
  const { name, f } = procStat('1234 (my (odd) proc) S 1 1234 1234 0 -1 4194560 100 0 0 0 250 50 0 0 20 0 7 0 5000 10000000 2500 18446744073709551615');
  assert.equal(name, 'my (odd) proc');
  assert.equal(f[1], '1', 'ppid');
  assert.equal(Number(f[11]) + Number(f[12]), 300, 'utime + stime');
  assert.equal(f[17], '7', 'threads');
  assert.equal(f[21], '2500', 'rss pages');
});

test('on this machine: the machine, readings as they come, its processes', async () => {
  const plugin = make({ every: 200 })(testHost({ id: 'activity' }));
  const s = stream<WatchEvent>(plugin, { op: 'watch' });
  const first = await s.next();
  assert.ok('machine' in first && first.machine.cores > 0 && first.machine.memory > 0);
  await s.next();
  const r = await s.next();
  assert.ok('sample' in r);
  const sample = r.sample;
  assert.equal(sample.cpu.cores.length, first.machine.cores);
  assert.ok(sample.cpu.total >= 0 && sample.cpu.total <= 100);
  assert.ok(sample.mem.used > 0 && sample.mem.used <= sample.mem.total);
  s.cancel();
  const p = stream<Proc[]>(plugin, { op: 'processes' });
  const list = await p.next();
  p.cancel();
  assert.ok(list.some((x) => x.pid === process.pid), 'this process is in the list');
});

test('signals: a real one ends a process; nonsense is refused', async () => {
  const plugin = make()(testHost({ id: 'activity' }));
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await new Promise((r) => child.once('spawn', r));
  const gone = new Promise((r) => child.once('exit', (_c, sig) => r(sig)));
  await invoke(plugin, { op: 'signal', pid: child.pid, signal: 'TERM' });
  assert.equal(await gone, 'SIGTERM');
  await assert.rejects(invoke(plugin, { op: 'signal', pid: 1, signal: 'KILL' }), /isn’t a process this can signal/);
  await assert.rejects(invoke(plugin, { op: 'signal', pid: child.pid, signal: 'NUKE' }), /no signal “NUKE”/);
  await assert.rejects(invoke(plugin, { op: 'signal', pid: process.pid, signal: 'TERM' }), /this plugin’s own process/);
  await assert.rejects(invoke(plugin, { op: 'signal', pid: 999_999_9, signal: 'TERM' }), /isn’t running any more/);
});
