import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { panelWatch, refresh } from "../shared/live";
import { view, type Route } from "../shared/supervision";
import { joinedRows } from "../shared/list-page";
import { useForeground, useSnapshot } from "./live";

type Page = RpcOutput<typeof view>;
function boundary(page?: Page) {
  return JSON.stringify([
    page?.data?.next_offset,
    page?.data?.items?.map((row: any) => row.key ?? row.id),
  ]);
}
type Pages = { key: string; first: Page; rest: Page[]; moved?: boolean };

export function usePanelData(
  host: string,
  instance: string | undefined,
  route: Route,
  visible: boolean,
) {
  const read = useRpc(view),
    wake = useRpc(refresh);
  const input = { ...route, instance: instance ?? "" };
  const active = visible && !!instance;
  const historic = route.page === "线程" && !!(route.before || route.around);
  const live = useSnapshot(panelWatch, input, active && !historic);
  const foreground = useForeground();
  const history = useQuery({
    queryKey: ["dsh-thread-page", host, input],
    queryFn: () => read(input),
    enabled: active && historic && foreground,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const head = historic ? history.data : live.data;
  const key = JSON.stringify([host, input]);
  const [pages, setPages] = useState<Pages>();
  const [pagingError, setError] = useState<{ key: string; message: Error }>();
  const [pending, setPending] = useState<string>();
  const request = useRef<object | undefined>(undefined);
  useLayoutEffect(() => {
    setPages(undefined);
  }, [key]);
  useLayoutEffect(() => {
    setPending(undefined);
    setError(undefined);
    return () => {
      request.current = undefined;
    };
  }, [key, active, foreground]);
  const current = useRef({ key, head, active });
  current.current = { key, head, active };
  const loaded = pages?.key === key ? pages : undefined;
  const moved =
    !!head &&
    !!loaded &&
    (loaded.moved || boundary(loaded.first) !== boundary(head));
  const first = moved ? loaded.first : head;
  const items = [first, ...(loaded?.rest ?? [])].flatMap(
    (p) => p?.data?.items ?? [],
  );
  const offset = (loaded?.rest.at(-1) ?? first)?.data?.next_offset;
  async function more() {
    if (
      !head ||
      request.current ||
      !foreground ||
      !Number.isInteger(offset) ||
      offset < 1 ||
      moved
    )
      return;
    const token = {};
    request.current = token;
    setPending(key);
    setError(undefined);
    try {
      const page = await read({ ...input, offset: offset - 1 });
      if (
        request.current !== token ||
        current.current.key !== key ||
        !current.current.head ||
        !current.current.active
      )
        return;
      const joined = joinedRows(items, page.data?.items ?? []);
      const changed =
        !joined || boundary(head) !== boundary(current.current.head);
      const rest = loaded?.rest ?? [];
      setPages({
        key,
        first: head,
        rest: changed
          ? rest
          : [...rest, { ...page, data: { ...page.data, items: joined } }],
        moved: changed,
      });
      if (changed) void wake({ domain: "panel" }).catch(() => {});
    } catch (e) {
      if (request.current === token)
        setError({ key, message: e instanceof Error ? e : Error(String(e)) });
    } finally {
      if (request.current === token) {
        request.current = undefined;
        setPending(undefined);
      }
    }
  }
  function reset() {
    request.current = undefined;
    setPending(undefined);
    setPages(undefined);
    setError(undefined);
  }
  async function retry() {
    if (pagingError?.key === key && !live.error && !moved) await more();
    else if (historic) await history.refetch();
    else {
      await live.retry(() => wake({ domain: "panel" }));
    }
  }
  const error =
    (historic ? history.error : live.error) ??
    (pagingError?.key === key ? pagingError.message : null);
  return {
    // Freeze paginated rows at their previous boundary, but keep executor controls live.
    result: head ?? first,
    items,
    error,
    retry,
    reset,
    moved,
    more:
      !moved && pending !== key && Number.isInteger(offset) ? more : undefined,
  };
}
