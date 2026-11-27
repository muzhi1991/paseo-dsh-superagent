import { test } from "node:test";
import assert from "node:assert/strict";
import { enterDelivery, readSendPreferences } from "../client/send-keys.ts";

test("honor the current Paseo send shortcut and switch delivery only for alternate Enter", () => {
  const enter = { key: "Enter" };
  for (const behavior of ["steer", "queue"]) {
    const alternate = behavior === "steer" ? "queue" : "steer";
    const plain = { shortcut: "enter", behavior };
    const modified = { shortcut: "mod-enter", behavior };
    assert.equal(enterDelivery(enter, plain, false), "queue");
    assert.equal(enterDelivery(enter, plain, true), behavior);
    assert.equal(enterDelivery(enter, modified, true), undefined);
    for (const key of ["ctrlKey", "metaKey"]) {
      const chord = { ...enter, [key]: true };
      assert.equal(enterDelivery(chord, plain, true), alternate);
      assert.equal(enterDelivery(chord, modified, true), behavior);
      assert.equal(enterDelivery(chord, modified, false), "queue");
      for (const edit of [
        { shiftKey: true },
        { isComposing: true },
        { keyCode: 229 },
      ]) {
        assert.equal(
          enterDelivery({ ...chord, ...edit }, modified, true),
          undefined,
        );
        assert.equal(
          enterDelivery({ ...enter, ...edit }, plain, true),
          undefined,
        );
      }
    }
  }
});

test("read current settings at keypress, including legacy storage and unreadable preferences", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map([
    ["@paseo:settings", '{"sendShortcut":"mod-enter","sendBehavior":"queue"}'],
  ]);
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key) => data.get(key) ?? null },
    });
    assert.deepEqual(readSendPreferences(), {
      shortcut: "mod-enter",
      behavior: "queue",
    });
    data.set(
      "@paseo:app-settings",
      '{"sendShortcut":"enter","sendBehavior":"interrupt"}',
    );
    assert.deepEqual(readSendPreferences(), {
      shortcut: "enter",
      behavior: "steer",
    });
    data.set("@paseo:app-settings", "{");
    assert.deepEqual(readSendPreferences(), {
      shortcut: "enter",
      behavior: "steer",
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw Error("unavailable");
      },
    });
    assert.deepEqual(readSendPreferences(), {
      shortcut: "enter",
      behavior: "steer",
    });
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
