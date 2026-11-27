import type { PluginServerContext } from "@getpaseo/plugin/server";
import * as api from "./shared/api";
import {
  check,
  config,
  management,
  request,
  rpc,
  target,
} from "./server/connection";
import { readHistory } from "./server/router";
import { dispatch } from "./server/dispatch";
import { readPanel } from "./server/panel";

export default function contribute(server: PluginServerContext) {
  server.handle(api.connection, async () => {
    const c = await config();
    return { url: c.url, authenticated: !!c.cookie };
  });
  server.handle(api.verify, check);
  server.handle(api.panel, readPanel);
  server.handle(api.history, ({ before }) => readHistory(before));
  server.handle(api.send, dispatch);
  server.handle(api.cancel, async ({ instance }) => {
    const { c, id } = await target(instance);
    await rpc(c, "session/cancel", { request: { sessionId: id } });
    return true;
  });
  server.handle(api.models, async ({ instance }) => {
    const { c } = await target(instance),
      v = await management(c, "models");
    return v.groups.flatMap((g: any) =>
      g.models.map((m: any) => ({
        provider: g.id,
        model: m.id,
        label: g.name + " / " + m.name,
        efforts: m.reasoning?.efforts || [],
      })),
    );
  });
  server.handle(api.selectModel, async ({ instance, ...selection }) => {
    const { c, id } = await target(instance);
    await rpc(c, "session/selectModel", {
      request: { sessionId: id, ...selection },
    });
    return true;
  });
  server.handle(api.upload, async ({ instance, name, data }) => {
    const { c, id } = await target(instance);
    const r = await request(
      c,
      "/api/session/uploadFileBinary?" +
        new URLSearchParams({ sessionId: id, name }),
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array(Buffer.from(data, "base64")),
      },
    );
    if (!r.ok) throw Error("附件上传失败，HTTP " + r.status);
    const v = (await r.json()) as {
      ok: boolean;
      value?: { receiptId: string };
    };
    if (!v.ok || typeof v.value?.receiptId !== "string")
      throw Error("DSH 未接收附件");
    return v.value.receiptId;
  });
  return () => {};
}
