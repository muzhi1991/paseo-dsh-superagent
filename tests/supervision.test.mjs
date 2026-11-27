import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("match the Web filters, retain cursors, and verify the same Router before management writes", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "paseo-supervision-"));
  const previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });
  const { persist } = await import("../server/connection.ts");
  const { readSupervision, change } = await import("../server/supervision.ts");
  const calls = [];
  let authorized = true;
  const origin = "http://127.0.0.1:3083";
  await persist({ url: origin, cookie: "dsh-auth-test=session" });
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const u = new URL(input),
      body = init.body && JSON.parse(init.body);
    if (u.pathname === "/orchestrator/api/state")
      return Response.json({
        masterId: "router",
        paused: false,
        setup: {},
        load: { running: 0, queued: 0, maxWorkers: 1 },
      });
    if (u.pathname === "/api/session/projections")
      return authorized
        ? Response.json({
            rpcId: body.rpcId,
            result: { ok: true, value: { kind: "sequenced" } },
          })
        : new Response(null, { status: 401 });
    calls.push({ u, init, body });
    if (init.method === "PUT" && body.revision !== 3)
      return new Response(null, { status: 409 });
    return Response.json({});
  });
  for (const [page, key, value] of [
    ["触发", "filter", "subscribed"],
    ["评估", "kind", "accept,reopen"],
    ["执行", "state", "open"],
  ]) {
    await readSupervision({ page, offset: 20 });
    assert.equal(calls.at(-1).u.searchParams.get(key), value);
    assert.equal(calls.at(-1).u.searchParams.get("offset"), "20");
  }
  await readSupervision({
    page: "线程",
    id: "git:team/project",
    before: "time|id",
  });
  assert.ok(calls.at(-1).u.pathname.endsWith("git%3Ateam%2Fproject"));
  assert.equal(calls.at(-1).u.searchParams.get("before"), "time|id");
  const instance = origin + "#router",
    command = {
      kind: "settings",
      block: "executor",
      value: { maxWorkers: 1 },
      revision: 3,
    };
  await change({ instance, command });
  assert.equal(calls.at(-1).init.method, "PUT");
  assert.deepEqual(calls.at(-1).body, {
    revision: 3,
    value: { maxWorkers: 1 },
  });
  await assert.rejects(
    change({ instance, command: { ...command, revision: 1 } }),
    /已有新版本/,
  );
  const count = calls.length;
  await assert.rejects(
    change({ instance: origin + "#old", command }),
    /实例已切换/,
  );
  authorized = false;
  await assert.rejects(change({ instance, command }), /HTTP 401/);
  assert.equal(calls.length, count);
});
