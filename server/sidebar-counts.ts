import type { PluginSubscriptionContext } from "@getpaseo/plugin/server";
import { sidebarCounts, type SidebarSnapshot } from "../shared/api.ts";
import { config, management } from "./connection.ts";

async function readCounts(signal: AbortSignal): Promise<SidebarSnapshot> {
  const c = await config();
  if (!c.cookie) return null;
  const overview = await management(c, "overview", signal);
  return sidebarCounts.event.parse({
    running: overview.executor.running,
    needsAttention: overview.person.length,
  });
}

export function createSidebarPoller(read = readCounts) {
  type Listener = (snapshot: SidebarSnapshot) => void;
  const listeners = new Map<Listener, () => void>();
  let snapshot: SidebarSnapshot | undefined;
  let session: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function publish(next: SidebarSnapshot) {
    if (
      snapshot !== undefined &&
      snapshot?.running === next?.running &&
      snapshot?.needsAttention === next?.needsAttention
    )
      return;
    snapshot = next;
    for (const notify of listeners.keys()) notify(next);
  }

  async function poll(signal: AbortSignal) {
    let next: SidebarSnapshot;
    try {
      next = await read(signal);
    } catch {
      next = null;
    }
    if (signal.aborted) return;
    publish(next);
    timer = setTimeout(() => void poll(signal), 15_000);
  }

  function stop() {
    session?.abort();
    session = undefined;
    clearTimeout(timer);
  }

  function start() {
    session = new AbortController();
    void poll(session.signal);
  }

  function subscribe({
    push,
    signal,
  }: Pick<PluginSubscriptionContext<SidebarSnapshot>, "push" | "signal">) {
    if (signal.aborted) return;
    return new Promise<void>((resolve, reject) => {
      function release() {
        if (!listeners.delete(notify)) return;
        signal.removeEventListener("abort", close);
        if (!listeners.size) {
          stop();
          snapshot = undefined;
        }
      }
      function close() {
        release();
        resolve();
      }
      function notify(value: SidebarSnapshot) {
        void push(value).catch((error) => {
          release();
          reject(error);
        });
      }
      listeners.set(notify, close);
      signal.addEventListener("abort", close, { once: true });
      if (!session) start();
      else if (snapshot !== undefined) notify(snapshot);
    });
  }

  return {
    subscribe,
    connectionChanged() {
      if (!listeners.size) return;
      // Hide the previous instance before reading the new connection.
      stop();
      publish(null);
      start();
    },
    dispose() {
      for (const close of listeners.values()) close();
    },
  };
}
