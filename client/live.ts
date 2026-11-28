import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, Platform } from "react-native";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginSubscriptionContract } from "@getpaseo/plugin";
import type { z } from "zod";
import { listenWhileVisible } from "./subscription";

export const LiveClient = createContext<PluginClientContext | null>(null);
type Visibility = {
  hidden: boolean;
  addEventListener(name: string, fn: () => void): void;
  removeEventListener(name: string, fn: () => void): void;
};
const doc =
  Platform.OS === "web"
    ? (globalThis as { document?: Visibility }).document
    : undefined;
function foreground() {
  return doc
    ? !doc.hidden
    : !AppState?.currentState || AppState.currentState === "active";
}
function observe(change: () => void) {
  if (doc) {
    doc.addEventListener("visibilitychange", change);
    return () => doc.removeEventListener("visibilitychange", change);
  }
  const listener = AppState?.addEventListener("change", change);
  return () => listener?.remove();
}
export function useForeground() {
  return useSyncExternalStore(observe, foreground, foreground);
}

type Wire<I extends z.ZodType> =
  z.input<I> extends Uint8Array ? Uint8Array : z.input<I>;
type Frame<T> =
  | { type: "snapshot"; data: T }
  | { type: "error"; message: string };
type Current<T> = {
  key: string;
  data?: T;
  error: Error | null;
  disconnected?: boolean;
};
export function useStream<I extends z.ZodType, E extends z.ZodType, T>(
  contract: PluginSubscriptionContract<I, E>,
  input: Wire<I>,
  enabled: boolean,
  reduce: (previous: NoInfer<T> | undefined, event: z.output<E>) => T,
) {
  const client = useContext(LiveClient);

  const key = JSON.stringify([contract.name, input]);
  const [state, set] = useState<Current<T>>({ key, error: null });
  const [attempt, retry] = useState(0);
  const latest = useRef({ input, reduce });
  latest.current = { input, reduce };
  const value = useRef<Current<T>>({ key, error: null });
  function update(fn: (previous: T | undefined) => T | undefined) {
    if (value.current.key !== key) return;
    value.current = { ...value.current, data: fn(value.current.data) };
    set(value.current);
  }
  useLayoutEffect(() => {
    if (value.current.key !== key) {
      value.current = { key, error: null };
      set(value.current);
    }
    if (!client || !enabled) return;
    function error(e: unknown, disconnected = false) {
      value.current = {
        ...value.current,
        disconnected,
        error: e instanceof Error ? e : new Error(String(e)),
      };
      set(value.current);
    }
    return listenWhileVisible<z.output<E>>(
      (receive, closed) =>
        client.subscribe(contract, latest.current.input, receive, {
          onClosed: (result) =>
            closed(result.error ?? "订阅已断开，正在重新连接。"),
        }),
      (event) => {
        if (
          event &&
          typeof event === "object" &&
          "type" in event &&
          event.type === "error" &&
          "message" in event
        ) {
          error(event.message);
          return;
        }
        value.current = {
          key,
          data: latest.current.reduce(value.current.data, event),
          error: null,
        };
        set(value.current);
      },
      (e) => error(e, true),
      foreground,
      observe,
    );
  }, [client, key, enabled, attempt, contract]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : null,
    async retry(refresh: () => Promise<unknown>) {
      if (value.current.disconnected) retry((n) => n + 1);
      else await refresh();
    },
    update,
  };
}

export function useSnapshot<
  I extends z.ZodType,
  E extends z.ZodType<Frame<unknown>>,
>(contract: PluginSubscriptionContract<I, E>, input: Wire<I>, enabled = true) {
  type Data = Extract<z.output<E>, { type: "snapshot" }>["data"];
  return useStream<I, E, Data>(contract, input, enabled, (_prev, event) => {
    if (event.type === "error") throw Error(event.message);
    return event.data as Data;
  });
}
