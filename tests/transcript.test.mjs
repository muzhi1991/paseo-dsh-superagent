import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTurns, transcript } from "../shared/transcript.ts";
import { projectEvents } from "../server/transcript.ts";

function history() {
  const rows = [];
  return {
    rows,
    add(type, data, surfaceOp) {
      const seq = rows.length + 1;
      rows.push({ event: { seq, time: 1000 * seq, type, data, surfaceOp } });
      return seq;
    },
  };
}
const item = (id, kind) => ({ id, source: { kind } });
const message = (id, kind, text) => ({
  ...item(id, kind),
  content: [{ type: "text", text }],
});
test("an idle notification wakes the turn, later relay messages belong to execution", () => {
  const { rows, add } = history();
  add("agent/inbox/spliced", {
    target: "next-step",
    start: 0,
    inserted: [item("wake", "custom-relay")],
  });
  add("turn/start", { turn: 6 });
  add("agent/inbox/spliced", {
    target: "next-step",
    start: 0,
    removedCount: 1,
    inserted: [],
  });
  add("step/start", { turn: 6, step: 1 });
  add("user/message", message("wake", "custom-relay", "opening notice"));
  add("user/message", message("clock", "time-context", "clock details"));
  add("assistant/message", {
    message: {
      content: [{ type: "reasoning", text: "analysis" }, { type: "tool-call" }],
    },
    usage: { totalTokens: 21 },
  });
  add("tool/call", { callId: "tool-1", name: "read" });
  add("tool/result", {
    message: {
      toolCallId: "tool-1",
      content: [{ type: "text", text: "result" }],
    },
  });
  add("step/start", { turn: 6, step: 2 });
  add(
    "user/message",
    message("later", "custom-relay", "mid-turn notification"),
  );
  add("assistant/message", {
    message: {
      content: [
        { type: "reasoning", text: "more analysis" },
        { type: "text", text: "**answer**" },
      ],
    },
    usage: { totalTokens: 14 },
  });
  add("turn/end", { turn: 6, reason: { kind: "completed" } });
  const events = projectEvents(rows, []);
  const [turn] = groupTurns(events);
  assert.equal(turn.id, 6);
  assert.equal(turn.end.name, "completed");
  assert.deepEqual(
    turn.inputs.map((e) => [e.kind, e.source]),
    [["trigger", "custom-relay"]],
  );
  assert.equal(turn.inputs[0].text, undefined);
  assert.deepEqual(
    turn.process.map((e) => e.kind),
    ["context", "assistant", "call", "context", "assistant"],
  );
  assert.equal(turn.results.get("tool-1").kind, "result");
  assert.equal(turn.answer.text, "**answer**");
  assert.equal(turn.tokens, 35);
  assert.doesNotThrow(() =>
    transcript.output.parse({
      instance: "test",
      title: "Router",
      model: "model",
      effort: "",
      events,
      busy: false,
      stats: { turns: 1, steps: 2, tokens: 35, speed: 0 },
    }),
  );
});
test("human input owns a mixed opening claim and preserves attachments, markdown and long replies", () => {
  const { rows, add } = history(),
    long = "**hello**\n\n" + "word ".repeat(4000);
  const file = {
    type: "file",
    attachment: { attachmentId: "id", name: "sample.txt", bytes: 12 },
  };
  add("turn/start", { turn: 8 });
  add("agent/inbox/spliced", {
    target: "next-step",
    start: 0,
    inserted: [item("note", "dsh-superagent"), item("human", "user")],
  });
  add("agent/inbox/spliced", {
    target: "next-step",
    start: 0,
    removedCount: 2,
    inserted: [],
  });
  add("step/start", { step: 1, turn: 8 });
  add("user/message", message("note", "dsh-superagent", "environment"));
  add("user/message", {
    ...item("human", "user"),
    content: [file, { type: "text", text: "question" }],
  });
  add(
    "user/message",
    message("summary", "compact-checkpoint", "internal replacement"),
    "replace",
  );
  add("assistant/message", {
    message: { content: [{ type: "text", text: long }] },
  });
  const [t] = groupTurns(projectEvents(rows, []));
  assert.deepEqual(
    t.inputs.map((e) => e.kind),
    ["user"],
  );
  assert.equal(t.inputs[0].files[0].name, "sample.txt");
  assert.deepEqual(
    t.process.map((e) => e.source),
    ["dsh-superagent"],
  );
  assert.equal(t.answer.text, long);
});
test("a next-turn claim is attributed by message id and a tool step is never a final answer", () => {
  const { rows, add } = history();
  add("agent/inbox/spliced", {
    target: "next-turn",
    start: 0,
    inserted: [item("job", "schedule")],
  });
  add("turn/start", { turn: 10 });
  add("agent/inbox/spliced", {
    target: "next-turn",
    start: 0,
    removedCount: 1,
    inserted: [],
  });
  add("step/start", { step: 1, turn: 10 });
  add("user/message", message("other", "schedule", "context"));
  add("user/message", message("job", "schedule", "trigger"));
  add("assistant/message", {
    message: {
      content: [{ type: "text", text: "working" }, { type: "tool-call" }],
    },
  });
  add("tool/call", { name: "tool", callId: "call" });
  add("turn/end", {
    turn: 10,
    reason: { kind: "error", error: { message: "failed" } },
  });
  const [t] = groupTurns(projectEvents(rows, []));
  assert.equal(t.inputs.length, 1);
  assert.equal(t.inputs[0].kind, "trigger");
  assert.equal(t.answer, undefined);
  assert.equal(t.end.text, "failed");
  // A history page can begin inside a turn with no start record.
  const [partial] = groupTurns(
    projectEvents(rows.slice(-2), [{ seq: 2, turn: 10 }]),
  );
  assert.equal(partial.id, 10);
  assert.equal(partial.start, undefined);
});

test("user transcript retains the DSH request id even when prompts have identical text", () => {
  const { rows, add } = history();
  for (const rpcId of ["first", "second", undefined]) {
    add("user/message", {
      source: { kind: "user", rpcId },
      content: [{ type: "text", text: "继续" }],
    });
  }
  assert.deepEqual(
    projectEvents(rows, []).map((e) => e.requestId),
    ["first", "second", undefined],
  );
});
