import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupTurns, transcript } from "../shared/transcript.ts";

test("read the exact image reference from its Router event and preserve image-only replies", async (t) => {
  const previous = process.env.PASEO_HOME;
  const home = await mkdtemp(join(tmpdir(), "paseo-image-test-"));
  process.env.PASEO_HOME = home;
  t.after(async () => {
    if (previous === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });
  const { persist } = await import("../server/connection.ts");
  const { projectEvents, readImageAttachment, readTranscript } = await import(
    "../server/transcript.ts"
  );
  const url = "http://127.0.0.1:3083",
    sessionId = "test-router",
    instance = url + "#" + sessionId;
  await persist({ url, cookie: "dsh-auth-test=session" });
  const attachment = {
    attachmentId: "photo",
    name: "photo.png",
    mediaType: "image/png",
    bytes: 24,
    width: 12,
    height: 9,
    originalDimensions: { width: 24, height: 18 },
  };
  const image = { type: "image", attachment };
  const legacyFile = {
    type: "file",
    attachment: { name: "old.png", attachmentId: "file", bytes: 24 },
  };
  const rows = [
    [
      "user/message",
      { source: { kind: "user" }, content: [legacyFile, image] },
    ],
    ["tool/call", { name: "view_image", callId: "call-1" }],
    ["tool/result", { message: { toolCallId: "call-1", content: [image] } }],
    ["assistant/message", { message: { content: [image] } }],
  ].map(([type, data], i) => ({ event: { seq: i + 1, type, time: i, data } }));
  const [turn] = groupTurns(projectEvents(rows, []));
  assert.deepEqual(
    turn.inputs[0].files.map((f) => f.kind),
    ["file", "image"],
  );
  assert.equal(turn.results.get("call-1").files[0].id, "photo");
  assert.equal(turn.answer.files[0].width, 12);
  let reads = 0;
  const pressure = { contextWindow: 1000 };
  t.mock.method(globalThis, "fetch", async (path, init) => {
    if (new URL(path).pathname === "/orchestrator/api/state")
      return Response.json({
        masterId: sessionId,
        paused: false,
        setup: {},
        load: {},
      });
    const {
      method,
      rpcId,
      payload: {
        args: { request },
      },
    } = JSON.parse(init.body);
    let value;
    if (method === "session/projections") {
      value = {
        kind: "sequenced",
        asOfSeq: 4,
        values: { contextPressure: pressure },
      };
    } else if (method === "session/page") {
      assert.equal(request.address.sessionId, sessionId);
      value = {
        records: rows.filter((r) => r.event.seq === request.throughSeq),
      };
    } else {
      assert.equal(method, "session/attachment");
      assert.deepEqual(request, { sessionId, attachment });
      reads++;
      value = { attachment, data: "cG5n" };
    }
    return Response.json({ rpcId, result: { ok: true, value } });
  });
  // Upstream publishes the window size before it has a token count (e.g. after a failed turn).
  const firstPage = transcript.output.parse(await readTranscript({ instance }));
  assert.equal(firstPage.stats.pressure, undefined);
  pressure.pressureTokens = 0;
  assert.equal((await readTranscript({ instance })).stats.pressure, 0);
  pressure.pressureTokens = 530;
  assert.equal((await readTranscript({ instance })).stats.pressure, 53);
  for (const seq of [1, 3, 4]) {
    assert.deepEqual(
      await readImageAttachment({ instance, seq, id: "photo" }),
      { mime: "image/png", data: "cG5n" },
    );
  }
  await assert.rejects(
    readImageAttachment({ instance, seq: 1, id: "file" }),
    /没有该图片/,
  );
  await assert.rejects(
    readImageAttachment({ instance, seq: 2, id: "photo" }),
    /没有该图片/,
  );
  await assert.rejects(
    readImageAttachment({ instance, seq: 99, id: "photo" }),
    /记录已不可用/,
  );
  assert.equal(reads, 3);
});
