import { imageMediaType } from "./image";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const connection = defineRpc({
  name: "connection.read",
  input: z.object({}),
  output: z.object({ url: z.string(), authenticated: z.boolean() }),
});
const verification = z.object({
  reachable: z.boolean(),
  superagent: z.boolean(),
  router: z.boolean(),
  saved: z.boolean(),
  detail: z.string(),
});
export const verify = defineRpc({
  name: "connection.verify",
  input: z.object({
    url: z.string().max(4096),
    token: z.string().max(4096),
    save: z.boolean(),
  }),
  output: verification,
});
const row = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  ticket: z.boolean().optional(),
});
export const panel = defineRpc({
  name: "panel.read",
  input: z.object({
    page: z.enum(["概览", "来源", "触发", "评估", "执行", "设置", "工单"]),
    id: z.string().optional(),
    ended: z.boolean().optional(),
  }),
  output: z.object({
    instance: z.string(),
    rows: z.array(row),
    agent: z.string().optional(),
  }),
});
const entry = z.object({
  seq: z.number(),
  role: z.enum(["user", "assistant", "status"]),
  text: z.string(),
});
export const history = defineRpc({
  name: "router.history",
  input: z.object({ before: z.number().int().positive().optional() }),
  output: z.object({
    instance: z.string(),
    entries: z.array(entry),
    older: z.number().optional(),
    busy: z.boolean(),
    model: z.string(),
  }),
});
const target = z.object({ instance: z.string() });
export const send = defineRpc({
  name: "router.send",
  input: target.extend({
    text: z.string().max(100000),
    requestId: z.string().uuid(),
    receipts: z.array(z.string()).max(12),
  }),
  output: z.boolean(),
});
export const cancel = defineRpc({
  name: "router.cancel",
  input: target,
  output: z.boolean(),
});
export const models = defineRpc({
  name: "router.models",
  input: target,
  output: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      label: z.string(),
      efforts: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});
export const selectModel = defineRpc({
  name: "router.select-model",
  input: target.extend({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.string().optional(),
  }),
  output: z.boolean(),
});
export const upload = defineRpc({
  name: "router.attachment",
  input: target.extend({
    name: z.string().min(1).max(255),
    data: z.string().max(2_800_000),
    mediaType: imageMediaType.optional(),
  }),
  output: z.string(),
});
