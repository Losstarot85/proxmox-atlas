import { useEffect, useState } from "react";

function App() {
  const [nodes, setNodes] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

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

  // Helper per lo stile comune delle tabelle 
  const tableStyle = { width: "100%", borderCollapse: "collapse", textAlign: "left", marginBottom: "30px" };
  const thTdStyle = { padding: "12px", borderBottom: "1px solid #ddd" };

  if (loading) return <p style={{ textAlign: "center", marginTop: "50px" }}>Loading Atlas...</p>;

  return (
    /* margin: "0 auto" centra solo orizzontalmente. padding-top aggiunge respiro in alto */
    <div style={{ padding: "40px 20px", maxWidth: "1000px", margin: "0 auto" }}>
      <header style={{ marginBottom: "40px", borderBottom: "2px solid #eee", paddingBottom: "20px" }}>
        <h1 style={{ margin: 0 }}>Proxmox Atlas</h1>
        <p style={{ color: "gray", margin: "5px 0 0 0" }}>Ultimo aggiornamento: {lastUpdate}</p>
        {error && <p style={{ color: "red" }}>⚠️ {error}</p>}
      </header>

      {/* 🔹 SEZIONE NODI (Ora come tabella) */}
      <section>
        <h2>Cluster Nodes</h2>
        <table style={tableStyle}>
          <thead>
            <tr style={{ backgroundColor: "#f8f9fa" }}>
              <th style={thTdStyle}>Node Name</th>
              <th style={thTdStyle}>Status</th>
              <th style={thTdStyle}>Type</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.name}>
                <td style={thTdStyle}>{n.name}</td>
                <td style={thTdStyle}>{n.status === "online" ? "🟢 Online" : "🔴 Offline"}</td>
                <td style={thTdStyle}>{n.type || "pve"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 🔹 SEZIONE VM */}
      <ResourceSection title="Virtual Machines" typeFilter="VM" resources={resources} styleConfig={{tableStyle, thTdStyle}} />

      {/* 🔹 SEZIONE LXC */}
      <ResourceSection title="LXC Containers" typeFilter="LXC" resources={resources} styleConfig={{tableStyle, thTdStyle}} />
    </div>
  );
}

// Sotto-componente per le risorse per mantenere il codice pulito 
function ResourceSection({ title, typeFilter, resources, styleConfig }) {
  const { tableStyle, thTdStyle } = styleConfig;
  const filtered = resources.filter(r => r.type === typeFilter);

  return (
    <section>
      <h2>{title}</h2>
      <table style={tableStyle}>
        <thead>
          <tr style={{ backgroundColor: "#f8f9fa" }}>
            <th style={thTdStyle}>ID</th>
            <th style={thTdStyle}>Name</th>
            <th style={thTdStyle}>Node</th>
            <th style={thTdStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan="4" style={{...thTdStyle, textAlign: "center"}}>Nessun elemento trovato</td></tr>
          ) : (
            filtered.map(r => (
              <tr key={`${r.type}-${r.vmid}`}>
                <td style={thTdStyle}>{r.vmid}</td>
                <td style={thTdStyle}>{r.name}</td>
                <td style={thTdStyle}>{r.node}</td>
                <td style={thTdStyle}>{r.status === "running" ? "🟢 Running" : "🔴 Stopped"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export default App;