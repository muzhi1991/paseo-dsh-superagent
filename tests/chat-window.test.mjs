import { test } from "node:test";
import assert from "node:assert/strict";
import { transcriptUpdate } from "../server/updates.ts";
import { applyChat, prependChat } from "../shared/chat-window.ts";

const row = (seq) => ({
  seq,
  turn: 1,
  time: 1,
  kind: "assistant",
  text: "message " + seq,
});
const page = (...seqs) => ({
  instance: "fixture",
  title: "main",
  model: "m",
  effort: "",
  busy: false,
  stats: { turns: 1, steps: 1, tokens: 1, speed: 1 },
  events: seqs.map(row),
  older: seqs[0],
});

test("wire delta appends only new records and handles standalone metadata; a changed baseline requires a fresh snapshot", () => {
  const a = page(5, 7, 11),
    b = { ...page(7, 11, 19), model: "next" };
  const update = transcriptUpdate(b, a);
  assert.deepEqual(update, {
    type: "append",
    instance: "fixture",
    base: 11,
    changes: { model: "next" },
    events: [row(19)],
  });
  const first = applyChat(undefined, transcriptUpdate(a));
  const second = applyChat(first, update);
  assert.deepEqual(second.events, [5, 7, 11, 19].map(row));
  assert.equal(second.older, 5);
  assert.throws(() => applyChat(second, update));
  const meta = transcriptUpdate({ ...b, busy: true }, b);
  assert.deepEqual(meta.events, []);
  assert.deepEqual(meta.changes, { busy: true });
  const big = {
    ...a,
    events: a.events.map((r) => ({ ...r, text: "x".repeat(10000) })),
  };
  const next = { ...big, events: [...big.events, row(27)] };
  assert.ok(
    JSON.stringify(transcriptUpdate(next, big)).length <
      JSON.stringify(next).length / 50,
  );
});

test("late history cannot overwrite live state; snapshots remove rewritten records and reset history on gaps", () => {
  const a = page(5, 7, 11),
    initial = applyChat(undefined, transcriptUpdate(a));
  const b = { ...page(5, 7, 11, 19), model: "new" };
  let current = applyChat(initial, transcriptUpdate(b, a));
  current = prependChat(current, 5, initial.generation, page(1, 3));
  assert.equal(current.model, "new");
  assert.deepEqual(current.events, [1, 3, 5, 7, 11, 19].map(row));
  const rewrite = page(7, 19);
  assert.equal(transcriptUpdate(rewrite, b).type, "snapshot");
  const corrected = applyChat(current, transcriptUpdate(rewrite, b));
  assert.deepEqual(corrected.events, [1, 3, 5, 7, 19].map(row));
  const gap = applyChat(corrected, transcriptUpdate(page(41, 43), rewrite));
  assert.deepEqual(gap.events, [41, 43].map(row));
  assert.equal(gap.older, 41);
  assert.equal(prependChat(gap, 1, corrected.generation, page(1)), gap);
});

test("a row dropped by projection inside the same raw page is removed from the client", () => {
  const first = page(5, 7, 11);
  const corrected = { ...page(7, 11), older: 5 };
  const event = transcriptUpdate(corrected, first);
  assert.equal(event.type, "snapshot");
  const current = applyChat(
    applyChat(undefined, transcriptUpdate(first)),
    event,
  );
  assert.deepEqual(current.events, [7, 11].map(row));
});

test("reading older messages cannot change the append baseline of an empty projected tail", () => {
  const tail = { ...page(), older: 20 };
  const first = applyChat(undefined, transcriptUpdate(tail));
  const withHistory = prependChat(first, 20, first.generation, page(7, 9));
  const next = { ...page(24), older: 20 };
  const updated = applyChat(withHistory, transcriptUpdate(next, tail));
  assert.deepEqual(updated.events, [7, 9, 24].map(row));
});

test("a replay with the same history boundary accepts a page requested before reconnect; a real gap rejects it", () => {
  const a = page(5, 7, 11),
    current = applyChat(undefined, transcriptUpdate(a));
  const same = applyChat(current, transcriptUpdate({ ...a, model: "new" }));
  const filled = prependChat(same, 5, current.generation, page(1, 3));
  assert.deepEqual(filled.events, [1, 3, 5, 7, 11].map(row));
  assert.equal(filled.model, "new");
  const slide = applyChat(filled, transcriptUpdate(page(7, 11, 19)));
  assert.equal(slide.generation, filled.generation);
  const gap = applyChat(slide, transcriptUpdate(page(21, 25)));
  assert.notEqual(gap.generation, slide.generation);
  assert.equal(prependChat(gap, 1, slide.generation, page(0)), gap);
});
