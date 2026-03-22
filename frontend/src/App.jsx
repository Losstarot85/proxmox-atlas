import { useEffect, useState } from "react";

function App() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res = await fetch("/nodes");

        if (!res.ok) {
          throw new Error("Backend error");
        }

        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setNodes([]);
        } else {
          setNodes(data.nodes);
          setError(null);
        }

        setLastUpdate(data.last_update);

      } catch (err) {
        console.error("Errore fetch nodes:", err);
        setError("Impossibile contattare il backend");
        setNodes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNodes();

    // 🔁 polling frontend ogni 10 secondi
    const interval = setInterval(fetchNodes, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>Loading nodes...</p>;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Proxmox Atlas – Nodes</h1>

      {/* 🕒 Ultimo aggiornamento */}
      {!error && (
        <p style={{ fontSize: "12px", color: "gray" }}>
          Last update: {lastUpdate || "N/A"}
        </p>
      )}

      {/* 🔴 Errore */}
      {error && (
        <div style={{ marginBottom: "15px", color: "red" }}>
          ⚠ {error}
        </div>
      )}

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
    </div>
  );
}

export default App;