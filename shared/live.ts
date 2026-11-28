import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { activeInstance, connection } from "./api.ts";
import { view } from "./supervision.ts";
import { transcript } from "./transcript.ts";

export const fault = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export function snapshot<T extends z.ZodType>(schema: T) {
  return z.union([
    z.object({ type: z.literal("snapshot"), data: schema }),
    fault,
  ]);
}
export const instanceWatch = defineSubscription({
  name: "connection.watch-target",
  input: activeInstance.input,
  event: snapshot(activeInstance.output),
});
export const connectionWatch = defineSubscription({
  name: "connection.watch",
  input: connection.input,
  event: snapshot(connection.output),
});
export const panelWatch = defineSubscription({
  name: "supervision.watch",
  input: view.input.omit({ offset: true, before: true, around: true }),
  event: snapshot(view.output),
});
export type Transcript = z.infer<typeof transcript.output>;
const metadata = transcript.output.omit({
  events: true,
  older: true,
  instance: true,
});
export const routerWatch = defineSubscription({
  name: "router.watch",
  input: z.object({ instance: z.string() }),
  event: z.discriminatedUnion("type", [
    fault,
    z.object({ type: z.literal("snapshot"), data: transcript.output }),
    z.object({
      type: z.literal("append"),
      instance: z.string(),
      base: z.number().nullable(),
      events: transcript.output.shape.events,
      changes: metadata.partial(),
    }),
  ]),
});
export const refresh = defineRpc({
  name: "superagent.refresh",
  input: z.object({
    domain: z.enum(["instance", "panel", "router", "connection"]),
  }),
  output: z.boolean(),
});
