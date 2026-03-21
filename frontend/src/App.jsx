import { useEffect, useState } from "react";

function App() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res = await fetch("/nodes");
        const data = await res.json();
        setNodes(data);
      } catch (err) {
        console.error("Errore fetch nodes:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNodes();
  }, []);

  if (loading) return <p>Loading nodes...</p>;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Proxmox Atlas – Nodes</h1>
      <table border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Node Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.name}>
              <td>{node.name}</td>
              <td>{node.status === "online" ? "🟢 Online" : "🔴 Offline"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;