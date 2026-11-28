import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as flush } from "node:timers/promises";
import { listenWhileVisible } from "../client/subscription.ts";

test("broken deltas back off, late events cannot clear the error, background cancels recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let visible = true,
    visibility;
  const attempts = [],
    events = [],
    failures = [];
  const release = listenWhileVisible(
    (event, close) => {
      const ready = Promise.withResolvers();
      const attempt = { event, close, ready, released: 0 };
      attempts.push(attempt);
      return Object.assign(() => attempt.released++, { ready: ready.promise });
    },
    (event) => {
      if (event === "gap") throw Error("gap");
      events.push(event);
    },
    (err) => failures.push(err.message),
    () => visible,
    (fn) => {
      visibility = fn;
      return () => {};
    },
  );
  attempts[0].event("gap");
  attempts[0].event("late");
  attempts[0].ready.reject(Error("obsolete"));
  await flush();
  assert.deepEqual(events, []);
  assert.deepEqual(failures, ["gap"]);
  assert.equal(attempts[0].released, 1);
  t.mock.timers.tick(1000);
  attempts[1].event("gap");
  t.mock.timers.tick(1000);
  assert.equal(attempts.length, 2);
  visible = false;
  visibility();
  t.mock.timers.tick(60000);
  assert.equal(attempts.length, 2);
  visible = true;
  visibility();
  attempts[2].event("new snapshot");
  assert.deepEqual(events, ["new snapshot"]);
  attempts[2].close(Error("offline"));
  t.mock.timers.tick(1000);
  assert.equal(attempts.length, 4);
  release();
  attempts[3].event("after cleanup");
  assert.deepEqual(events, ["new snapshot"]);
});

test("synchronous subscribe failure and foreground callbacks cannot start competing retries", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let visible = true,
    visibility,
    attempts = 0,
    releases = 0;
  const stop = listenWhileVisible(
    (_receive, close) => {
      attempts++;
      if (attempts === 1) throw Error("connect failed");
      if (attempts === 2) close(Error("closed before ready"));
      return Object.assign(() => releases++, { ready: Promise.resolve() });
    },
    () => {},
    () => {},
    () => visible,
    (fn) => {
      visibility = fn;
      return () => {};
    },
  );
  visibility();
  assert.equal(attempts, 1);
  t.mock.timers.tick(1000);
  assert.equal(attempts, 2);
  assert.equal(releases, 1);
  visible = false;
  visibility();
  visible = true;
  visibility();
  assert.equal(attempts, 3);
  t.mock.timers.tick(10000);
  assert.equal(releases, 1);
  assert.equal(attempts, 3);
  stop();
  assert.equal(releases, 2);
});
