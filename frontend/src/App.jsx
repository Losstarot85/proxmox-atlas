import { useEffect, useState } from "react";

function App() {
  const [nodes, setNodes] = useState([]);
  const [resources, setResources] = useState([]); // Stato unico per VM e LXC
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Nodi
        const nodeRes = await fetch("/api/nodes");
        const nodeData = await nodeRes.json();
        setNodes(nodeData.nodes || []);
        setLastUpdate(nodeData.last_update);

        // Fetch Risorse (VM + LXC)
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

  // Helper per renderizzare una tabella risorse filtrata
  const ResourceTable = ({ title, typeFilter }) => {
    const filtered = resources.filter(r => r.type === typeFilter);
    
    return (
      <div style={{ marginTop: "20px" }}>
        <h3>{title}</h3>
        <table border="1" cellPadding="8" style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Node</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="4">Nessun elemento</td></tr>
            ) : (
              filtered.map(r => (
                <tr key={`${r.type}-${r.vmid}`}>
                  <td>{r.vmid}</td>
                  <td>{r.name}</td>
                  <td>{r.node}</td>
                  <td>{r.status === "running" ? "🟢 Online" : "🔴 Offline"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) return <p>Loading Atlas...</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "auto" }}>
      <h1>Proxmox Atlas</h1>
      <p style={{ color: "gray" }}>Ultimo aggiornamento: {lastUpdate}</p>

      {/* Sezione Nodi */}
      <h2>Cluster Nodes</h2>
      <ul>
        {nodes.map(n => (
          <li key={n.name}>{n.name} - <strong>{n.status}</strong></li>
        ))}
      </ul>

      {/* Tabelle Risorse unificate ma visualizzate separatamente */}
      <ResourceTable title="Virtual Machines" typeFilter="VM" />
      <ResourceTable title="LXC Containers" typeFilter="LXC" />
    </div>
  );
}

export default App;