import assert from "node:assert/strict";
import { test } from "node:test";
import { joinedRows } from "../shared/list-page.ts";

test("offset paging returns each row once and detects a disappearing anchor or repeated row", () => {
  const rows = (...ids) => ids.map((id) => ({ id }));
  assert.deepEqual(joinedRows(rows(1, 2, 3), rows(3, 4, 5)), rows(4, 5));
  assert.deepEqual(joinedRows(rows(1, 2, 3), rows(3)), []);
  assert.equal(joinedRows(rows(1, 2, 3), rows(4, 5)), undefined);
  assert.equal(joinedRows(rows(1, 2, 3), rows(2, 3, 4)), undefined);
  assert.equal(joinedRows(rows(1, 2, 3), rows(3, 4, 4)), undefined);
});
