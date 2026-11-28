import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as flush } from "node:timers/promises";
import { WatchPool } from "../server/live.ts";

function client(pool, read, interval = 15000) {
  const events = [];
  const controller = new AbortController();
  const done = pool.subscribe(
    "view",
    () => read,
    interval,
    controller.signal,
    async (event) => {
      events.push(event);
    },
  );
  return { events, done, close: () => controller.abort() };
}

test("listeners share one read, cached replay and the shortest active cadence; last release stops the timer", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1 });
  let reads = 0,
    running = 2;
  const read = async () => {
    reads++;
    return { running };
  };
  const pool = new WatchPool();
  const a = client(pool, read);
  await flush();
  const b = client(pool, read, 10000);
  assert.deepEqual(a.events, b.events);
  assert.equal(reads, 1);
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    await flush();
  };
  await tick(10000);
  assert.equal(reads, 2);
  assert.equal(a.events.length, 1);
  running++;
  b.close();
  await tick(10000);
  assert.equal(reads, 2);
  await tick(5000);
  assert.equal(reads, 3);
  assert.equal(a.events.length, 2);
  a.close();
  await tick(60000);
  assert.equal(reads, 3);
  await Promise.all([a.done, b.done]);
});

test("a write racing a read discards its result and coalesces wakeups; reset and disconnect cancel old reads", async () => {
  const reads = [];
  const read = (signal) =>
    new Promise((resolve) => reads.push({ signal, resolve }));
  const pool = new WatchPool();
  const a = client(pool, read);
  pool.refresh();
  pool.refresh();
  assert.equal(reads.length, 1);
  reads[0].resolve("before write");
  await flush();
  assert.equal(reads.length, 2);
  assert.deepEqual(a.events, []);
  pool.refresh(true);
  assert(reads[1].signal.aborted);
  reads[1].resolve("previous instance");
  await flush();
  reads[2].resolve("current");
  await flush();
  assert.deepEqual(a.events, [{ type: "snapshot", data: "current" }]);
  pool.refresh();
  a.close();
  assert(reads[3].signal.aborted);
  const b = client(pool, read);
  reads[3].resolve("after close");
  reads[4].resolve("new connection");
  await flush();
  assert.deepEqual(b.events, [{ type: "snapshot", data: "new connection" }]);
  pool.dispose();
  await Promise.all([a.done, b.done]);
});

test("an unchanged failure is emitted once and recovery replays an authoritative snapshot", async () => {
  const pool = new WatchPool();
  let failed = false;
  const c = client(pool, async () => {
    if (failed) throw Error("offline");
    return 0;
  });
  await flush();
  failed = true;
  pool.refresh();
  await flush();
  pool.refresh();
  await flush();
  failed = false;
  pool.refresh();
  await flush();
  assert.deepEqual(c.events, [
    { type: "snapshot", data: 0 },
    { type: "error", message: "offline" },
    { type: "snapshot", data: 0 },
  ]);
  c.close();
});

test("a subscriber joining after a write waits for a fresh first snapshot even if the result is unchanged", async () => {
  for (const next of ["old", "new"]) {
    const pool = new WatchPool();
    const reads = [];
    const read = () => new Promise((resolve) => reads.push(resolve));
    const first = client(pool, read);
    reads.shift()("old");
    await flush();
    pool.refresh();
    const joined = client(pool, read);
    try {
      assert.deepEqual(joined.events, []);
      reads.shift()(next);
      await flush();
      assert.deepEqual(joined.events, [{ type: "snapshot", data: next }]);
      assert.equal(first.events.length, next === "old" ? 1 : 2);
    } finally {
      pool.dispose();
    }
  }
});

test("a stalled listener coalesces samples without blocking peers; reset starts a fresh baseline", async () => {
  const pool = new WatchPool(),
    paused = Promise.withResolvers();
  const slow = [],
    fast = [];
  let value = 1;
  const subscribe = (notify) =>
    pool.subscribe(
      "view",
      () => async () => value,
      Infinity,
      new AbortController().signal,
      notify,
    );
  const releases = [
    subscribe(async (next, prev) => {
      slow.push([next.data, prev]);
      if (slow.length === 1) await paused.promise;
    }),
    subscribe(async (next, prev) => {
      fast.push([next.data, prev]);
    }),
  ];
  try {
    await flush();
    value = 2;
    pool.refresh();
    await flush();
    value = 3;
    pool.refresh();
    await flush();
    assert.deepEqual(fast, [
      [1, undefined],
      [2, 1],
      [3, 2],
    ]);
    assert.deepEqual(slow, [[1, undefined]]);
    paused.resolve();
    await flush();
    assert.deepEqual(slow, [
      [1, undefined],
      [3, 1],
    ]);
    pool.refresh(true);
    await flush();
    assert.deepEqual(slow.at(-1), [3, undefined]);
  } finally {
    pool.dispose();
    await Promise.all(releases);
  }
});

test("one failing push releases that watcher and the healthy watcher still refreshes", async () => {
  const pool = new WatchPool(),
    controller = new AbortController();
  let reads = 0;
  const read = async () => ++reads;
  const failed = pool.subscribe(
    "view",
    () => read,
    Infinity,
    controller.signal,
    () => {
      throw Error("transport closed");
    },
  );
  const healthy = client(pool, read, Infinity);
  await assert.rejects(failed, /transport closed/);
  pool.refresh();
  await flush();
  assert.equal(healthy.events.at(-1).data, 2);
  healthy.close();
});

test("a replacement connection starts with a fresh retry delay", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1 });
  let reads = 0;
  const pool = new WatchPool();
  const a = client(pool, async () => {
    reads++;
    throw Error("offline");
  });
  await flush();
  for (const ms of [5000, 10000, 20000, 40000]) {
    t.mock.timers.tick(ms);
    await flush();
  }
  const before = reads;
  pool.refresh(true);
  await flush();
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(reads, before + 2);
  a.close();
});
