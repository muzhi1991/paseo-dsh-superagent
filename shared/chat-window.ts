import type { SubscriptionEvent } from "@getpaseo/plugin";
import type { routerWatch, Transcript } from "./live.ts";

export type ChatWindow = Transcript & {
  generation: number;
  tailSeq: number | null;
};
type Update = Exclude<SubscriptionEvent<typeof routerWatch>, { type: "error" }>;

export function applyChat(
  previous: ChatWindow | undefined,
  update: Update,
): ChatWindow {
  if (update.type === "append") {
    if (
      !previous ||
      previous.instance !== update.instance ||
      previous.tailSeq !== update.base
    )
      throw Error("会话记录需要重新同步。");
    return {
      ...previous,
      ...update.changes,
      tailSeq: update.events.at(-1)?.seq ?? update.base,
      events: update.events.length
        ? [...previous.events, ...update.events]
        : previous.events,
    };
  }
  const next = update.data;
  const tailSeq = next.events.at(-1)?.seq ?? null;
  const generation = (previous?.generation ?? 0) + 1;
  if (previous?.instance === next.instance && next.older !== undefined) {
    const boundary = next.older;
    const prefix = previous.events.filter((row) => row.seq < boundary);
    const seqs = new Set(next.events.map((row) => row.seq));
    if (previous.events.some((row) => seqs.has(row.seq))) {
      const older = prefix.length ? previous.older : next.older;
      // A reconnect can replay the same tail while an older page is in flight.
      // Keep that read valid only when both its cursor and the overlap survive.
      return {
        ...next,
        generation: older === previous.older ? previous.generation : generation,
        tailSeq,
        older,
        events: [...prefix, ...next.events],
      };
    }
  }
  return { ...next, generation, tailSeq };
}

export function prependChat(
  current: ChatWindow | undefined,
  before: number,
  generation: number,
  page: Transcript,
) {
  if (
    !current ||
    current.generation !== generation ||
    current.instance !== page.instance ||
    current.older !== before
  )
    return current;
  return {
    ...current,
    older: page.older,
    events: [
      ...page.events.filter((row) => row.seq < before),
      ...current.events,
    ],
  };
}
