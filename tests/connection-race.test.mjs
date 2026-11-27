import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a slow credential verification cannot overwrite a connection saved in the meantime", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "paseo-save-"));
  const previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });
  const { config, check } = await import("../server/connection.ts");
  const started = Promise.withResolvers(),
    release = Promise.withResolvers();
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const u = new URL(input);
    if (u.searchParams.has("token"))
      return new Response(null, {
        status: 303,
        headers: {
          "set-cookie": "dsh-auth-test=" + u.searchParams.get("token"),
        },
      });
    if (u.pathname === "/") return new Response(null, { status: 401 });
    if (u.pathname === "/orchestrator/api/state") {
      assert.ok(init.headers.cookie);
      return Response.json({
        masterId: "router",
        paused: false,
        setup: {},
        load: {},
      });
    }
    assert.equal(u.pathname, "/api/session/projections");
    if (init.headers.cookie === "dsh-auth-test=slow") {
      started.resolve();
      await release.promise;
    }
    return Response.json({
      rpcId: JSON.parse(init.body).rpcId,
      result: { ok: true, value: { kind: "sequenced" } },
    });
  });
  const url = "http://127.0.0.1:3084";
  const slow = check({ url, token: "slow", save: true });
  await started.promise;
  try {
    assert.equal((await check({ url, token: "new", save: true })).saved, true);
  } finally {
    release.resolve();
  }
  const result = await slow;
  assert.equal(result.saved, false);
  assert.match(result.detail, /另一端已更新/);
  assert.equal((await config()).cookie, "dsh-auth-test=new");
});
