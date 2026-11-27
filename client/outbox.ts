import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TranscriptEvent } from "../shared/transcript";
import type { Delivery } from "./send-keys";

export type Outgoing = {
  id: string;
  text: string;
  files: { name: string; id: string }[];
  mode: Delivery;
  state: "sending" | "accepted" | "unconfirmed";
  error?: string;
};

// Keep in-flight receipts across panel navigation, scoped to this host and Router.
export function useOutbox(
  host: string,
  instance: string,
  events?: TranscriptEvent[],
) {
  const cache = useQueryClient();
  const key = useMemo(
    () => ["dsh-router-outbox", host, instance],
    [host, instance],
  );
  const { data: rows } = useQuery<Outgoing[]>({
    queryKey: key,
    queryFn: () => [],
    enabled: false,
    initialData: [],
  });
  const confirmed = useMemo(
    () =>
      new Set(
        events?.flatMap((e) =>
          e.kind === "user" && e.requestId ? [e.requestId] : [],
        ),
      ),
    [events],
  );
  const messages = rows.filter((m) => !confirmed.has(m.id));
  useEffect(() => {
    if (messages.length !== rows.length)
      cache.setQueryData<Outgoing[]>(key, (old) =>
        old?.filter((m) => !confirmed.has(m.id)),
      );
  }, [cache, key, confirmed, rows.length, messages.length]);
  return {
    messages,
    append(message: Outgoing) {
      cache.setQueryData<Outgoing[]>(key, (old) => [...(old || []), message]);
    },
    status(id: string, state: Outgoing["state"], error?: string) {
      // History can arrive before the send RPC returns. Never recreate a reconciled row.
      cache.setQueryData<Outgoing[]>(key, (old) =>
        old?.map((m) => (m.id === id ? { ...m, state, error } : m)),
      );
    },
  };
}
