import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  link,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type { send } from "../shared/api";
import { directory, DshRefusal, rpc, target } from "./connection.ts";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function dispatch({
  instance,
  requestId,
  mode = "queue",
  text,
  receipts,
}: RpcInput<typeof send>) {
  if (!text.trim() && !receipts.length) throw Error("消息为空");
  const { c, id } = await target(instance);
  const dir = join(directory, "requests", hash(instance)),
    path = join(dir, requestId);
  const signature = hash(JSON.stringify([text, receipts]));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Reserve before the network write. A daemon crash cannot turn an unknown receipt into a second prompt.
  const reservation = path + "." + randomUUID();
  await writeFile(reservation, JSON.stringify({ signature, accepted: false }), {
    mode: 0o600,
  });
  try {
    for (;;) {
      try {
        await link(reservation, path);
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      let prior;
      try {
        prior = JSON.parse(await readFile(path, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
      if (prior.signature !== signature) throw Error("请求号已被其他消息使用");
      if (prior.accepted) return true;
      throw Error("上次投递尚未确认，请先查看 Router 历史。");
    }
  } finally {
    await unlink(reservation);
  }
  try {
    const result = await rpc(c, "session/prompt", {
      request: {
        sessionId: id,
        mode,
        requestId,
        content: [
          ...(text.trim() ? [{ type: "text", text }] : []),
          ...receipts.map((receiptId) => ({ type: "file", receiptId })),
        ],
      },
    });
    if (result?.accepted === false)
      throw new DshRefusal("DSH 拒绝了此次投递，可稍后重试。");
    if (result?.accepted !== true)
      throw Error("DSH 未确认接收，请核对主会话历史。");
  } catch (e) {
    if (e instanceof DshRefusal) await unlink(path);
    throw e;
  }
  const temp = path + "." + randomUUID();
  await writeFile(temp, JSON.stringify({ signature, accepted: true }), {
    mode: 0o600,
  });
  await rename(temp, path);
  return true;
}
