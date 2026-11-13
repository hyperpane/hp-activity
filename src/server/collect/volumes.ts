// Volumes: the disks people mean, with their size and use, from df (or CIM
// on Windows); system, snapshot and small volumes left out.

import type { Volume } from '../../shared/index.ts';
import type { Run } from './index.ts';

const PLATFORM = process.platform;

/** `df -kP`: real volumes (not devfs, tmpfs, snapshots' system volumes). */
export function dfVolumes(out: string): Volume[] {
  const list: Volume[] = [];
  for (const line of out.trim().split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 6) continue;
    const [fs, blocks, used] = f;
    const mount = f.slice(5).join(' ');
    if (!fs.startsWith('/dev/') || /^\/(System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware)|dev|boot\/efi)/.test(mount) || mount.startsWith('/snap/')) continue;
    list.push({ mount, size: Number(blocks) * 1024, used: Number(used) * 1024 });
  }
  // macOS: the system volume (/) is sealed and small; what you use is its
  // Data volume, which is what /'s numbers mean to people. Recovery,
  // simulators' images and mounted installers aren't disks to watch.
  const data = list.find((v) => v.mount === '/System/Volumes/Data');
  return list
    .filter((v) => !(data && v.mount === '/') && !/^\/(Volumes\/Recovery|Library\/Developer\/CoreSimulator)/.test(v.mount) && v.size >= 2 ** 30)
    .map((v) => (v === data ? { ...v, mount: '/' } : v));
}

export async function volumes(run: Run): Promise<Volume[]> {
  if (PLATFORM === 'win32') {
    const out = await run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { "{0}|{1}|{2}" -f $_.DeviceID,$_.Size,$_.FreeSpace }']);
    return (out ?? '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [mount, size, free] = l.trim().split('|');
        return { mount, size: Number(size) || 0, used: (Number(size) || 0) - (Number(free) || 0) };
      });
  }
  const out = await run('df', ['-kP']);
  return out ? dfVolumes(out) : [];
}
