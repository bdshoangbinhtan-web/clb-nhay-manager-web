"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  REALTIME_TABLES,
  createRealtimeEventCoalescer,
  realtimeTopicsForTables,
  realtimeTopicsIntersect,
} from "@/lib/realtime/invalidation";
import type { RealtimeTopic } from "@/lib/realtime/invalidation";

const EVENT_COALESCE_MS = 400;

type Listener = {
  topics: ReadonlySet<RealtimeTopic>;
  refresh: () => void;
};

type RealtimeRegistry = {
  subscribe: (topics: readonly RealtimeTopic[], refresh: () => void) => () => void;
};

const RealtimeRegistryContext = createContext<RealtimeRegistry | null>(null);

export function GlobalRealtimeProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const listenersRef = useRef(new Map<symbol, Listener>());

  const subscribe = useCallback((topics: readonly RealtimeTopic[], refresh: () => void) => {
    const key = Symbol("realtime-listener");
    listenersRef.current.set(key, { topics: new Set(topics), refresh });
    return () => listenersRef.current.delete(key);
  }, []);

  const registry = useMemo<RealtimeRegistry>(() => ({ subscribe }), [subscribe]);

  useEffect(() => {
    let disposed = false;
    let channel: RealtimeChannel | null = supabase.channel("angel-bk-global-data-v1");

    const coalescer = createRealtimeEventCoalescer<string>(
      EVENT_COALESCE_MS,
      (tables) => {
        const changedTopics = realtimeTopicsForTables(tables);
        if (!changedTopics.size) return;

        for (const listener of listenersRef.current.values()) {
          if (!realtimeTopicsIntersect(listener.topics, changedTopics)) continue;
          try {
            listener.refresh();
          } catch (error) {
            console.error("[global-realtime] screen refresh failed", error);
          }
        }
      },
    );

    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => coalescer.push(table),
      );
    }

    channel.subscribe((status, error) => {
      if (disposed) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Supabase Realtime owns reconnect/backoff. A disconnected channel must
        // never interrupt normal reads or page usage.
        console.warn("[global-realtime] channel unavailable; normal app usage continues", {
          status,
          message: error?.message,
        });
      }
    });

    return () => {
      disposed = true;
      coalescer.dispose();
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
  }, [supabase]);

  return (
    <RealtimeRegistryContext.Provider value={registry}>
      {children}
    </RealtimeRegistryContext.Provider>
  );
}

export function useRealtimeRefresh(
  topics: readonly RealtimeTopic[],
  refresh: () => void | Promise<void>,
) {
  const registry = useContext(RealtimeRegistryContext);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const topicKey = [...new Set(topics)].sort().join("|");

  useEffect(() => {
    if (!registry || !topicKey) return;
    const normalizedTopics = topicKey.split("|") as RealtimeTopic[];
    return registry.subscribe(normalizedTopics, () => {
      try {
        const result = refreshRef.current();
        if (result instanceof Promise) {
          void result.catch((error) => {
            console.error("[global-realtime] async screen refresh failed", error);
          });
        }
      } catch (error) {
        console.error("[global-realtime] screen refresh failed", error);
      }
    });
  }, [registry, topicKey]);
}
