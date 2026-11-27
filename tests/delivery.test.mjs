import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("retry a definite refusal, retain uncertain receipts, and send a concurrent duplicate only once", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "paseo-delivery-"));
  const previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });
  const { persist } = await import("../server/connection.ts");
  const { dispatch } = await import("../server/dispatch.ts");
  const url = "http://127.0.0.1:3083";
  await persist({ url, cookie: "dsh-auth-test=test" });
  const send = (id) =>
    dispatch({
      instance: url + "#router",
      requestId: id,
      text: "test",
      receipts: [],
    });
  let outcome,
    attempts = 0,
    accepted = 0;
  const started = Promise.withResolvers(),
    resume = Promise.withResolvers();
  t.mock.method(globalThis, "fetch", async (input, init) => {
    if (new URL(input).pathname === "/orchestrator/api/state")
      return Response.json({
        masterId: "router",
        paused: false,
        setup: {},
        load: {},
      });
    assert.equal(new URL(input).pathname, "/api/session/prompt");
    attempts++;
    if (outcome === "unauthenticated")
      return new Response(null, { status: 401 });
    if (outcome === "limited") return new Response(null, { status: 429 });
    if (outcome === "unknown") throw Error("connection lost");
    if (outcome === "wait") {
      started.resolve();
      await resume.promise;
    }
    if (outcome !== "refused") accepted++;
    return Response.json({
      rpcId: JSON.parse(init.body).rpcId,
      result: { ok: true, value: { accepted: outcome !== "refused" } },
    });
  });
  for (const [id, error] of [
    ["unauthenticated", /HTTP 401/],
    ["refused", /拒绝/],
    ["limited", /HTTP 429/],
  ]) {
    outcome = id;
    const before = attempts,
      previouslyAccepted = accepted;
    await assert.rejects(send(id), error);
    outcome = "accepted";
    assert.equal(await send(id), true);
    assert.equal(await send(id), true);
    assert.equal(attempts, before + 2);
    assert.equal(accepted, previouslyAccepted + 1);
  }
  outcome = "unknown";
  await assert.rejects(send("ambiguous"), /connection lost/);
  const before = attempts;
  await assert.rejects(send("ambiguous"), /尚未确认/);
  assert.equal(attempts, before);

  outcome = "wait";
  const pending = send("concurrent");
  await started.promise;
  try {
    await assert.rejects(send("concurrent"), /尚未确认/);
  } finally {
    resume.resolve();
    await pending;
  }
  assert.equal(await send("concurrent"), true);
  assert.equal(attempts, before + 1);
});
