import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setImmediate as flush } from "node:timers/promises";

test("actual subscription handlers share overview, tail pages and idle reads across clients", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "dsh-watch-"));
  const old = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  t.after(async () => {
    if (old === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = old;
    await rm(home, { recursive: true, force: true });
  });
  const { persist } = await import("../server/connection.ts");
  const { registerUpdates } = await import("../server/updates.ts");
  const url = "http://127.0.0.1:3083";
  await persist({ url, cookie: "fixture=watch" });
  const calls = new Map(),
    handlers = new Map();
  let model = "m",
    seq = 1,
    running = 0,
    masterId = "router";
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = new URL(input).pathname;
    calls.set(path, (calls.get(path) ?? 0) + 1);
    const load = { running, queued: 0, maxWorkers: 3 };
    if (path.endsWith("/state"))
      return Response.json({ masterId, paused: false, setup: {}, load });
    if (path.endsWith("/overview"))
      return Response.json({ executor: load, person: [] });
    const body = JSON.parse(init.body);
    const value = path.endsWith("/projections")
      ? {
          kind: "sequenced",
          asOfSeq: seq,
          values: { modelSelection: { next: { model } } },
        }
      : {
          records: Array.from({ length: seq }, (_, i) => ({
            event: {
              seq: i + 1,
              time: 1,
              type: "turn/start",
              data: { turn: i + 1 },
            },
          })),
          hasMore: false,
        };
    return Response.json({ rpcId: body.rpcId, result: { ok: true, value } });
  });
  const updates = registerUpdates({
    handle(contract, fn) {
      handlers.set(contract.name, { contract, fn });
    },
  });
  t.after(updates.dispose);
  function listen(name, input) {
    const { contract, fn } = handlers.get(name),
      events = [],
      ctrl = new AbortController();
    fn(input, {
      signal: ctrl.signal,
      push: async (e) => {
        events.push(contract.event.parse(e));
      },
    });
    return { events, close: () => ctrl.abort() };
  }
  async function until(check) {
    for (let i = 0; i < 5000; i++) {
      if (check()) return;
      await flush();
    }
    assert.fail("timed out waiting for subscription event");
  }
  const who = listen("connection.watch-target", {});
  await until(() => who.events.length);
  const instance = who.events[0].data,
    sidebar = listen("superagent.sidebar-counts", {});
  const overview = listen("supervision.watch", { page: "概览", instance });
  await until(() => overview.events.length && sidebar.events.length);
  assert.equal(calls.get("/orchestrator/api/overview"), 1);
  assert.equal(calls.get("/api/session/projections"), undefined);
  const a = listen("router.watch", { instance }),
    b = listen("router.watch", { instance });
  await until(() => a.events.length && b.events.length);
  assert.equal(calls.get("/api/session/page"), 1);
  assert.equal(calls.get("/api/session/projections"), 1);
  handlers.get("superagent.refresh").fn({ domain: "router" });
  await until(() => calls.get("/api/session/projections") === 2);
  await flush();
  assert.equal(a.events.length, 1);
  assert.equal(calls.get("/api/session/page"), 1);
  await assert.rejects(
    updates.write("router", async () => {
      model = "new";
      throw Error("ack lost");
    }),
    /ack lost/,
  );
  await until(() => a.events.length === 2);
  assert.deepEqual(b.events[1], {
    type: "append",
    instance,
    base: 1,
    events: [],
    changes: { model },
  });
  seq++;
  handlers.get("superagent.refresh").fn({ domain: "router" });
  await until(() => a.events.length === 3);
  assert.equal(a.events[2].events.length, 1);
  assert.equal(calls.get("/api/session/page"), 2);
  a.close();
  b.close();
  const reads = calls.get("/api/session/projections");
  handlers.get("superagent.refresh").fn({ domain: "router" });
  await flush();
  assert.equal(calls.get("/api/session/projections"), reads);
  running = 1;
  handlers.get("superagent.refresh").fn({ domain: "panel" });
  await until(
    () => sidebar.events.length === 2 && overview.events.length === 2,
  );
  assert.equal(calls.get("/orchestrator/api/overview"), 2);
  masterId = "other";
  handlers.get("superagent.refresh").fn({ domain: "panel" });
  await until(
    () => who.events.length === 2 && overview.events.at(-1).type === "error",
  );
  assert.equal(who.events.at(-1).data, url + "#other");
  assert(
    overview.events.every(
      (e) => e.type === "error" || e.data.instance === instance,
    ),
  );
  updates.changed();
  assert.equal(sidebar.events.at(-1), null);
  await until(() => sidebar.events.at(-1)?.running === 1);
  sidebar.close();
  overview.close();
  masterId = "replacement";
  // A historical thread has no live panel poll. Even its one-off read should
  // recover the shared identity when DSH replaces the Router under the same URL.
  const { readSupervision } = await import("../server/supervision.ts");
  await assert.rejects(
    readSupervision({
      instance: url + "#other",
      page: "线程",
      id: "old",
      before: "1",
    }),
    /实例已切换/,
  );
  await until(() => who.events.at(-1).data === url + "#replacement");
  who.close();
  const prev = new Map(calls);
  updates.changed();
  await flush();
  assert.deepEqual(calls, prev);
});
