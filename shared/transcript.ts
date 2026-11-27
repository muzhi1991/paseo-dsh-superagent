import {
  actionCard,
  presentedFile,
  type PresentedFile,
  planDocument,
  type PlanDocument,
} from "./cards.ts";
import { imageMediaType } from "./image.ts";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
const attachment = z.object({
  kind: z.enum(["file", "image"]),
  id: z.string().optional(),
  name: z.string(),
  bytes: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});
const event = z.object({
  seq: z.number(),
  time: z.number(),
  turn: z.number(),
  kind: z.enum([
    "start",
    "end",
    "user",
    "assistant",
    "context",
    "trigger",
    "call",
    "result",
    "presented",
    "plan",
  ]),
  text: z.string().optional(),
  source: z.string().optional(),
  form: z.string().optional(),
  name: z.string().optional(),
  call: z.string().optional(),
  hasTool: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  error: z.boolean().optional(),
  tokens: z.number().optional(),
  files: z.array(attachment).optional(),
  presented: z.array(presentedFile).optional(),
  plan: planDocument.optional(),
});
export type TranscriptEvent = z.infer<typeof event>;
export type Attachment = z.infer<typeof attachment>;
export const transcript = defineRpc({
  name: "router.transcript",
  input: z.object({
    before: z.number().int().positive().optional(),
    instance: z.string().optional(),
  }),
  output: z.object({
    instance: z.string(),
    title: z.string(),
    provider: z.string().optional(),
    model: z.string(),
    effort: z.string(),
    events: z.array(event),
    actionCards: z.record(z.string(), actionCard).optional(),
    older: z.number().optional(),
    busy: z.boolean(),
    stats: z.object({
      turns: z.number(),
      steps: z.number(),
      tokens: z.number(),
      speed: z.number(),
      pressure: z.number().optional(),
    }),
  }),
});
export const eventDetail = defineRpc({
  name: "router.event-detail",
  input: z.object({
    instance: z.string(),
    seq: z.number().int().nonnegative(),
  }),
  output: z.string(),
});
export const imageAttachment = defineRpc({
  name: "router.image",
  input: z.object({
    instance: z.string(),
    id: z.string().min(1).max(256),
    seq: z.number().int().nonnegative(),
  }),
  output: z.object({
    mime: imageMediaType,
    data: z.string(),
  }),
});

export type Turn = {
  id: number;
  start?: TranscriptEvent;
  end?: TranscriptEvent;
  inputs: TranscriptEvent[];
  process: TranscriptEvent[];
  answer?: TranscriptEvent;
  tokens: number;
  results: Map<string, TranscriptEvent>;
  presented: Map<string, PresentedFile>;
  plans: Map<string, PlanDocument>;
};
/** DSH stores context injections in user/message records as well as ordinary prompts. */
export function groupTurns(events: TranscriptEvent[]): Turn[] {
  const groups = new Map<number, Turn>();
  for (const e of events) {
    let t = groups.get(e.turn);
    if (!t) {
      t = {
        id: e.turn,
        inputs: [],
        process: [],
        tokens: 0,
        results: new Map(),
        presented: new Map(),
        plans: new Map(),
      };
      groups.set(e.turn, t);
    }
    if (e.plan && !t.plans.has(e.plan.callId))
      t.plans.set(e.plan.callId, e.plan);
    switch (e.kind) {
      case "plan":
        break;
      case "start":
        t.start = e;
        break;
      case "end":
        t.end = e;
        break;
      case "trigger":
      case "user":
        if (t.process.some((p) => p.kind === "call" || p.kind === "assistant"))
          t.process.push(e);
        else t.inputs.push(e);
        break;
      case "presented":
        for (const file of e.presented ?? []) t.presented.set(file.path, file);
        break;
      case "result":
        if (e.call) t.results.set(e.call, e);
        break;
      default:
        t.process.push(e);
        if (e.kind === "assistant") t.tokens += e.tokens || 0;
    }
  }
  for (const t of groups.values()) {
    // Intermediate assistant text belongs to the process. Only a final response follows the separator.
    const last = t.process
      .filter((e) => e.kind === "assistant" || e.kind === "call")
      .at(-1);
    if (
      last?.kind === "assistant" &&
      !last.hasTool &&
      (last.text || last.files?.length)
    ) {
      t.answer = last;
      t.process = t.process.filter((e) => e !== last || e.reasoning);
    }
    t.process = t.process.filter(
      (e) =>
        e.kind !== "assistant" ||
        e.reasoning ||
        e.text?.trim() ||
        e.files?.length,
    );
  }
  return [...groups.values()];
}
