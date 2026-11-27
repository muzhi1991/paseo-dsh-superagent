import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  let writable = true,
    revision = 8;
  const machine = {
    promptMaxChars: 9000,
    admissionContextMaxPages: 10,
    admissionContextTimeoutMs: 2000,
  };
  const origin = "http://127.0.0.1:3083";
  const instance = origin + "#router";
  await persist({ url: origin, cookie: "dsh-auth-test=session" });
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const u = new URL(input),
      body = init.body && JSON.parse(init.body);
    if (u.pathname === "/orchestrator/api/state")
      return Response.json({
        masterId: "router",
        paused: false,
        setup: {
          machine: { stateDir: home },
          accounts: { repository: "example/repo" },
        },
        load: { running: 0, queued: 0, maxWorkers: 1 },
      });
    if (u.pathname === "/api/session/projections")
      return authorized
        ? Response.json({
            rpcId: body.rpcId,
            result: { ok: true, value: { kind: "sequenced" } },
          })
        : new Response(null, { status: 401 });
    if (u.pathname === "/api/settings/describe")
      return Response.json({
        rpcId: body.rpcId,
        result: {
          ok: true,
          value: {
            writable,
            namespaces: [
              { ns: "other", value: { unrelated: true } },
              { ns: "dsh-superagent", revision, value: machine },
            ],
          },
        },
      });
    calls.push({ u, init, body });
    if (u.pathname === "/orchestrator/api/sources")
      return Response.json([{ id: "github" }, { id: "forgejo" }]);
    if (u.pathname === "/orchestrator/api/tickets/42")
      return Response.json({
        title: "Fixture 42",
        stage: "working",
        assignments: [],
        threads: [],
      });
    if (u.pathname === "/api/settings/mutate") {
      const { ns, expectedRevision, ops } = body.payload.args;
      assert.equal(ns, "dsh-superagent");
      assert.equal(expectedRevision, revision);
      for (const op of ops) {
        if (op.op === "unset") delete machine[op.path[0]];
        else machine[op.path[0]] = op.value;
      }
      revision++;
      return Response.json({
        rpcId: body.rpcId,
        result: { ok: true, value: { writable, namespaces: [] } },
      });
    }
    if (init.method === "PUT" && body.revision !== 3)
      return new Response(null, { status: 409 });
    return Response.json({});
  });
  assert.deepEqual((await readSupervision({ instance, page: "来源" })).data, [
    { id: "github", repository: "example/repo" },
    { id: "forgejo" },
  ]);
  for (const [page, key, value] of [
    ["触发", "filter", "subscribed"],
    ["评估", "kind", "accept,reopen"],
    ["执行", "state", "open"],
  ]) {
    await readSupervision({ instance, page, offset: 20 });
    assert.equal(calls.at(-1).u.searchParams.get(key), value);
    assert.equal(calls.at(-1).u.searchParams.get("offset"), "20");
  }
  await readSupervision({
    instance,
    page: "线程",
    id: "git:team/project",
    before: "time|id",
  });
  assert.ok(calls.at(-1).u.pathname.endsWith("git%3Ateam%2Fproject"));
  assert.equal(calls.at(-1).u.searchParams.get("before"), "time|id");
  const command = {
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
  const readForm = async () =>
    (await readSupervision({ instance, page: "设置", filter: "deployment" }))
      .data.form;
  assert.deepEqual(await readForm(), {
    writable: true,
    revision: 8,
    value: { ...machine },
  });
  const deployment = {
    kind: "deployment",
    revision: 8,
    changes: { promptMaxChars: 10000 },
  };
  await change({ instance, command: deployment });
  assert.equal((await readForm()).value.promptMaxChars, 10000);
  await assert.rejects(change({ instance, command: deployment }), /新版本/);
  assert.equal(calls.at(-1).u.pathname, "/api/settings/mutate");
  await change({
    instance,
    command: { ...deployment, revision: 9, changes: { promptMaxChars: null } },
  });
  assert.deepEqual(calls.at(-1).body.payload.args.ops, [
    { op: "unset", path: ["promptMaxChars"] },
  ]);
  writable = false;
  await assert.rejects(
    change({ instance, command: { ...deployment, revision: 10 } }),
    /只读/,
  );
  const { mutate } = await import("../shared/supervision.ts");
  assert.equal(
    mutate.input.safeParse({
      instance,
      command: { ...deployment, changes: { stateDir: "other" } },
    }).success,
    false,
  );
  assert.equal(
    mutate.input.safeParse({
      instance,
      command: { ...deployment, changes: { admissionContextMaxPages: 0 } },
    }).success,
    false,
  );
  const { readPanel } = await import("../server/panel.ts");
  await mkdir(join(home, "paseo-bindings"));
  for (const file of ["{", JSON.stringify({ agentId: "agent-42" })]) {
    await writeFile(join(home, "paseo-bindings", "42.json"), file);
    const expected = file === "{" ? undefined : "agent-42";
    const route = { instance, page: "工单", id: "42" };
    const detail = await readSupervision(route);
    assert.equal(detail.data.title, "Fixture 42");
    assert.equal(detail.agent, expected);
    assert.equal((await readPanel(route)).agent, expected);
  }
  const count = calls.length;
  await assert.rejects(
    change({ instance: origin + "#old", command }),
    /实例已切换/,
  );
  const other = "http://127.0.0.1:6301";
  await persist({ url: other, cookie: "dsh-auth-test=session-b" });
  for (const route of [
    { page: "工单", id: "42" },
    { page: "执行", offset: 20 },
  ]) {
    await assert.rejects(readSupervision({ ...route, instance }), /实例已切换/);
  }
  await assert.rejects(change({ instance, command }), /实例已切换/);
  assert.equal(calls.length, count);
  await persist({ url: origin, cookie: "dsh-auth-test=session" });
  authorized = false;
  await assert.rejects(change({ instance, command }), /HTTP 401/);
  assert.equal(calls.length, count);
});
