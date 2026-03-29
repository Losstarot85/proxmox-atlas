import { useState, useEffect } from "react";

export function useClusterData(pollingIntervalMs = 15000) {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const [nodeRes, resRes] = await Promise.all([
          fetch("/api/nodes"),
          fetch("/api/resources")
        ]);

        if (!active) return;

        const nodeData = await nodeRes.json();
        const resData = await resRes.json();

        // Facciamo il merge dei dati dei nodi e delle risorse per ogni cluster
        const merged = nodeData.clusters.map(c => {
          const resCluster = resData.clusters.find(r => r.name === c.name) || {};
          return {
            name: c.name,
            nodes: c.nodes || [],
            last_update: c.last_update,
            error: c.error || resCluster.error,
            failed_nodes: resCluster.failed_nodes || [],
            resources: resCluster.resources || []
          };
        });

        setClusters(merged);
        setError(null);
      } catch (err) {
        if (active) {
          setError("Errore di connessione al backend: " + err.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, pollingIntervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pollingIntervalMs]);

  return { clusters, loading, error };
}
