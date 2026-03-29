import { useState } from "react";
import { useClusterData } from "./hooks/useClusterData";
import { ClusterSection } from "./components/ClusterSection";
import { NetworkTab } from "./components/NetworkTab";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { clusters, loading, error } = useClusterData(15000);

  if (loading && clusters.length === 0) return <p className="loading">Loading Atlas...</p>;

  return (
    <div className="container">
      <header className="header">
        <h1>Proxmox Atlas</h1>
        {error && <p className="error">⚠️ {error}</p>}
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
        clusters.map(cluster => (
          <ClusterSection key={cluster.name} cluster={cluster} />
        ))
      )}

      {activeTab === "network" && <NetworkTab />}
    </div>
  );
}

export default App;