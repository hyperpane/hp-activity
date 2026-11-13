# Activity

The server's activity, as Activity Monitor or htop shows it.

- **Overview:** CPU (in all, and every core as a bar, with the load
  average), memory (used and cached, swap), each GPU (how busy, its memory,
  temperature and power when it says), network in and out, disk reads and
  writes, and how full each volume is: charted over the last 5 minutes
  (hover a chart for its values), with the busiest processes below.
- **Processes:** every process with its CPU, memory, threads, user and
  start; sort by any column, search by name, command or pid, only yours, or
  as a tree under their parents. Select one to see its command line, and
  **End** (SIGTERM) or **Force quit** (SIGKILL) it; both ask first.

Readings are taken every 2 seconds while a window shows them, and the last
5 minutes are kept, so a window opened again shows what happened meanwhile.

## Where the numbers come from

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| CPU | Node (`os.cpus()`), per core | the same | the same |
| Memory | `vm_stat` (app, wired and compressed: as Activity Monitor), `sysctl vm.swapusage` | `/proc/meminfo` (MemAvailable) | Node |
| Network | `netstat -ibn` | `/proc/net/dev` | CIM performance counters |
| Disk | `ioreg` (IOBlockStorageDriver) | `/proc/diskstats` (whole disks) | CIM performance counters |
| GPU | `ioreg` (IOAccelerator: Apple's GPU) | `nvidia-smi`; AMD and Intel from `/sys/class/drm` | `nvidia-smi` |
| Volumes | `df -kP` (the Data volume as /) | `df -kP` | CIM |
| Processes | `ps` (its %CPU is recent) | `/proc/<pid>` (CPU since the last reading) | CIM `Win32_Process` |

What a system can't say is left out, not an error. The server runs as you:
processes of other users can be seen, not ended.

## Develop

```sh
./build.sh --test
```
