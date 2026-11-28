import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as flush } from "node:timers/promises";
import { createSidebarPoller } from "../server/sidebar-counts.ts";

function client(poller) {
  const events = [];
  const controller = new AbortController();
  const done = poller.subscribe({
    signal: controller.signal,
    push: async (event) => {
      events.push(event);
    },
  });
  return { events, done, close: () => controller.abort() };
}

test("sidebar subscribers share one poll, replay the latest state and receive only changes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const counts = { running: 2, needsAttention: 1 };
  let fail = false,
    reads = 0;
  const poller = createSidebarPoller(async () => {
    reads++;
    if (fail) throw Error("offline");
    return { ...counts };
  });
  const a = client(poller),
    b = client(poller);
  await flush();
  assert.equal(reads, 1);
  assert.deepEqual(a.events, [counts]);
  assert.deepEqual(b.events, [counts]);
  const later = client(poller);
  assert.deepEqual(later.events, [counts]);
  later.close();
  const tick = async () => {
    t.mock.timers.tick(15_000);
    await flush();
  };
  await tick();
  assert.equal(reads, 2);
  assert.equal(a.events.length, 1);
  fail = true;
  await tick();
  await tick();
  assert.deepEqual(b.events, [counts, null]);
  a.close();
  fail = false;
  await tick();
  assert.deepEqual(b.events, [counts, null, counts]);
  assert.deepEqual(a.events, [counts, null]);
  b.close();
  const lastRead = reads;
  await tick();
  assert.equal(reads, lastRead);
  await Promise.all([a.done, b.done, later.done]);
});

test("switching connections and disconnecting cancel pending reads and ignore late snapshots", async () => {
  const pending = [];
  const poller = createSidebarPoller(
    (signal) => new Promise((resolve) => pending.push({ signal, resolve })),
  );
  const a = client(poller);
  poller.connectionChanged();
  assert.equal(pending[0].signal.aborted, true);
  const b = client(poller);
  assert.deepEqual(b.events, [null]);
  pending[0].resolve({ running: 42, needsAttention: 0 });
  pending[1].resolve({ running: 1, needsAttention: 2 });
  await flush();
  assert.deepEqual(a.events, [null, { running: 1, needsAttention: 2 }]);
  assert.deepEqual(a.events, b.events);
  a.close();
  b.close();
  const c = client(poller);
  assert.deepEqual(c.events, []);
  poller.dispose();
  assert.equal(pending[2].signal.aborted, true);
  pending[2].resolve({ running: 9, needsAttention: 0 });
  await flush();
  assert.deepEqual(c.events, []);
  await Promise.all([a.done, b.done, c.done]);
});
