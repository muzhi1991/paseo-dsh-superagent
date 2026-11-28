// Offset-based DSH pages can shift between two requests. Fetch one overlapping
// row so deletions as well as insertions are detectable at the join.
type Row = { key?: string | number; id?: string | number };
export function joinedRows<T extends Row>(
  previous: Row[],
  incoming: T[],
): T[] | undefined {
  const key = (row: Row | undefined) => row?.key ?? row?.id;
  const anchor = key(previous.at(-1));
  if (anchor === undefined || key(incoming[0]) !== anchor) return;
  const seen = new Set(previous.map(key));
  const rest = incoming.slice(1);
  for (const row of rest) {
    const id = key(row);
    if (id === undefined || seen.has(id)) return;
    seen.add(id);
  }
  return rest;
}
