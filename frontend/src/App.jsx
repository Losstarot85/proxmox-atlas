import { useEffect, useState } from "react";

function App() {
  const [nodes, setNodes] = useState([]);
  const [vms, setVms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 🔹 fetch nodes
        const res = await fetch("/api/nodes");
        if (!res.ok) throw new Error("Backend error");

        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setNodes([]);
        } else {
          setNodes(data.nodes);
          setError(null);
        }

        setLastUpdate(data.last_update);

        // 🔹 fetch VMs
        const vmRes = await fetch("/api/vms");
        if (!vmRes.ok) throw new Error("Backend error");

        const vmData = await vmRes.json();
        setVms(vmData.vms || []);

      } catch (err) {
        console.error("Errore fetch:", err);
        setError("Impossibile contattare il backend");
        setNodes([]);
        setVms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // 🔁 polling ogni 10s
    const interval = setInterval(fetchData, 15000);

    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>Loading data...</p>;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Proxmox Atlas</h1>

      {/* 🕒 Last update */}
      {!error && (
        <p style={{ fontSize: "12px", color: "gray" }}>
          Last update: {lastUpdate || "N/A"}
        </p>
      )}

      {/* 🔴 Error */}
      {error && (
        <div style={{ marginBottom: "15px", color: "red" }}>
          ⚠ {error}
        </div>
      )}

      {/* 🔹 NODES */}
      <h2>Nodes</h2>
      <table border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Node Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {nodes.length === 0 ? (
            <tr>
              <td colSpan="2" style={{ textAlign: "center" }}>
                Nessun nodo disponibile
              </td>
            </tr>
          ) : (
            nodes.map((node) => (
              <tr key={node.name}>
                <td>{node.name}</td>
                <td>
                  {node.status === "online"
                    ? "🟢 Online"
                    : "🔴 Offline"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 🔹 VMS */}
      <h2 style={{ marginTop: "30px" }}>Virtual Machines</h2>
      <table border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Name</th>
            <th>VM ID</th>
            <th>Node</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {vms.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ textAlign: "center" }}>
                Nessuna VM disponibile
              </td>
            </tr>
          ) : (
            vms.map((vm) => (
              <tr key={vm.vmid}>
                <td>{vm.name}</td>
                <td>{vm.vmid}</td>
                <td>{vm.node}</td>
                <td>
                  {vm.status === "running"
                    ? "🟢 Running"
                    : "🔴 Stopped"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;