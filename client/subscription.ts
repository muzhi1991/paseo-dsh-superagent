type Handle = (() => void) & { ready: Promise<void> };

// The host may recover a connection itself. Retire closed/broken handles exactly
// once, and ignore late callbacks (including ready rejections) from that handle.
export function listenWhileVisible<Event>(
  subscribe: (
    receive: (event: Event) => void,
    closed: (error: unknown) => void,
  ) => Handle,
  receive: (event: Event) => void,
  report: (error: unknown) => void,
  visible: () => boolean,
  observe: (change: () => void) => () => void,
) {
  let generation = 0,
    failures = 0;
  let handle: Handle | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const prior = handle;
    handle = undefined;
    prior?.();
  }
  function start() {
    if (handle || timer !== undefined || !visible()) return;
    const id = ++generation;
    function failed(error: unknown) {
      if (id !== generation) return;
      stop();
      report(error);
      timer = setTimeout(
        () => {
          timer = undefined;
          start();
        },
        Math.min(1000 * 2 ** Math.min(failures++, 5), 30000),
      );
    }
    try {
      const opened = subscribe((event) => {
        if (id !== generation) return;
        try {
          receive(event);
          failures = 0;
        } catch (e) {
          failed(e);
        }
      }, failed);
      // Some transports replay or close synchronously, before returning a handle.
      if (id === generation) handle = opened;
      else opened();
      void opened.ready.catch(failed);
    } catch (e) {
      failed(e);
    }
  }
  const unobserve = observe(() => {
    if (visible()) start();
    else stop();
  });
  start();
  return () => {
    unobserve();
    stop();
  };
}
