import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../config";

const MAX_HISTORY_LENGTH = 40;
const INITIAL_RETRY_DELAY = 1000;   // 1 second
const MAX_RETRY_DELAY = 30000;      // 30 seconds cap

export function useClusterData(token) {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Simple tick counter to force re-renders when data changes
  const [, setTick] = useState(0);

  // Mutable refs — no cloning, no GC pressure
  const metricsMapRef = useRef({});
  const globalHistoryRef = useRef([]);

  const eventSourceRef = useRef(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const retryTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const connectRef = useRef(null);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!mountedRef.current || !token) return;

    // Pre-flight: validate token before opening EventSource
    // Use a lightweight GET to an authenticated endpoint — NOT /stream
    fetch(`${API_BASE}/settings`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }).then(res => {
      if (!mountedRef.current) return;

      if (!res.ok) {
        // 401 is handled by the global fetch interceptor (auto-logout)
        // Any other error → skip EventSource, schedule retry
        if (res.status !== 401) {
          throw new Error(`Preflight failed: ${res.status}`);
        }
        return;
      }

      const eventSource = new EventSource(`${API_BASE}/stream?token=${encodeURIComponent(token)}`);
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
            
            let tCpu = 0, mCpu = 0, tMem = 0, mMem = 0;
            
            data.clusters.forEach(c => {
              c.nodes?.forEach(n => {
                if (n.status === 'online') {
                    tCpu += (n.cpu || 0) * n.maxcpu;
                    mCpu += n.maxcpu;
                    tMem += (n.mem || 0);
                    mMem += (n.maxmem || 0);
                }
                const cpuP = n.status === "online" && n.maxcpu > 0 ? Number(((n.cpu || 0) * 100).toFixed(1)) : 0;
                const ramP = n.status === "online" && n.maxmem > 0 ? Number(((n.mem || 0) / n.maxmem * 100).toFixed(1)) : 0;
                
                // Mutate in-place — zero allocations
                const key = `NODE-${n.name}`;
                if (!metricsMapRef.current[key]) metricsMapRef.current[key] = { cpu: [], ram: [], status: [] };
                const h = metricsMapRef.current[key];
                h.cpu.push(cpuP);
                h.ram.push(ramP);
                h.status.push(n.status);
                if (h.cpu.length > MAX_HISTORY_LENGTH) h.cpu.shift();
                if (h.ram.length > MAX_HISTORY_LENGTH) h.ram.shift();
                if (h.status.length > MAX_HISTORY_LENGTH) h.status.shift();
              });
            c.resources?.forEach(r => {
              const isRunning = r.status === 'running';
              const r_cpuP = isRunning ? Number(((r.cpu || 0) * 100).toFixed(1)) : 0;
              const r_ramP = isRunning && r.maxmem > 0 ? Number(((r.mem || 0) / r.maxmem * 100).toFixed(1)) : 0;
              
              const key = `${c.name}-${r.type}-${r.vmid}`;
              if (!metricsMapRef.current[key]) metricsMapRef.current[key] = { cpu: [], ram: [] };
              const h = metricsMapRef.current[key];
              h.cpu.push(r_cpuP);
              h.ram.push(r_ramP);
              if (h.cpu.length > MAX_HISTORY_LENGTH) h.cpu.shift();
              if (h.ram.length > MAX_HISTORY_LENGTH) h.ram.shift();
            });
          });

          // Mutate globalHistory in-place
          const cpuPercent = mCpu > 0 ? Number(((tCpu / mCpu) * 100).toFixed(1)) : 0;
          const memPercent = mMem > 0 ? Number(((tMem / mMem) * 100).toFixed(1)) : 0;
          globalHistoryRef.current.push({ timestamp, cpuPercent, memPercent });
          if (globalHistoryRef.current.length > MAX_HISTORY_LENGTH) globalHistoryRef.current.shift();

          // Bump tick to trigger re-render in consuming components
          setTick(t => t + 1);
          
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
            connectRef.current();
          }
        }, delay);

        // Increase delay for next attempt (exponential backoff with cap)
        retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY);
      };
    }).catch(() => {
      // Network error on pre-flight — schedule retry
      if (!mountedRef.current) return;
      const delay = retryDelayRef.current;
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current();
      }, delay);
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY);
    });
  }, [token]);

  useEffect(() => {
    connectRef.current = connect;
    mountedRef.current = true;

    // Close SSE BEFORE the browser forcefully interrupts it on F5/navigation
    // This prevents onerror from firing state updates during page teardown
    const handleBeforeUnload = () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    connect();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect, token]);

  return { clusters, globalHistory: globalHistoryRef.current, metricsMap: metricsMapRef.current, loading, error, reconnect: connect };
}
