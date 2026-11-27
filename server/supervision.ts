import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { target, management, request, rpc } from "./connection.ts";
import { filters, type Route, type Command } from "../shared/supervision.ts";

const decisionKinds: Record<string, string> = {
  work: "accept,reopen",
  stop: "stop",
  ignore: "ignore",
  unavailable: "unavailable",
  all: "",
};
function segment(id?: string) {
  if (!id || id === "." || id === ".." || /[\x00-\x1f\\]/.test(id))
    throw Error("无效记录 ID");
  return encodeURIComponent(id);
}
export async function readSupervision(r: Route) {
  const { c, s, instance } = await target();
  const read = (path: string, params: Record<string, string> = {}) =>
    management(c, path + "?" + new URLSearchParams(params));
  const offset = String(r.offset || 0);
  let data, agent: string | undefined;
  switch (r.page) {
    case "概览":
      data = await read("overview");
      break;
    case "来源":
      data = await read("sources");
      break;
    case "触发":
      data = await read("threads", {
        filter:
          r.filter && Object.hasOwn(filters.触发, r.filter)
            ? r.filter
            : "subscribed",
        offset,
        limit: "20",
      });
      break;
    case "评估":
      data = await read("decisions", {
        kind: decisionKinds[r.filter || "work"] ?? decisionKinds.work,
        offset,
        limit: "30",
        ...(r.recent ? { window: "24h" } : {}),
      });
      break;
    case "执行":
      data = await read("tickets", {
        state:
          r.filter && Object.hasOwn(filters.执行, r.filter) ? r.filter : "open",
        offset,
        limit: "20",
      });
      break;
    case "搜索":
      data = await read("search", { q: r.query || "" });
      break;
    case "线程":
      data = await read("threads/" + segment(r.id), {
        limit: "30",
        ...(r.before
          ? { before: r.before }
          : r.around
            ? { around: r.around }
            : {}),
      });
      break;
    case "工单":
      if (!r.id || !/^[-\w]+$/.test(r.id)) throw Error("无效工单号");
      data = await read("tickets/" + segment(r.id));
      if (
        ["localhost", "127.0.0.1", "[::1]"].includes(new URL(c.url).hostname) &&
        typeof s.setup?.machine?.stateDir === "string"
      ) {
        try {
          const b = JSON.parse(
            await readFile(
              join(s.setup.machine.stateDir, "paseo-bindings", r.id + ".json"),
              "utf8",
            ),
          );
          if (typeof b.agentId === "string") agent = b.agentId;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
      break;
    case "设置":
      if (r.filter === "deployment") data = s.setup;
      else if (r.filter === "prompts") data = await read("prompts");
      else if (r.filter === "eval" || r.filter === "execution") {
        const [settings, history] = await Promise.all([
          read("settings"),
          read("policy/history"),
        ]);
        data = { ...settings, history: history.items };
      } else data = await read("settings");
      break;
  }
  return { instance, paused: s.paused, load: s.load, data, agent };
}
export async function change({
  instance,
  command,
}: {
  instance: string;
  command: Command;
}) {
  const { c, id } = await target(instance);
  const session = await rpc(c, "session/projections", {
    request: { sessionId: id },
  });
  if (session?.kind !== "sequenced")
    throw Error(
      "请在 Paseo 插件设置中重新验证 Router 凭据后再修改 Superagent。",
    );
  let path: string,
    body: unknown,
    method = "POST";
  switch (command.kind) {
    case "pause":
      path = "executor/pause";
      body = { paused: command.paused };
      break;
    case "retry":
    case "stop":
      path = "tickets/" + segment(command.id) + "/" + command.kind;
      break;
    case "requeue":
      path = "triggers/" + segment(command.id) + "/requeue";
      break;
    case "unsubscribe":
      path = "threads/" + segment(command.id) + "/unsubscribe";
      break;
    case "settings":
      path = "settings/" + command.block;
      method = "PUT";
      body = { revision: command.revision, value: command.value };
      break;
    case "prompts":
      path = "prompts";
      method = "PUT";
      body = { baseRevision: command.revision, config: command.value };
      break;
  }
  const res = await request(c, "/orchestrator/api/" + path, {
    method,
    headers: {
      "x-orchestrator-request": "1",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409)
    throw Error("配置已有新版本。请保留草稿并重新读取后再保存。");
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw Error(problem?.error || "DSH 操作失败，HTTP " + res.status);
  }
  return true;
}
