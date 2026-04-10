import { useState, useEffect, useRef, useCallback } from "react";

const MAX_HISTORY_LENGTH = 40;
const INITIAL_RETRY_DELAY = 1000;   // 1 second
const MAX_RETRY_DELAY = 30000;      // 30 seconds cap

export function useClusterData() {
  const [clusters, setClusters] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const eventSourceRef = useRef(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const retryTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!mountedRef.current) return;

    const eventSource = new EventSource("/api/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      setLoading(false);
      setError(null);
      // Reset backoff on successful connection
      retryDelayRef.current = INITIAL_RETRY_DELAY;
    };

    eventSource.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data && data.clusters) {
          const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          setClusters(data.clusters);
          
          setHistory(prev => {
            const newHistory = [...prev, { timestamp, clusters: data.clusters }];
            if (newHistory.length > MAX_HISTORY_LENGTH) {
              newHistory.shift();
            }
            return newHistory;
          });
          setError(null);
        }
      } catch (err) {
        console.error("Error parsing SSE data", err);
      }
    };

    eventSource.onerror = () => {
      if (!mountedRef.current) return;

      // Close the broken connection
      eventSource.close();
      eventSourceRef.current = null;

      const delay = retryDelayRef.current;
      const delaySec = Math.round(delay / 1000);
      setError(`Real-time connection lost. Reconnecting in ${delaySec}s...`);

      // Schedule reconnect with exponential backoff
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setError("Real-time connection lost. Reconnecting...");
          connect();
        }
      }, delay);

      // Increase delay for next attempt (exponential backoff with cap)
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return { clusters, history, loading, error };
}
