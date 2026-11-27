import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const tabs = ["概览", "来源", "触发", "评估", "执行", "设置"] as const;
export const filters = {
  触发: {
    subscribed: "已被订阅",
    evaluating: "评估中",
    recent: "24 小时内有新触发",
    all: "全部线程",
  },
  评估: {
    work: "接单与续做",
    stop: "停止",
    ignore: "忽略",
    unavailable: "未完成",
    all: "全部",
  },
  执行: {
    open: "进行中",
    person: "待处理",
    working: "执行中",
    idle: "等待新触发",
    ended: "已结束",
  },
  设置: {
    source: "来源",
    eval: "评估",
    execution: "执行",
    prompts: "提示词",
    deployment: "部署",
  },
};
export const routeSchema = z.object({
  page: z.enum([...tabs, "线程", "工单", "搜索"]),
  id: z.string().max(512).optional(),
  filter: z.string().max(32).optional(),
  recent: z.boolean().optional(),
  around: z.string().optional(),
  query: z.string().max(512).optional(),
  offset: z.number().int().nonnegative().optional(),
  before: z.string().max(512).optional(),
});
export type Route = z.infer<typeof routeSchema>;
export const view = defineRpc({
  name: "supervision.view",
  input: routeSchema,
  output: z.object({
    instance: z.string(),
    paused: z.boolean(),
    load: z.object({
      running: z.number(),
      queued: z.number(),
      maxWorkers: z.number(),
    }),
    data: z.any(),
    agent: z.string().optional(),
  }),
});
const machineLimits = z
  .object({
    promptMaxChars: z
      .number()
      .int()
      .min(1000)
      .max(1000000)
      .nullable()
      .optional(),
    admissionContextMaxPages: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .optional(),
    admissionContextTimeoutMs: z
      .number()
      .int()
      .min(1)
      .max(90000)
      .nullable()
      .optional(),
  })
  .strict();
const command = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["sync-policy", "refresh-labels"]),
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  }),
  z.object({ kind: z.literal("check-setup") }),
  z.object({
    kind: z.literal("deployment"),
    revision: z.number().int().nonnegative(),
    changes: machineLimits,
  }),
  z.object({ kind: z.literal("pause"), paused: z.boolean() }),
  z.object({
    kind: z.enum(["retry", "stop", "requeue", "unsubscribe"]),
    id: z.string().min(1).max(512),
  }),
  z.object({
    kind: z.literal("settings"),
    block: z.string().regex(/^(policy|executor|eval|source:[a-z][a-z0-9-]*)$/),
    revision: z.number().int().nonnegative(),
    value: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("prompts"),
    revision: z.number().int().nonnegative(),
    value: z.record(z.string(), z.unknown()),
  }),
]);
export type Command = z.infer<typeof command>;
export const mutate = defineRpc({
  name: "supervision.update",
  input: z.object({ instance: z.string(), command }),
  output: z.boolean(),
});
export const previewPrompts = defineRpc({
  name: "supervision.preview-prompts",
  input: z.object({
    instance: z.string(),
    config: z.record(z.string(), z.unknown()),
  }),
  output: z.object({
    orchestrator: z.string(),
    worker: z.string(),
    parts: z
      .object({
        orchestrator: z.array(
          z.object({
            name: z.string(),
            key: z.string().optional(),
            text: z.string(),
            heading: z.string().optional(),
            kind: z.string(),
          }),
        ),
        worker: z.array(
          z.object({
            name: z.string(),
            key: z.string().optional(),
            text: z.string(),
            heading: z.string().optional(),
            kind: z.string(),
          }),
        ),
      })
      .optional(),
    skills: z.record(z.string(), z.string()),
  }),
});

export const promptVersions = defineRpc({
  name: "supervision.prompt-versions",
  input: z.object({
    instance: z.string(),
    revision: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative().optional(),
  }),
  output: z.object({
    current: z.object({
      revision: z.number(),
      config: z.record(z.string(), z.unknown()),
    }),
    revisions: z.array(
      z.object({
        revision: z.number(),
        savedAt: z.string(),
        changed: z.array(z.string()),
      }),
    ),
    next_offset: z.number().nullable(),
  }),
});
