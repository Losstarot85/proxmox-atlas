import React, { useState, useEffect, useRef } from "react";

export function NetworkTab() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [search, setSearch] = useState("");
  const hasFetched = useRef(false);

  const fetchNetwork = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/network");
      const data = await res.json();
      setClusters(data.clusters || []);
      setLastUpdate(data.last_update);
    } catch (err) {
      console.error("Errore fetch network:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchNetwork();
    }
  }, []);

  // Filtra le risorse per ogni cluster in base al termine di ricerca
  const filteredClusters = clusters.map(cluster => ({
    ...cluster,
    resources: cluster.resources.filter(r => {
      const term = search.toLowerCase();
      const matchName = r.name?.toLowerCase().includes(term);
      const matchIp = r.ips.some(ip => ip.ip.includes(term));
      return matchName || matchIp;
    })
  })).filter(cluster =>
    search === "" || cluster.resources.length > 0
  );

  return (
    <section>
      <h2>Network</h2>

      <div className="network-toolbar">
        <input
          type="text"
          className="network-search"
          placeholder="Cerca per nome o indirizzo IP..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className="refresh-button"
          onClick={fetchNetwork}
          disabled={loading}
        >
          {loading ? "Aggiornamento..." : "↻ Refresh"}
        </button>
      </div>

      {lastUpdate && (
        <p className="subtitle" style={{ marginBottom: "16px" }}>
          Ultimo aggiornamento: {lastUpdate}
        </p>
      )}

      {loading && !clusters.length ? (
        <p className="network-loading">Recupero indirizzi IP in corso...</p>
      ) : filteredClusters.length === 0 ? (
        <p className="network-loading">Nessun risultato trovato</p>
      ) : (
        filteredClusters.map(cluster => (
          <div key={cluster.name} className="cluster-section">
            <div className="cluster-header">
              <h3>{cluster.name}</h3>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Node</th>
                  <th>IP Addresses</th>
                </tr>
              </thead>
              <tbody>
                {cluster.resources.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-row">
                      Nessuna risorsa attiva
                    </td>
                  </tr>
                ) : (
                  cluster.resources.map(r => (
                    <tr key={`${r.type}-${r.vmid}`}>
                      <td>{r.vmid}</td>
                      <td>{r.name}</td>
                      <td>{r.type}</td>
                      <td>{r.node}</td>
                      <td>
                        {!r.agent_available ? (
                          <span className="agent-unavailable">
                            {r.type === "VM" ? "⚠️ Agent non disponibile" : "⚠️ Non raggiungibile"}
                          </span>
                        ) : r.ips.length === 0 ? (
                          <span className="no-ips">Nessun IP trovato</span>
                        ) : (
                          <ul className="ip-list">
                            {r.ips.map((ip, i) => (
                              <li key={i}>{ip.interface}: <span className="mono">{ip.ip}</span>/{ip.prefix}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}
