import { rpc, target } from "./connection";

type Entry = {
  seq: number;
  role: "user" | "assistant" | "status";
  text: string;
};
function message(parts: any[]) {
  return (parts || [])
    .flatMap((p) =>
      p.type === "text"
        ? [p.text]
        : p.type === "file"
          ? ["📎 " + (p.file?.name || p.name || "附件")]
          : p.type === "image"
            ? ["[图片]"]
            : [],
    )
    .join("\n");
}
export async function readHistory(before?: number) {
  const { c, id, instance } = await target();
  const proj = await rpc(c, "session/projections", {
    request: { sessionId: id },
  });
  if (proj?.kind !== "sequenced") throw Error("主会话历史暂时不可用");
  const page = await rpc(c, "session/page", {
    request: {
      address: { kind: "session", sessionId: id },
      throughSeq: proj.asOfSeq,
      maxMessages: 14,
      ...(before ? { beforeSeq: before } : {}),
    },
  });
  const entries: Entry[] = [],
    starts = new Map<number, number>();
  let busy = false;
  for (const { event: e } of page.records) {
    const d = e.data;
    let role: Entry["role"] = "status",
      text = "";
    if (e.type === "user/message") {
      role = "user";
      text = message(d.content);
    }
    if (e.type === "assistant/message") {
      role = "assistant";
      text = message(d.message.content);
    }
    if (e.type === "tool/call") text = d.name;
    if (e.type === "turn/start") {
      starts.set(d.turn, e.time);
      text = "收到执行请求";
      busy = true;
    }
    if (e.type === "turn/end") {
      const start = starts.get(d.turn);
      text = start
        ? `已结束，用时 ${Math.round((e.time - start) / 1000)} 秒`
        : "本轮已结束";
      busy = false;
    }
    if (text) entries.push({ seq: e.seq, role, text: text.slice(0, 16000) });
  }
  const next = proj.values?.modelSelection?.next;
  return {
    instance,
    entries,
    older: page.hasMore ? page.records[0]?.event.seq : undefined,
    busy,
    model:
      [next?.model, next?.reasoningEffort].filter(Boolean).join(" · ") ||
      "选择模型",
  };
}
