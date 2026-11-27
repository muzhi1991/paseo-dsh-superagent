import { test } from "node:test";
import assert from "node:assert/strict";
import { actionCardsByTurn } from "../shared/cards.ts";
import { groupTurns } from "../shared/transcript.ts";
import { projectEvents } from "../server/transcript.ts";

test("turn artifacts survive page boundaries, repeated declarations and nested plan calls", () => {
  const file = (path, description) => ({ path, description });
  const data = (turn, files) => ({ turn, callId: "present", files });
  const plan = {
    name: "exit_plan_mode",
    subCallId: "nested",
    turn: 7,
    arguments: { plan: "# Nested plan\n\n- Inspect files" },
  };
  const rows = [
    ["turn/start", { turn: 7 }],
    ["tool/ptc-dispatch-start", plan],
    ["tool/ptc-dispatch", plan],
    [
      "tool/call",
      {
        name: "exit_plan_mode",
        callId: "native",
        arguments: JSON.stringify({ plan: "# Native plan\n\nBody" }),
      },
    ],
    ["tool/call", { name: "exit_plan_mode", callId: "broken", arguments: "{" }],
    [
      "assistant/message",
      { message: { content: [{ type: "text", text: "Ready" }] } },
    ],
    [
      "deliverables/presented",
      data(7, [file("public/report.html", "first"), file("notes.txt")]),
    ],
    ["turn/end", { turn: 7, reason: { kind: "completed" } }],
    [
      "deliverables/presented",
      data(7, [file("public/report.html", "updated"), { path: 32 }]),
    ],
    [
      "deliverables/presented",
      data(8, [file("public/report.html", "next turn")]),
    ],
  ].map(([type, data], i) => ({
    event: { type, data, time: 1000 + i, seq: i + 1 },
  }));
  const [a, b] = groupTurns([
    ...projectEvents(rows.slice(0, 6), []),
    ...projectEvents(rows.slice(6), [{ seq: 1, turn: 7 }]),
  ]);
  assert.equal(a.answer.text, "Ready");
  assert.deepEqual([...a.plans.keys()], ["nested", "native"]);
  assert.equal(a.plans.get("nested").markdown, plan.arguments.plan);
  assert.deepEqual(
    [...a.presented.keys()],
    ["public/report.html", "notes.txt"],
  );
  assert.equal(a.presented.get("public/report.html").description, "updated");
  assert.equal(b.presented.get("public/report.html").description, "next turn");
});

test("action cards use DSH's admitted proposals and current decisions", () => {
  const card = {
    title: "Offer",
    brief: "Brief",
    turn: 3,
    action: "example",
    details: { internal: "omit" },
  };
  const view = {
    proposals: {
      later: { ...card, callId: "z" },
      chosen: { ...card, callId: "a" },
      invalid: { turn: 10 },
    },
    decisions: { a: { phase: "replaced" } },
  };
  assert.deepEqual(actionCardsByTurn(view), {
    3: { title: "Offer", brief: "Brief", callId: "a", phase: "replaced" },
  });
  view.decisions = { a: { phase: "dismissed" } };
  assert.equal(actionCardsByTurn(view)[3].phase, "dismissed");
  assert.deepEqual(actionCardsByTurn(), {});
});
