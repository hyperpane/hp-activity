// Network and disk counters: bytes in and out and bytes read and written
// since the machine started, all interfaces and disks together. Rates are
// the difference between two readings.

import { readFile } from 'node:fs/promises';
import type { Run } from './index.ts';

const PLATFORM = process.platform;

export interface Counters {
  rx: number;
  tx: number;
  read: number;
  write: number;
}

/** /proc/net/dev: bytes in and out, all interfaces but lo. */
export function linuxNet(dev: string): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const line of dev.split('\n').slice(2)) {
    const [name, rest] = line.split(':');
    if (!rest || name.trim() === 'lo') continue;
    const f = rest.trim().split(/\s+/).map(Number);
    rx += f[0] || 0;
    tx += f[8] || 0;
  }
  return { rx, tx };
}

/** /proc/diskstats: sectors read and written (512 bytes), whole disks only. */
export function linuxDisk(stats: string): { read: number; write: number } {
  let read = 0;
  let write = 0;
  for (const line of stats.split('\n')) {
    const f = line.trim().split(/\s+/);
    const name = f[2];
    if (!name || /^(loop|ram|zram|dm-|sr)/.test(name) || /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+)\d+$|^nvme\d+n\d+p\d+$|^mmcblk\d+p\d+$/.test(name)) continue;
    read += Number(f[5]) * 512 || 0;
    write += Number(f[9]) * 512 || 0;
  }
  return { read, write };
}

/** `netstat -ib`: each interface's first (link) line; not lo. */
export function macNet(out: string): { rx: number; tx: number } {
  const lines = out.trim().split('\n');
  const head = lines[0]?.trim().split(/\s+/) ?? [];
  const ib = head.indexOf('Ibytes');
  const ob = head.indexOf('Obytes');
  let rx = 0;
  let tx = 0;
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const f = line.trim().split(/\s+/);
    if (!f[0] || f[0].startsWith('lo') || seen.has(f[0]) || !f[2]?.startsWith('<Link')) continue;
    seen.add(f[0]);
    // Link lines have no Address column when the interface has no MAC.
    const shift = f.length < head.length ? -1 : 0;
    rx += Number(f[ib + shift]) || 0;
    tx += Number(f[ob + shift]) || 0;
  }
  return { rx, tx };
}

/** ioreg's IOBlockStorageDriver statistics: bytes each disk has read and
 * written since it started. */
export function macDisk(out: string): { read: number; write: number } {
  let read = 0;
  let write = 0;
  for (const m of out.matchAll(/"Bytes \(Read\)"=(\d+)/g)) read += Number(m[1]);
  for (const m of out.matchAll(/"Bytes \(Write\)"=(\d+)/g)) write += Number(m[1]);
  return { read, write };
}

export async function counters(run: Run): Promise<Counters> {
  if (PLATFORM === 'linux') {
    const [dev, disks] = await Promise.all([readFile('/proc/net/dev', 'utf8').catch(() => ''), readFile('/proc/diskstats', 'utf8').catch(() => '')]);
    return { ...linuxNet(dev), ...linuxDisk(disks) };
  }
  if (PLATFORM === 'darwin') {
    const [net, io] = await Promise.all([run('netstat', ['-ibn']), run('ioreg', ['-r', '-c', 'IOBlockStorageDriver', '-d', '1', '-w', '0'])]);
    return { ...(net ? macNet(net) : { rx: 0, tx: 0 }), ...(io ? macDisk(io) : { read: 0, write: 0 }) };
  }
  if (PLATFORM === 'win32') {
    const out = await run('powershell', [
      '-NoProfile',
      '-Command',
      '$n=Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface; $d=Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk -Filter "Name=\'_Total\'"; ' +
        '"{0} {1} {2} {3}" -f ($n|Measure BytesReceivedPersec -Sum).Sum,($n|Measure BytesSentPersec -Sum).Sum,$d.DiskReadBytesPersec,$d.DiskWriteBytesPersec',
    ]);
    const [rx, tx, read, write] = (out ?? '').trim().split(/\s+/).map(Number);
    return { rx: rx || 0, tx: tx || 0, read: read || 0, write: write || 0 };
  }
  return { rx: 0, tx: 0, read: 0, write: 0 };
}
