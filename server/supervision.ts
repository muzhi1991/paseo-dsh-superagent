import { boundAgent } from "./bindings.ts";
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
async function deployment(c: Parameters<typeof rpc>[0]) {
  const view = await rpc(c, "settings/describe", {});
  const entry = view?.namespaces?.find(
    (n: { ns: string }) => n.ns === "dsh-superagent",
  );
  if (!entry) return null;
  const {
    promptMaxChars,
    admissionContextMaxPages,
    admissionContextTimeoutMs,
  } = entry.value ?? {};
  return {
    writable: view.writable === true && Number.isInteger(entry.revision),
    revision: entry.revision,
    value: {
      promptMaxChars,
      admissionContextMaxPages,
      admissionContextTimeoutMs,
    },
  };
}
export async function readSupervision(r: Route & { instance: string }) {
  const { c, s, instance } = await target(r.instance);
  const read = (path: string, params: Record<string, string> = {}) =>
    management(c, path + "?" + new URLSearchParams(params));
  const offset = String(r.offset || 0);
  let data, agent: string | undefined;
  switch (r.page) {
    case "概览":
      data = await read("overview");
      break;
    case "来源":
      data = (await read("sources")).map((source: { id: string }) =>
        source.id === "github"
          ? { ...source, repository: s.setup?.accounts?.repository }
          : source,
      );
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
      agent = await boundAgent(c.url, s.setup?.machine?.stateDir, r.id);
      break;
    case "设置":
      if (r.filter === "deployment")
        data = {
          ...s.setup,
          form: await deployment(c).catch((e: Error) => {
            if (e.message.includes("401")) throw e;
            return null;
          }),
        };
      else if (r.filter === "prompts") data = await read("prompts");
      else {
        const [settings, history, models] = await Promise.all([
          read("settings"),
          read("policy/history"),
          ["eval", "execution"].includes(r.filter || "")
            ? read("models").catch(() => null)
            : null,
        ]);
        data = { ...settings, history: history.items, models };
      }
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
    case "deployment": {
      const form = await deployment(c);
      if (!form?.writable) throw Error("所选 DSH 实例的部署配置为只读。");
      if (form.revision !== command.revision)
        throw Error("部署配置已有新版本，请重新读取后再保存。");
      const ops = Object.entries(command.changes).map(([key, value]) =>
        value === null
          ? { op: "unset", path: [key] }
          : { op: "set", path: [key], value },
      );
      if (ops.length)
        await rpc(c, "settings/mutate", {
          ns: "dsh-superagent",
          ops,
          expectedRevision: command.revision,
        });
      return true;
    }
    case "sync-policy":
      path = "policy-sync/" + segment(command.id);
      break;
    case "refresh-labels":
      path = "sources/" + segment(command.id) + "/labels";
      break;
    case "check-setup":
      path = "setup/check";
      break;
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
