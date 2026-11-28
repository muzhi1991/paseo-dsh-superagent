import { transcript, eventDetail, imageAttachment } from "./shared/transcript";
import {
  readTranscript,
  readEventDetail,
  readImageAttachment,
} from "./server/transcript";
import {
  view,
  mutate,
  previewPrompts,
  promptVersions,
} from "./shared/supervision";
import { readSupervision, change } from "./server/supervision";
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
  server.handle(api.activeInstance, async () => (await target()).instance);
  server.handle(api.sidebarCounts, async () => {
    const c = await config();
    if (!c.cookie) return null;
    const overview = await management(c, "overview");
    return {
      running: overview.executor.running,
      needsAttention: overview.person.length,
    };
  });
  server.handle(view, readSupervision);
  server.handle(transcript, readTranscript);
  server.handle(eventDetail, readEventDetail);
  server.handle(imageAttachment, readImageAttachment);
  server.handle(promptVersions, async ({ instance, revision, offset }) => {
    const { c } = await target(instance);
    const params = new URLSearchParams();
    if (revision !== undefined) params.set("revision", String(revision));
    if (offset !== undefined) params.set("offset", String(offset));
    return promptVersions.output.parse(
      await management(c, "prompts?" + params),
    );
  });
  server.handle(previewPrompts, async ({ instance, config }) => {
    const { c } = await target(instance);
    const res = await request(c, "/orchestrator/api/prompts/preview", {
      method: "POST",
      headers: {
        "x-orchestrator-request": "1",
        "content-type": "application/json",
      },
      body: JSON.stringify(config),
    });
    if (!res.ok)
      throw Error(
        "提示词预览失败，请检查所选段落（HTTP " + res.status + "）。",
      );
    return previewPrompts.output.parse(await res.json());
  });
  server.handle(mutate, change);
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
  server.handle(api.upload, async ({ instance, name, data, mediaType }) => {
    const { c, id } = await target(instance);
    const r = await request(
      c,
      "/api/session/uploadFileBinary?" +
        new URLSearchParams({
          sessionId: id,
          name,
          ...(mediaType ? { mediaType } : {}),
        }),
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
      error?: { message?: string };
    };
    if (!v.ok || typeof v.value?.receiptId !== "string")
      throw Error(v.error?.message || "DSH 未接收附件");
    return v.value.receiptId;
  });
  return () => {};
}
