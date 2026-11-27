import { z } from "zod";

export const presentedFile = z.object({
  path: z.string().refine((path) => !!path.trim()),
  description: z.string().optional(),
});
export type PresentedFile = z.infer<typeof presentedFile>;

export const actionCard = z.object({
  callId: z.string().min(1),
  title: z.string().min(1),
  brief: z.string().min(1),
  phase: z.string().optional(),
});
export type ActionCard = z.infer<typeof actionCard>;
const proposal = actionCard.omit({ phase: true }).extend({
  turn: z.number().int().nonnegative(),
});

// DSH admits proposals after a successful call and updates decisions across turns.
export function actionCardsByTurn(view?: {
  proposals?: Record<string, unknown>;
  decisions?: Record<string, { phase?: unknown }>;
}): Record<string, ActionCard> {
  const cards: Record<string, ActionCard> = {};
  for (const value of Object.values(view?.proposals ?? {})) {
    const parsed = proposal.safeParse(value);
    if (!parsed.success) continue;
    const { turn, callId, title, brief } = parsed.data;
    const current = cards[turn];
    if (current && current.callId <= callId) continue;
    const phase = view?.decisions?.[callId]?.phase;
    cards[turn] = {
      callId,
      title,
      brief,
      ...(typeof phase === "string" && { phase }),
    };
  }
  return cards;
}

export const planDocument = z.object({
  callId: z.string().min(1),
  title: z.string(),
  markdown: z.string(),
});
export type PlanDocument = z.infer<typeof planDocument>;

export function submittedPlan(
  type: string,
  data: {
    name?: string;
    callId?: string;
    subCallId?: string;
    arguments?: unknown;
  },
): PlanDocument | undefined {
  if (data.name !== "exit_plan_mode") return;
  const native = type === "tool/call";
  const callId = native ? data.callId : data.subCallId;
  if (typeof callId !== "string" || !callId) return;
  let args = data.arguments;
  if (native) {
    if (typeof args !== "string") return;
    try {
      args = JSON.parse(args);
    } catch {
      return;
    }
  }
  if (
    !args ||
    typeof args !== "object" ||
    !("plan" in args) ||
    typeof args.plan !== "string"
  )
    return;
  const title = /^#\s+([^\s][^\r\n]*)/.exec(args.plan.trim())?.[1];
  if (title) return { callId, title, markdown: args.plan };
}
