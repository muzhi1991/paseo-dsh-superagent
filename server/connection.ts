import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";

export const directory = join(
  process.env.PASEO_HOME || join(homedir(), ".paseo"),
  "plugin-data",
  "paseo-dsh-superagent",
);
const path = join(directory, "connection.json");
type Config = { url: string; cookie: string };
type SavedConfig = Config & { revision?: string };
export async function config(): Promise<SavedConfig> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { url: "http://127.0.0.1:3083", cookie: "" };
  }
}
let saving = Promise.resolve();
export function persist(c: Config, expected?: SavedConfig) {
  const write = saving.then(async () => {
    if (expected) {
      const current = await config();
      if (
        current.revision !== expected.revision ||
        current.url !== expected.url ||
        current.cookie !== expected.cookie
      )
        throw Error("另一端已更新 DSH 连接，请核对目标实例后再保存。");
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const revision = randomUUID(),
      temp = path + "." + revision;
    await writeFile(temp, JSON.stringify({ ...c, revision }), { mode: 0o600 });
    await rename(temp, path);
  });
  saving = write.catch(() => {});
  return write;
}
// An explicit refusal is distinct from losing a response after DSH may have accepted a write.
export class DshRefusal extends Error {}
function origin(input: string) {
  const url = new URL(input);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/" ||
    url.search
  )
    throw Error("地址只填写 DSH 的协议、主机和端口。");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  )
    throw Error("远程连接请使用 HTTPS 或本机 SSH 端口转发。");
  return url.origin;
}
export async function request(c: Config, path: string, init: RequestInit = {}) {
  init.signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(20000);
  const response = await fetch(c.url + path, {
    ...init,
    redirect: "manual",
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    headers: { ...(c.cookie ? { cookie: c.cookie } : {}), ...init.headers },
  });
  // The unauthenticated root probe checks only whether the instance answers.
  if (response.status === 401 && path !== "/") {
    await response.body?.cancel();
    const reason = path.startsWith("/?")
      ? "DSH 未接受刚填写的登录令牌"
      : c.cookie
        ? "DSH 未接受 Paseo 已保存的登录凭据，凭据可能已过期"
        : "Paseo 尚未登录这个 DSH 实例";
    throw new DshRefusal(
      `已连接到 DSH，但${reason}（HTTP 401）。请从该实例的启动终端或日志中找到最近一次启动的 dsh web: 链接，复制 token 参数，填入「Paseo 设置 → 插件 → DSH Superagent → DSH 实例」，然后点「验证并保存」。`,
    );
  }
  return response;
}
export async function management(
  c: Config,
  route: string,
  signal?: AbortSignal,
): Promise<any> {
  const r = await request(c, "/orchestrator/api/" + route, {
    signal,
    headers: { "x-orchestrator-request": "1" },
  });
  if (!r.ok) throw Error("Superagent 管理接口返回 HTTP " + r.status);
  return r.json();
}
export async function state(c: Config, signal?: AbortSignal) {
  const v = await management(c, "state", signal);
  if (
    typeof v?.masterId !== "string" ||
    !v.masterId ||
    typeof v.paused !== "boolean" ||
    !v.setup ||
    !v.load
  )
    throw Error("接口响应不符合 Superagent 状态格式。");
  return v;
}
export async function rpc(
  c: Config,
  method: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const rpcId = randomUUID();
  const r = await request(c, "/api/" + method, {
    signal,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId,
      method,
      payload: { args },
    }),
  });
  if (r.status === 429) {
    await r.body?.cancel();
    throw new DshRefusal("DSH 会话接口请求过于频繁（HTTP 429），请稍后重试。");
  }
  if (!r.ok) throw Error("DSH 会话接口 HTTP " + r.status);
  const body = (await r.json()) as {
    rpcId: string;
    result?: {
      ok: boolean;
      value: any;
      error?: { message: string; code?: string };
    };
  };
  if (body.rpcId !== rpcId || !body.result)
    throw Error("DSH 会话接口返回无效回执");
  if (!body.result.ok) {
    const error = body.result.error;
    const message = "DSH: " + (error?.message || "无效响应");
    if (
      [
        "gateway/bad-request",
        "session/attachment-invalid",
        "session/not-found",
        "session/model-unavailable",
        "session/agent-busy",
      ].includes(error?.code ?? "")
    )
      throw new DshRefusal(message);
    throw Error(message);
  }
  return body.result.value;
}
export const targetEvents = new EventEmitter<{ mismatch: [actual: string] }>();
export async function target(expected?: string, signal?: AbortSignal) {
  const c = await config();
  if (!c.cookie)
    throw Error(
      "请先在「Paseo 设置 → 插件 → DSH Superagent → DSH 实例」填写启动令牌，点「验证并保存」。",
    );
  const s = await state(c, signal),
    id = s.masterId as string,
    instance = c.url + "#" + id;
  if (expected !== undefined && instance !== expected) {
    if (!signal?.aborted) targetEvents.emit("mismatch", instance);
    throw new Error("实例已切换，请回到面板，点「重新读取」以打开当前实例。");
  }
  return { c, s, id, instance };
}
export async function check({
  url,
  token,
  save,
}: {
  url: string;
  token: string;
  save: boolean;
}) {
  const status = {
    reachable: false,
    superagent: false,
    router: false,
    saved: false,
    detail: "",
  };
  try {
    const previous = await config(),
      address = origin(url.trim()),
      c = {
        url: address,
        cookie: previous.url === address ? previous.cookie : "",
      };
    const r = await request(c, "/");
    status.reachable = true;
    await r.body?.cancel();
    if (token.trim()) {
      const login = await request(
        { url: address, cookie: "" },
        "/?" + new URLSearchParams({ token: token.trim() }),
      );
      const cookie = login.headers
        .getSetCookie()
        .find((h) => h.startsWith("dsh-auth-"))
        ?.split(";")[0];
      await login.body?.cancel();
      if (!cookie) throw Error("DSH 未接受登录令牌。");
      c.cookie = cookie;
    }
    const s = await state(c);
    status.superagent = true;
    if (!c.cookie) throw Error("首次连接此实例需要 DSH Web 启动令牌。");
    const projection = await rpc(c, "session/projections", {
      request: { sessionId: s.masterId },
    });
    status.router = projection?.kind === "sequenced";
    if (!status.router) {
      if (s.setup?.problem) {
        const detail = s.setup.problem.detail;
        throw Error(
          "已检测到 Superagent，Router 主会话尚未就绪。请先在 DSH Web 的 Superagent 面板完成部署检查，再回来验证。" +
            (typeof detail === "string" ? " DSH：" + detail : ""),
        );
      }
      throw Error("已检测到 Superagent，Router 主会话尚不可读取。");
    }
    if (save) {
      await persist(c, previous);
      status.saved = true;
    }
    status.detail = "已验证 Superagent 和 Router 主会话";
  } catch (e) {
    status.detail = e instanceof Error ? e.message : "验证失败";
  }
  return status;
}
