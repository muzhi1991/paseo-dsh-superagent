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
export async function config(): Promise<Config> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { url: "http://127.0.0.1:3083", cookie: "" };
  }
}
export async function persist(c: Config) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = path + "." + randomUUID();
  await writeFile(temp, JSON.stringify(c), { mode: 0o600 });
  await rename(temp, path);
}
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
  const response = await fetch(c.url + path, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
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
    throw Error(
      `已连接到 DSH，但${reason}（HTTP 401）。请从该实例的启动终端或日志中找到最近一次启动的 dsh web: 链接，复制 token 参数，填入「Paseo 设置 → 插件 → DSH Superagent → DSH 实例」，然后点「验证并保存」。`,
    );
  }
  return response;
}
export async function management(c: Config, route: string): Promise<any> {
  const r = await request(c, "/orchestrator/api/" + route, {
    headers: { "x-orchestrator-request": "1" },
  });
  if (!r.ok) throw Error("Superagent 管理接口返回 HTTP " + r.status);
  return r.json();
}
export async function state(c: Config) {
  const v = await management(c, "state");
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
) {
  const rpcId = randomUUID();
  const r = await request(c, "/api/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId,
      method,
      payload: { args },
    }),
  });
  if (!r.ok)
    throw Error("DSH 会话接口 HTTP " + r.status);
  const body = (await r.json()) as {
    rpcId: string;
    result?: { ok: boolean; value: any; error?: { message: string } };
  };
  if (body.rpcId !== rpcId || !body.result?.ok)
    throw Error("DSH: " + (body.result?.error?.message || "无效响应"));
  return body.result.value;
}
export async function target(expected?: string) {
  const c = await config(),
    s = await state(c),
    id = s.masterId as string,
    instance = c.url + "#" + id;
  if (expected !== undefined && instance !== expected)
    throw Error("实例已切换，请返回面板并重新打开主会话。");
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
    const s = await state(c);
    status.superagent = true;
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
    if (!c.cookie) throw Error("首次连接此实例需要 DSH Web 启动令牌。");
    const projection = await rpc(c, "session/projections", {
      request: { sessionId: s.masterId },
    });
    status.router = projection?.kind === "sequenced";
    if (!status.router) throw Error("已检测到 Superagent，Router 主会话尚不可读取。");
    if (save) {
      await persist(c);
      status.saved = true;
    }
    status.detail = "已验证 Superagent 和 Router 主会话";
  } catch (e) {
    status.detail = e instanceof Error ? e.message : "验证失败";
  }
  return status;
}
