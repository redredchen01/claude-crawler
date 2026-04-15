import { useEffect, useRef, useState, useCallback } from "react";

export interface RealtimeEvent {
  type: "init" | "progress" | "complete" | "error" | "heartbeat";
  jobId: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface UseRealtimeOptions {
  jobId: string;
  enabled?: boolean;
  onMessage?: (event: RealtimeEvent) => void;
  onError?: (error: Error) => void;
}

export function useRealtime(options: UseRealtimeOptions) {
  const { jobId, enabled = true, onMessage, onError } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<RealtimeEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !jobId || eventSourceRef.current) return;

    try {
      const eventSource = new EventSource(
        `http://localhost:3001/api/realtime/subscribe/${jobId}`,
      );

      eventSource.addEventListener("init", (event: any) => {
        const data = JSON.parse(event.data);
        const realtimeEvent: RealtimeEvent = {
          type: "init",
          jobId,
          timestamp: new Date().toISOString(),
          data: data.data || data,
        };
        setMessages((prev) => [...prev, realtimeEvent]);
        setLastEvent(realtimeEvent);
        onMessage?.(realtimeEvent);
        setIsConnected(true);
      });

      eventSource.addEventListener("progress", (event: any) => {
        const data = JSON.parse(event.data);
        const realtimeEvent: RealtimeEvent = {
          type: "progress",
          jobId,
          timestamp: data.timestamp || new Date().toISOString(),
          data: data.data || data,
        };
        setMessages((prev) => [...prev, realtimeEvent]);
        setLastEvent(realtimeEvent);
        onMessage?.(realtimeEvent);
      });

      eventSource.addEventListener("complete", (event: any) => {
        const data = JSON.parse(event.data);
        const realtimeEvent: RealtimeEvent = {
          type: "complete",
          jobId,
          timestamp: data.timestamp || new Date().toISOString(),
          data: data.data || data,
        };
        setMessages((prev) => [...prev, realtimeEvent]);
        setLastEvent(realtimeEvent);
        onMessage?.(realtimeEvent);
        eventSource.close();
        setIsConnected(false);
      });

      eventSource.addEventListener("error", (event: any) => {
        const data = JSON.parse(event.data);
        const realtimeEvent: RealtimeEvent = {
          type: "error",
          jobId,
          timestamp: data.timestamp || new Date().toISOString(),
          data: data.data || data,
        };
        setMessages((prev) => [...prev, realtimeEvent]);
        setLastEvent(realtimeEvent);
        onMessage?.(realtimeEvent);
        eventSource.close();
        setIsConnected(false);
      });

      eventSource.onerror = (err) => {
        const error = new Error(`SSE connection error: ${err}`);
        onError?.(error);
        eventSource.close();
        setIsConnected(false);

        // Reconnect after 3 seconds
        if (reconnectTimeoutRef.current)
          clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
    }
  }, [enabled, jobId, onMessage, onError]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled && jobId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, jobId, connect, disconnect]);

  return {
    isConnected,
    messages,
    lastEvent,
    connect,
    disconnect,
  };
}
