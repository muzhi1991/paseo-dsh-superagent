import {
  actionCardsByTurn,
  presentedFile,
  submittedPlan,
} from "../shared/cards.ts";
import { imageMediaType } from "../shared/image.ts";
import { rpc, target } from "./connection.ts";
import type { TranscriptEvent, Attachment } from "../shared/transcript.ts";

type Part = {
  type: string;
  text?: string;
  name?: string;
  attachment?: {
    attachmentId?: string;
    name?: string;
    bytes?: number;
    mediaType?: string;
    width?: number;
    height?: number;
  };
};
type RecordEvent = {
  surfaceOp?: string;
  seq: number;
  time: number;
  type: string;
  data: any;
};
const textOf = (parts: Part[] = []) =>
  parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("\n");
function filesOf(parts: Part[]): Attachment[] {
  return parts.flatMap((p): Attachment[] =>
    p.type === "file" || p.type === "image"
      ? [
          {
            kind: p.type,
            id: p.attachment?.attachmentId,
            name:
              p.attachment?.name ||
              p.name ||
              (p.type === "image" ? "图片" : "附件"),
            bytes: p.attachment?.bytes,
            width: p.attachment?.width,
            height: p.attachment?.height,
          },
        ]
      : [],
  );
}
type InboxItem = { id: string; source: { kind: string } };
function inbox() {
  return {
    pending: [] as InboxItem[],
    claimed: new Set<string>(),
    hasHuman: false,
    seq: -1,
  };
}
export function projectEvents(
  records: { event: RecordEvent }[],
  outline: { seq: number; turn: number }[],
): TranscriptEvent[] {
  const first = records[0]?.event.seq;
  let turn = outline.filter((t) => t.seq <= first).at(-1)?.turn ?? 0;
  let start = -1,
    step = 0;
  const queues = { "next-turn": inbox(), "next-step": inbox() };
  const rows: TranscriptEvent[] = [];
  for (const { event: e } of records) {
    const d = e.data;
    if (e.type === "agent/inbox/spliced") {
      const queue = queues[d.target as keyof typeof queues];
      if (!queue) continue;
      const added: InboxItem[] = d.inserted || [];
      const removed = queue.pending.splice(
        d.start,
        d.removedCount || 0,
        ...added,
      );
      if (d.removedCount > 0 && d.outcome !== "canceled") {
        queue.claimed = new Set(removed.map((m) => m.id));
        queue.hasHuman = removed.some((m) => m.source?.kind === "user");
        queue.seq = e.seq;
      } else {
        for (const m of added) queue.claimed.delete(m.id);
      }
      continue;
    }
    if (e.type === "turn/start") {
      turn = d.turn;
      start = e.seq;
      step = 0;
    }
    if (e.type === "step/start") step = d.step;
    const base = { seq: e.seq, time: e.time, turn: d.turn ?? turn };
    if (e.surfaceOp && e.surfaceOp !== "append") continue;
    switch (e.type) {
      case "turn/start":
        rows.push({ ...base, kind: "start" });
        break;
      case "turn/end":
        rows.push({
          ...base,
          kind: "end",
          name: d.reason?.kind || "ended",
          text: d.reason?.error?.message,
        });
        break;
      case "developer/message":
      case "user/message": {
        const source = d.source?.kind || "legacy";
        const human =
          e.type === "user/message" && ["user", "legacy"].includes(source);
        const next = queues["next-turn"],
          steer = queues["next-step"];
        const waking =
          next.claimed.has(d.id) ||
          (step === 1 &&
            start >= 0 &&
            steer.seq > start &&
            next.seq < start &&
            !steer.hasHuman &&
            steer.claimed.has(d.id));
        const kind =
          waking || (source === "retry" && !d.content?.length)
            ? "trigger"
            : "context";
        rows.push(
          human
            ? {
                ...base,
                kind: "user",
                text: textOf(d.content),
                files: filesOf(d.content || []),
              }
            : {
                ...base,
                kind,
                files: filesOf(d.content || []),
                source,
                form:
                  source === "retry" && !d.content?.length
                    ? "continuation"
                    : d.source?.provider || d.source?.form,
                name:
                  typeof d.source?.summary === "string"
                    ? d.source.summary
                    : undefined,
              },
        );
        break;
      }
      case "assistant/message": {
        const parts: Part[] = d.message?.content || [];
        rows.push({
          ...base,
          kind: "assistant",
          text: textOf(parts),
          files: filesOf(parts),
          hasTool: parts.some((p) => p.type === "tool-call"),
          reasoning: parts.some((p) => p.type === "reasoning" && p.text),
          tokens: d.usage?.totalTokens,
        });
        break;
      }
      case "deliverables/presented": {
        if (
          !Number.isSafeInteger(d.turn) ||
          d.turn < 1 ||
          typeof d.callId !== "string" ||
          !d.callId ||
          !Array.isArray(d.files)
        )
          break;
        const files = d.files.flatMap((value: unknown) => {
          const file = presentedFile.safeParse(value);
          return file.success ? [file.data] : [];
        });
        if (files.length)
          rows.push({ ...base, kind: "presented", presented: files });
        break;
      }
      case "tool/ptc-dispatch-start":
      case "tool/ptc-dispatch": {
        const plan = submittedPlan(e.type, d);
        if (plan) rows.push({ ...base, kind: "plan", plan });
        break;
      }
      case "tool/call":
        rows.push({
          ...base,
          kind: "call",
          call: d.callId,
          name: d.name,
          plan: submittedPlan(e.type, d),
        });
        break;
      case "tool/result":
        rows.push({
          ...base,
          kind: "result",
          files: filesOf(d.message?.content || []),
          call: d.message?.toolCallId,
          error: d.message?.isError,
        });
        break;
    }
  }
  return rows;
}
export async function readTranscript({
  before,
  instance: expected,
}: {
  before?: number;
  instance?: string;
}) {
  const { c, id, instance } = await target(expected);
  const proj = await rpc(c, "session/projections", {
    request: { sessionId: id },
  });
  if (proj?.kind !== "sequenced") throw Error("主会话历史暂时不可用");
  const page = await rpc(c, "session/page", {
    request: {
      address: { kind: "session", sessionId: id },
      throughSeq: proj.asOfSeq,
      maxMessages: 64,
      turnWindow: { minMessages: 1, minTurns: 5 },
      ...(before ? { beforeSeq: before } : {}),
    },
  });
  // A waking inbox insertion often precedes the turn/start at the page boundary.
  const first = page.records[0]?.event.seq;
  const prefix =
    page.hasMore && first
      ? await rpc(c, "session/page", {
          request: {
            address: { kind: "session", sessionId: id },
            throughSeq: proj.asOfSeq,
            beforeSeq: first,
            maxMessages: 4,
          },
        })
      : undefined;
  const v = proj.values || {},
    outline = v.turnOutline || [],
    events = projectEvents(
      [...(prefix?.records || []), ...page.records],
      outline,
    ).filter((e) => e.seq >= first),
    latest = events.at(-1)?.turn ?? outline.at(-1)?.turn;
  const stats = v.sessionStats || {},
    usage = v.tokenUsage || {},
    pressure = v.contextPressure;
  const sel = v.modelSelection?.next || v.modelSelection?.lastUsed || {};
  return {
    instance,
    title: typeof v.title === "string" ? v.title : "Router",
    provider: sel.provider,
    model: sel.model || "选择模型",
    effort: sel.reasoningEffort || "",
    events,
    ...(!before && { actionCards: actionCardsByTurn(v.actionCards) }),
    older: page.hasMore ? page.records[0]?.event.seq : undefined,
    busy:
      !before &&
      latest != null &&
      !events.some((e) => e.kind === "end" && e.turn === latest),
    stats: {
      turns: stats.turns ?? 0,
      steps: stats.steps ?? 0,
      speed: stats.decodeMs
        ? Math.round((1000 * stats.decodeTokens) / stats.decodeMs)
        : 0,
      tokens:
        (usage.uncachedInputTokens || 0) +
        (usage.cacheReadTokens || 0) +
        (usage.cacheWriteTokens || 0) +
        (usage.outputTokens || 0),
      pressure:
        pressure?.contextWindow > 0 && Number.isFinite(pressure.pressureTokens)
          ? Math.round((100 * pressure.pressureTokens) / pressure.contextWindow)
          : undefined,
    },
  };
}
async function eventAt(
  c: Awaited<ReturnType<typeof target>>["c"],
  id: string,
  seq: number,
) {
  const page = await rpc(c, "session/page", {
    request: {
      address: { kind: "session", sessionId: id },
      throughSeq: seq,
      maxMessages: 1,
    },
  });
  const event: RecordEvent | undefined = page.records.find(
    (r: { event: RecordEvent }) => r.event.seq === seq,
  )?.event;
  if (!event) throw Error("这条记录已不可用");
  return event;
}
export async function readImageAttachment({
  instance,
  seq,
  id: attachmentId,
}: {
  instance: string;
  seq: number;
  id: string;
}) {
  const { c, id } = await target(instance);
  const event = await eventAt(c, id, seq);
  const content: Part[] =
    event.type === "user/message" || event.type === "developer/message"
      ? event.data.content
      : event.type === "assistant/message" || event.type === "tool/result"
        ? event.data.message?.content
        : [];
  const attachment = content?.find(
    (p) => p.type === "image" && p.attachment?.attachmentId === attachmentId,
  )?.attachment;
  if (!attachment) throw Error("这条会话记录没有该图片");
  const value = await rpc(c, "session/attachment", {
    // Older controllers authorize by ID; newer ones read the full stored reference.
    request: { sessionId: id, attachmentId, attachment },
  });
  return {
    mime: imageMediaType.parse(value.attachment.mediaType),
    data: value.data as string,
  };
}
export async function readEventDetail({
  instance,
  seq,
}: {
  instance: string;
  seq: number;
}) {
  const { c, id } = await target(instance);
  const event = await eventAt(c, id, seq);
  const d = event.data;
  switch (event.type) {
    case "developer/message":
    case "user/message":
      return textOf(d.content);
    case "assistant/message":
      return ((d.message?.content as Part[]) || [])
        .filter((p) => p.type === "reasoning")
        .map((p) => p.text)
        .join("\n");
    case "tool/call": {
      if (typeof d.arguments !== "string")
        return JSON.stringify(d.arguments ?? {}, null, 2);
      try {
        return JSON.stringify(JSON.parse(d.arguments), null, 2);
      } catch {
        return d.arguments;
      }
    }
    case "tool/result":
      return textOf(d.message?.content);
    default:
      return "";
  }
}
