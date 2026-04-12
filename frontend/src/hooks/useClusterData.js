import { useState, useEffect, useRef, useCallback } from "react";

const MAX_HISTORY_LENGTH = 40;
const INITIAL_RETRY_DELAY = 1000;   // 1 second
const MAX_RETRY_DELAY = 30000;      // 30 seconds cap

export function useClusterData() {
  const [clusters, setClusters] = useState([]);
  const [globalHistory, setGlobalHistory] = useState([]);
  const [metricsMap, setMetricsMap] = useState({});
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
          
          let tCpu = 0, mCpu = 0, tMem = 0, mMem = 0;
          const currentMetrics = {};
          
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
              currentMetrics[`NODE-${n.name}`] = { cpu: cpuP, ram: ramP, status: n.status };
            });
            c.resources?.forEach(r => {
              const isRunning = r.status === 'running';
              const r_cpuP = isRunning ? Number(((r.cpu || 0) * 100).toFixed(1)) : 0;
              const r_ramP = isRunning && r.maxmem > 0 ? Number(((r.mem || 0) / r.maxmem * 100).toFixed(1)) : 0;
              currentMetrics[`${c.name}-${r.type}-${r.vmid}`] = { cpu: r_cpuP, ram: r_ramP };
            });
          });

          setGlobalHistory(prev => {
            const cpuPercent = mCpu > 0 ? Number(((tCpu / mCpu) * 100).toFixed(1)) : 0;
            const memPercent = mMem > 0 ? Number(((tMem / mMem) * 100).toFixed(1)) : 0;
            const newHistory = [...prev, { timestamp, cpuPercent, memPercent }];
            if (newHistory.length > MAX_HISTORY_LENGTH) newHistory.shift();
            return newHistory;
          });

          setMetricsMap(prevMap => {
            const nextMap = { ...prevMap };
            Object.keys(currentMetrics).forEach(id => {
               if (!nextMap[id]) nextMap[id] = { cpu: [], ram: [], status: [] };
               const h = nextMap[id];
               const cm = currentMetrics[id];
               
               const newCpu = [...h.cpu, cm.cpu];
               const newRam = [...h.ram, cm.ram];
               const newStatus = cm.status ? [...h.status, cm.status] : h.status;
               
               if (newCpu.length > MAX_HISTORY_LENGTH) newCpu.shift();
               if (newRam.length > MAX_HISTORY_LENGTH) newRam.shift();
               if (newStatus && newStatus.length > MAX_HISTORY_LENGTH) newStatus.shift();
               
               nextMap[id] = { cpu: newCpu, ram: newRam, status: newStatus };
            });
            return nextMap;
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

  return { clusters, globalHistory, metricsMap, loading, error };
}
