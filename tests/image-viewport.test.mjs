import { test } from "node:test";
import assert from "node:assert/strict";
import { ImageViewport, loadImage } from "../client/image-viewport.ts";

test("image slots follow the reading position after a prepend and ignore stale measurements", (t) => {
  const original = globalThis.requestAnimationFrame;
  const frames = [];
  globalThis.requestAnimationFrame = (cb) => frames.push(cb);
  t.after(() => {
    if (original === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = original;
  });
  const viewport = new ImageViewport();
  viewport.setRoot({});
  const measurements = [],
    visibility = [];
  const remove = viewport.watch(
    {
      measureLayout(_root, callback) {
        measurements.push(callback);
      },
    },
    (near) => visibility.push(near),
  );
  viewport.scroll(1000, 450);
  frames.shift()();
  viewport.layoutChanged();
  measurements.shift()(0, 1200, 230, 115);
  assert.deepEqual(visibility, []);
  frames.shift()();
  measurements.shift()(0, 1580, 230, 115);
  assert.deepEqual(visibility, [true]);
  viewport.scroll(0, 450);
  assert.deepEqual(visibility, [true, false]);
  assert.equal(frames.length, 0);
  viewport.layoutChanged();
  viewport.scroll(3800, 450);
  frames.shift()();
  measurements.shift()(0, 4000, 230, 115);
  assert.deepEqual(visibility, [true, false, true]);
  remove();
  viewport.scroll(0, 450);
  assert.deepEqual(visibility, [true, false, true]);
});

test("only three image RPCs run, stale waiters are skipped and a failure frees its slot", async () => {
  const started = [],
    releases = [],
    controllers = [];
  const jobs = Array.from({ length: 6 }, (_, i) => {
    const control = new AbortController();
    controllers.push(control);
    return loadImage(control.signal, async () => {
      started.push(i);
      return new Promise((resolve, reject) => {
        releases[i] = { resolve, reject };
      });
    });
  });
  const all = Promise.allSettled(jobs);
  const tick = () => new Promise((ok) => setImmediate(ok));
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  controllers[3].abort();
  controllers[0].abort();
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  releases[1].reject(new Error("failed"));
  await tick();
  assert.deepEqual(started, [0, 1, 2, 4]);
  releases[0].resolve();
  await tick();
  assert.deepEqual(started, [0, 1, 2, 4, 5]);
  for (const i of [2, 4, 5]) releases[i].resolve();
  assert.deepEqual(
    (await all).map((x) => x.status),
    [
      "fulfilled",
      "rejected",
      "fulfilled",
      "rejected",
      "fulfilled",
      "fulfilled",
    ],
  );
});
