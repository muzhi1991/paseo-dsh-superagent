import { isDeepStrictEqual } from "node:util";

export type Sample<T> =
  | { type: "snapshot"; data: T }
  | { type: "error"; message: string };
type Notify<T> = (next: Sample<T>, previous?: T) => Promise<void>;
type Listener = {
  interval: number;
  flush: () => void;
  reset: () => void;
  close: (error?: unknown) => void;
};
type Watch<T> = {
  listeners: Set<Listener>;
  controller: AbortController;
  read: (signal: AbortSignal) => Promise<T>;
  createRead: () => (signal: AbortSignal) => Promise<T>;
  timer?: ReturnType<typeof setTimeout>;
  sample?: Sample<T>;
  reading: boolean;
  dirty: boolean;
  invalidated: boolean;
  failures: number;
  finished: number;
};

// One reader per canonical resource. Infinity denotes a write-driven resource.
export class WatchPool<T> {
  private watches = new Map<string, Watch<T>>();

  private schedule(w: Watch<T>) {
    clearTimeout(w.timer);
    if (w.reading || !w.listeners.size) return;
    const interval = Math.min(...Array.from(w.listeners, (l) => l.interval));
    const delay = w.failures
      ? Math.min(
          Math.min(interval, 5000) * 2 ** Math.min(w.failures - 1, 5),
          60000,
        )
      : interval;
    if (Number.isFinite(delay))
      w.timer = setTimeout(
        () => void this.poll(w),
        Math.max(0, w.finished + delay - Date.now()),
      );
  }

  private async poll(w: Watch<T>) {
    if (w.reading || !w.listeners.size) return;
    clearTimeout(w.timer);
    w.reading = true;
    w.dirty = false;
    const signal = w.controller.signal;
    let next: Sample<T>;
    try {
      next = { type: "snapshot", data: await w.read(signal) };
    } catch (error) {
      next = {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    w.reading = false;
    if (!w.listeners.size) return;
    if (signal.aborted || w.dirty) {
      void this.poll(w);
      return;
    }
    w.finished = Date.now();
    w.failures = next.type === "error" ? w.failures + 1 : 0;
    if (!isDeepStrictEqual(w.sample, next)) w.sample = next;
    w.invalidated = false;
    for (const listener of w.listeners) listener.flush();
    this.schedule(w);
  }

  subscribe(
    key: string,
    createRead: () => Watch<T>["read"],
    interval: number,
    signal: AbortSignal,
    notify: Notify<T>,
    onReset?: () => Promise<void>,
  ) {
    if (signal.aborted) return;
    let watch = this.watches.get(key);
    if (!watch) {
      watch = {
        listeners: new Set(),
        controller: new AbortController(),
        read: createRead(),
        createRead,
        reading: false,
        dirty: false,
        invalidated: false,
        failures: 0,
        finished: 0,
      };
      this.watches.set(key, watch);
    }
    const w = watch;
    return new Promise<void>((resolve, reject) => {
      const release = () => close();
      const close = (error?: unknown) => {
        if (!w.listeners.delete(listener)) return;
        signal.removeEventListener("abort", release);
        if (!w.listeners.size) {
          clearTimeout(w.timer);
          w.controller.abort();
          this.watches.delete(key);
        } else this.schedule(w);
        if (error) reject(error);
        else resolve();
      };
      let sent: Sample<T> | undefined;
      let sending = false,
        resetPending = false;
      // Pace each transport independently. A slow phone catches up to the latest
      // sample using its own last delivered baseline.
      async function flush() {
        if (sending) return;
        sending = true;
        try {
          while (w.listeners.has(listener)) {
            if (resetPending) {
              resetPending = false;
              sent = undefined;
              if (onReset) await onReset();
              continue;
            }
            const next = w.sample;
            if (w.invalidated || !next || sent === next) break;
            await notify(
              next,
              sent?.type === "snapshot" ? sent.data : undefined,
            );
            sent = next;
          }
        } catch (e) {
          close(e);
        } finally {
          sending = false;
        }
      }
      const listener = {
        interval,
        close,
        flush,
        reset() {
          resetPending = true;
          void flush();
        },
      };
      w.listeners.add(listener);
      signal.addEventListener("abort", release, { once: true });
      if (!w.sample) void this.poll(w);
      else {
        void flush();
        this.schedule(w);
      }
    });
  }

  refresh(reset = false) {
    for (const w of this.watches.values()) {
      w.invalidated = true;
      if (reset) {
        w.controller.abort();
        w.controller = new AbortController();
        w.failures = 0;
        w.sample = undefined;
        for (const listener of w.listeners) listener.reset();
        w.read = w.createRead();
      }
      if (w.reading) w.dirty = true;
      else void this.poll(w);
    }
  }

  dispose() {
    for (const w of this.watches.values())
      for (const listener of w.listeners) listener.close();
  }
}
