import { useState, useEffect } from "react";

const MAX_HISTORY_LENGTH = 40;

export function useClusterData() {
  const [clusters, setClusters] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/stream");

    eventSource.onopen = () => {
      setLoading(false);
      setError(null);
    };

    eventSource.onmessage = (event) => {
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

    eventSource.onerror = (err) => {
      setError("Connessione in tempo reale persa. Riconnessione in corso...");
      // browser EventSource automatically reconnects, but let's show an error
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return { clusters, history, loading, error };
}
