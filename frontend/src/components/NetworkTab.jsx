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
      console.error("Fetch network error:", err);
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

  const filteredClusters = clusters.map(cluster => ({
    ...cluster,
    resources: cluster.resources.filter(r => {
      const term = search.toLowerCase();
      const matchName = r.name?.toLowerCase().includes(term);
      const matchIp = r.ips.some(ip => ip.ip.includes(term));
      return matchName || matchIp;
    })
  })).filter(cluster => search === "" || cluster.resources.length > 0);

  return (
    <div className="network-tab">
      <div className="network-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by name or IP address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={fetchNetwork}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "↻ Refresh Data"}
        </button>
      </div>

      {lastUpdate && (
        <p className="last-update" style={{ marginBottom: "2rem" }}>
          Last synchronization: {lastUpdate}
        </p>
      )}

      {loading && !clusters.length ? (
        <div className="loading-view" style={{ height: "40vh" }}>
          <div className="spinner"></div>
          <p>Retrieving network interfaces and IP addresses...</p>
        </div>
      ) : filteredClusters.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "4rem" }}>
          No network resources found matching your search.
        </div>
      ) : (
        filteredClusters.map(cluster => (
          <div key={cluster.name} className="cluster-section">
            <div className="cluster-header">
              <h2>{cluster.name}</h2>
            </div>

            <div className="table-wrapper">
              <div className="responsive-table">
                <table>
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
                        <td colSpan="5" className="empty-state">
                          No active resources found
                        </td>
                      </tr>
                    ) : (
                      cluster.resources.map(r => (
                        <tr key={`${r.type}-${r.vmid}`}>
                          <td className="mono-cell">{r.vmid}</td>
                          <td style={{ fontWeight: 500 }}>{r.name}</td>
                          <td>
                            <span className="badge" style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)"}}>
                              {r.type}
                            </span>
                          </td>
                          <td>{r.node}</td>
                          <td>
                            {!r.agent_available ? (
                              <span className="text-warning">
                                {r.type === "VM" ? "⚠️ QEMU Guest Agent not running" : "⚠️ Interface details unreachable"}
                              </span>
                            ) : r.ips.length === 0 ? (
                              <span className="text-muted">No external IPs detected</span>
                            ) : (
                              <ul className="ip-list">
                                {r.ips.map((ip, i) => (
                                  <li key={i}>
                                    <span style={{color: 'var(--text-secondary)'}}>{ip.interface}:</span> <span className="mono-cell" style={{color: 'var(--text-primary)'}}>{ip.ip}</span><span style={{color: 'var(--text-secondary)'}}>/{ip.prefix}</span>
                                  </li>
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
            </div>
          </div>
        ))
      )}
    </div>
  );
}
