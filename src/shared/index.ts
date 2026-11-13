// What both parts share: one reading of the server's activity, and its
// processes.

export interface Gpu {
  name: string;
  /** Percent busy (null: it doesn't say). */
  util: number | null;
  /** Bytes of its memory in use, and in all (null: it doesn't say). */
  memUsed: number | null;
  memTotal: number | null;
  /** °C. */
  temp: number | null;
  /** Watts. */
  power: number | null;
}

export interface Volume {
  mount: string;
  /** Bytes. */
  size: number;
  used: number;
}

/** One reading, every 2 seconds. Rates are per second since the last. */
export interface Sample {
  at: number;
  cpu: {
    /** Percent of every core together (0 to 100). */
    total: number;
    /** Each core, 0 to 100. */
    cores: number[];
    /** 1, 5 and 15 minutes (zeros on Windows). */
    load: [number, number, number];
  };
  mem: {
    total: number;
    /** What programs use (on macOS: app memory, wired and compressed, as
     * Activity Monitor says). */
    used: number;
    /** Kept for files, given back when needed. */
    cached: number;
    swapTotal: number;
    swapUsed: number;
  };
  net: { rx: number; tx: number };
  disk: { read: number; write: number };
  gpus: Gpu[];
  volumes: Volume[];
}

/** What doesn't change: the machine. */
export interface Machine {
  hostname: string;
  os: string;
  arch: string;
  cpu: string;
  cores: number;
  memory: number;
  /** Since when it runs (ms since 1970). */
  bootedAt: number;
  /** Who the server runs as. */
  user: string;
}

export interface Proc {
  pid: number;
  ppid: number;
  name: string;
  /** Its command line (what it was started with), when it can be read. */
  command: string;
  user: string;
  /** Percent of one core (can pass 100 with several threads). */
  cpu: number;
  /** Bytes in memory. */
  mem: number;
  /** Threads, when it says. */
  threads: number | null;
  /** Since when it runs (ms since 1970), when it says. */
  started: number | null;
}

/** What the `watch` subscription sends: the machine once, the history so
 * far once, then each reading. */
export type WatchEvent = { machine: Machine; history: Sample[] } | { sample: Sample };

export const SIGNALS = ['TERM', 'KILL', 'INT', 'HUP', 'STOP', 'CONT'] as const;
export type Signal = (typeof SIGNALS)[number];
