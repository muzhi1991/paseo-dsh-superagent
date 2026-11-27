import { boundAgent } from "./bindings.ts";
import type { RpcInput } from "@getpaseo/plugin";
import type { panel } from "../shared/api";
import { target, management } from "./connection.ts";

type Row = { id: string; title: string; detail: string; ticket?: boolean };
const stages: Record<string, string> = {
  person: "等待人工处理",
  working: "执行中",
  pending: "等待执行",
  waiting: "等待触发",
  ended: "已结束",
};
const ticket = (r: any): Row => ({
  id: r.id,
  title: r.title,
  detail: [stages[r.stage] || r.stage, r.updatedAt].filter(Boolean).join(" · "),
  ticket: true,
});
const row = (id: string, title: string, detail: string): Row => ({
  id,
  title,
  detail,
});
const label = (x: any): string =>
  typeof x === "string" ? x : x?.zh || x?.en || "";
export async function readPanel(input: RpcInput<typeof panel>) {
  const { c, s, instance } = await target();
  let rows: Row[] = [],
    agent: string | undefined;
  switch (input.page) {
    case "概览": {
      const v = await management(c, "overview");
      rows = [
        ...v.person.map(ticket),
        ...v.problems.map((p: any, i: number) =>
          row("p" + i, p.kind, p.detail || p.source?.id || "需要处理"),
        ),
        row(
          "flow",
          "最近 24 小时",
          `到达 ${v.flow.received}　过滤 ${v.flow.filtered}　评估 ${v.flow.judged}　接受 ${v.flow.accepted}`,
        ),
        row(
          "load",
          "执行器",
          `运行 ${v.executor.running} / ${v.executor.maxWorkers}　排队 ${v.executor.queued}`,
        ),
      ];
      if (!v.person.length)
        rows.unshift(
          row("pending", "待处理工单", "当前没有需要人工处理的工单"),
        );
      break;
    }
    case "来源":
      rows = (await management(c, "sources")).map((v: any) =>
        row(
          v.id,
          label(v.title) || v.id,
          `${v.enabled ? "已启用" : "已停用"} · 接收 ${v.stats.received} · 过滤 ${v.stats.filtered}`,
        ),
      );
      break;
    case "执行":
      rows = (
        await management(
          c,
          "tickets?state=" + (input.ended ? "ended" : "open") + "&limit=100",
        )
      ).items.map(ticket);
      break;
    case "触发":
      rows = (await management(c, "threads?filter=all&limit=100")).items.map(
        (v: any) => row(v.key, v.title || v.key, v.source || v.key),
      );
      break;
    case "评估":
      rows = (await management(c, "decisions?limit=100")).items.map((v: any) =>
        row(
          v.id,
          v.threadTitle || v.thread,
          [v.outcome || v.kind, v.at].join(" · "),
        ),
      );
      break;
    case "工单": {
      if (!input.id || !/^[-\w]+$/.test(input.id)) throw Error("无效工单号");
      const t = await management(c, "tickets/" + input.id);
      rows = [
        row("id", t.title, input.id + " · " + (stages[t.stage] || t.stage)),
        row(
          "scope",
          "授权范围",
          label(t.mandate?.scope) || t.mandate?.title || "—",
        ),
        ...t.assignments.map((v: any, i: number) =>
          row(
            "a" + i,
            "执行分配 " + (i + 1),
            [v.state, v.startedAt].filter(Boolean).join(" · "),
          ),
        ),
        ...t.threads.map((v: any, i: number) =>
          row("t" + i, v.title || v.key, v.key),
        ),
      ];
      agent = await boundAgent(c.url, s.setup?.machine?.stateDir, input.id);
      break;
    }
    case "设置":
      rows = [
        row("url", "DSH 实例", c.url),
        row("router", "主 Session", s.masterId),
        row("executor", "执行器", s.paused ? "已暂停" : "已启用"),
      ];
      break;
  }
  return { rows, instance, agent };
}
