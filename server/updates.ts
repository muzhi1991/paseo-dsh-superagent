import type { PluginServerContext } from "@getpaseo/plugin/server";
import { isDeepStrictEqual } from "node:util";
import type { SubscriptionEvent, RpcOutput } from "@getpaseo/plugin";
import * as api from "../shared/api.ts";
import { view, filters, type Route } from "../shared/supervision.ts";
import {
  routerWatch,
  panelWatch,
  instanceWatch,
  connectionWatch,
  refresh,
  type Transcript,
} from "../shared/live.ts";
import { readSupervision } from "./supervision.ts";
import { tailReader } from "./transcript.ts";
import { config, target, targetEvents } from "./connection.ts";
import { WatchPool } from "./live.ts";

export function transcriptUpdate(
  next: Transcript,
  previous?: Transcript,
): SubscriptionEvent<typeof routerWatch> {
  const full = { type: "snapshot" as const, data: next };
  if (!previous || next.instance !== previous.instance) return full;
  const base = previous.events.at(-1)?.seq ?? null;
  // The raw page boundary can precede its first visible row. A missing row inside
  // that boundary is a correction; only rows before the boundary may slide out.
  const boundary = next.older ?? -Infinity;
  const overlap = previous.events.filter((event) => event.seq >= boundary);
  if (
    base !== null &&
    (!overlap.length ||
      !isDeepStrictEqual(overlap, next.events.slice(0, overlap.length)))
  )
    return full;
  // A growing or newly discontinuous history boundary also needs an authoritative snapshot.
  if (
    next.older !== previous.older &&
    (!overlap.length ||
      next.older === undefined ||
      (previous.older !== undefined && next.older < previous.older))
  )
    return full;
  const { events, older, instance, ...meta } = next;
  const changes: Partial<typeof meta> = {};
  for (const key of Object.keys(meta) as (keyof typeof meta)[]) {
    if (isDeepStrictEqual(previous[key], meta[key])) continue;
    if (meta[key] === undefined) return full;
    Object.assign(changes, { [key]: meta[key] });
  }
  return {
    type: "append",
    instance,
    base,
    changes,
    events: events.slice(overlap.length),
  };
}

function canonicalRoute(r: Route): Route {
  switch (r.page) {
    case "触发":
    case "评估":
    case "执行": {
      const options = filters[r.page];
      const filter =
        r.filter && Object.hasOwn(options, r.filter)
          ? r.filter
          : Object.keys(options)[0];
      return {
        page: r.page,
        filter,
        ...(r.page === "评估" && r.recent ? { recent: true } : {}),
      };
    }
    case "设置":
      return { page: r.page, filter: r.filter || "source" };
    case "搜索":
      return { page: r.page, query: r.query?.trim() };
    case "线程":
    case "工单":
      return { page: r.page, id: r.id };
    default:
      return { page: r.page };
  }
}
export function registerUpdates(server: PluginServerContext) {
  const panel = new WatchPool<RpcOutput<typeof view>>();
  const router = new WatchPool<Transcript>();
  const instance = new WatchPool<string>();
  const connection = new WatchPool<RpcOutput<typeof api.connection>>();
  const pools = { panel, router, instance, connection };
  let resolvedInstance: string | undefined;
  const resolveInstance = (actual: string) => {
    if (resolvedInstance === undefined || actual === resolvedInstance) return;
    resolvedInstance = undefined;
    instance.refresh();
  };
  targetEvents.on("mismatch", resolveInstance);
  const overview = () => (signal: AbortSignal) =>
    readSupervision({ page: "概览" }, signal);
  server.handle(api.sidebarCounts, (_, ctx) => {
    let prior: api.SidebarSnapshot | undefined;
    async function send(counts: api.SidebarSnapshot) {
      if (isDeepStrictEqual(counts, prior)) return;
      prior = counts;
      await ctx.push(counts);
    }
    return panel.subscribe(
      "overview",
      overview,
      15000,
      ctx.signal,
      async (sample) => {
        const data = sample.type === "snapshot" ? sample.data.data : null;
        const parsed = api.sidebarCounts.event.safeParse(
          data && {
            running: data.executor?.running,
            needsAttention: data.person?.length,
          },
        );
        await send(parsed.success ? parsed.data : null);
      },
      () => send(null),
    );
  });
  server.handle(panelWatch, (request, ctx) => {
    const route = canonicalRoute(request);
    const isOverview = route.page === "概览";
    return panel.subscribe(
      isOverview ? "overview" : JSON.stringify([request.instance, route]),
      isOverview
        ? overview
        : () => (signal) =>
            readSupervision({ ...route, instance: request.instance }, signal),
      route.page === "设置" ? 30000 : 10000,
      ctx.signal,
      async (sample) => {
        if (
          sample.type === "snapshot" &&
          sample.data.instance !== request.instance
        ) {
          resolveInstance(sample.data.instance);
          await ctx.push({
            type: "error",
            message: "DSH 实例已切换，正在重新连接。",
          });
        } else await ctx.push(sample);
      },
    );
  });
  server.handle(routerWatch, (r, ctx) =>
    router.subscribe(
      r.instance,
      () => tailReader(r.instance),
      3500,
      ctx.signal,
      (sample, prev) =>
        ctx.push(
          sample.type === "error"
            ? sample
            : transcriptUpdate(sample.data, prev),
        ),
    ),
  );
  server.handle(instanceWatch, (_, ctx) =>
    instance.subscribe(
      "active",
      () => async (signal) => {
        const current = (await target(undefined, signal)).instance;
        if (!signal.aborted) resolvedInstance = current;
        return current;
      },
      Infinity,
      ctx.signal,
      ctx.push,
    ),
  );
  server.handle(connectionWatch, (_, ctx) =>
    connection.subscribe(
      "saved",
      () => async () => {
        const c = await config();
        return { url: c.url, authenticated: !!c.cookie };
      },
      Infinity,
      ctx.signal,
      ctx.push,
    ),
  );
  server.handle(refresh, ({ domain }) => {
    pools[domain].refresh();
    return true;
  });
  return {
    async write<T>(domain: "panel" | "router", perform: () => Promise<T>) {
      // A lost command acknowledgement can still mean DSH applied the write.
      try {
        return await perform();
      } finally {
        pools[domain].refresh();
      }
    },
    changed() {
      resolvedInstance = undefined;
      for (const pool of Object.values(pools)) pool.refresh(true);
    },
    dispose() {
      targetEvents.off("mismatch", resolveInstance);
      for (const pool of Object.values(pools)) pool.dispose();
    },
  };
}
