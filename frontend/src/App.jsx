import { useEffect, useState, useRef } from "react";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [nodes, setNodes] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [failedNodes, setFailedNodes] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const nodeRes = await fetch("/api/nodes");
        const nodeData = await nodeRes.json();
        setNodes(nodeData.nodes || []);
        setLastUpdate(nodeData.last_update);

        const res = await fetch("/api/resources");
        const data = await res.json();
        setResources(data.resources || []);
        setFailedNodes(data.failed_nodes || []);
        if (data.error) setError(data.error);
      } catch (err) {
        setError("Errore di connessione al backend");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="loading">Loading Atlas...</p>;

  return (
    <div className="container">
      <header className="header">
        <h1>Proxmox Atlas</h1>
        <p className="subtitle">Ultimo aggiornamento: {lastUpdate}</p>
        {error && <p className="error">⚠️ {error}</p>}
        {failedNodes.length > 0 && (
          <p className="error">
            ⚠️ Dati parziali — nodi non raggiungibili: {failedNodes.join(", ")}
          </p>
        )}
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`tab-button ${activeTab === "network" ? "active" : ""}`}
          onClick={() => setActiveTab("network")}
        >
          Network
        </button>
      </nav>

      {activeTab === "dashboard" && (
        <>
          <section>
            <h2>Cluster Nodes</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Node Name</th>
                  <th>Status</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.name}>
                    <td>{n.name}</td>
                    <td>{n.status === "online" ? "🟢 Online" : "🔴 Offline"}</td>
                    <td>{n.type || "pve"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <ResourceSection title="Virtual Machines" typeFilter="VM" resources={resources} />
          <ResourceSection title="LXC Containers" typeFilter="LXC" resources={resources} />
        </>
      )}

      {activeTab === "network" && <NetworkTab />}
    </div>
  );
}


// Formatta l'uso della CPU in percentuale (es. 0.054 -> 5.4%)
const formatCPU = (cpu) => {
  if (cpu == null) return "0.0%";
  return (cpu * 100).toFixed(1) + "%";
};


// Formatta i Byte in Gigabyte (es. per la RAM)
const formatBytesToGB = (bytes) => {
  if (!bytes) return "0.00 GB";
  return (bytes / (1024 ** 3)).toFixed(2) + " GB";
};


// Formatta il traffico di rete (MB o GB in base alla grandezza)
const formatNetwork = (bytes) => {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 ** 2);
  if (mb > 1024) return (mb / 1024).toFixed(2) + " GB";
  return mb.toFixed(2) + " MB";
};


// Sotto-componente per le risorse aggiornato con le metriche
function ResourceSection({ title, typeFilter, resources }) {
  const filtered = resources.filter(r => r.type === typeFilter);

  return (
    <section>
      <h2>{title}</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>CPU Usage</th>
            <th>RAM Usage</th>
            <th>Net (In / Out)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan="6" className="empty-row">Nessun elemento trovato</td></tr>
          ) : (
            filtered.map(r => {
              const isRunning = r.status === "running";
              return (
                <tr key={`${r.type}-${r.vmid}`}>
                  <td>{r.vmid}</td>
                  <td>{r.name}</td>
                  <td>{isRunning ? "🟢 Running" : "🔴 Stopped"}</td>
                  <td>{isRunning ? `${formatCPU(r.cpu)} / ${r.maxcpu} Core` : "-"}</td>
                  <td>{isRunning ? `${formatBytesToGB(r.mem)} / ${formatBytesToGB(r.maxmem)}` : "-"}</td>
                  <td>{isRunning ? `⬇ ${formatNetwork(r.netin)} / ⬆ ${formatNetwork(r.netout)}` : "-"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}


// Contenuto del tab Network
function NetworkTab() {
  const [networkData, setNetworkData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [search, setSearch] = useState("");
  const hasFetched = useRef(false);

  const fetchNetwork = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/network");
      const data = await res.json();
      setNetworkData(data.network || []);
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

  const filtered = networkData.filter(r => {
    const term = search.toLowerCase();
    const matchName = r.name?.toLowerCase().includes(term);
    const matchIp = r.ips.some(ip => ip.ip.includes(term));
    return matchName || matchIp;
  });

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

      {loading && !networkData.length ? (
        <p className="network-loading">Recupero indirizzi IP in corso...</p>
      ) : (
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-row">Nessun risultato trovato</td>
              </tr>
            ) : (
              filtered.map(r => (
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
                          <li key={i}>{ip.interface}: {ip.ip}/{ip.prefix}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}


export default App;