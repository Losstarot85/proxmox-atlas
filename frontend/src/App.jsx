import { useState, useEffect } from "react";
import { useClusterData } from "./hooks/useClusterData";
import { ClusterSection } from "./components/ClusterSection";
import { NetworkTab } from "./components/NetworkTab";
import { SettingsTab } from "./components/SettingsTab";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(15);
  const [initialSettingsLoaded, setInitialSettingsLoaded] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setPollingIntervalSeconds(data.polling_interval || 15);
        }
      } catch (err) {
        console.error("Errore fetch settings:", err);
      } finally {
        setInitialSettingsLoaded(true);
      }
    };
    fetchSettings();
  }, []);

  const { clusters, loading, error } = useClusterData(pollingIntervalSeconds * 1000);

  if (!initialSettingsLoaded) return <p className="loading">Starting System Configuration...</p>;
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
        <button
          className={`tab-button ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </nav>

      {activeTab === "dashboard" && (
        clusters.map(cluster => (
          <ClusterSection key={cluster.name} cluster={cluster} />
        ))
      )}

      {activeTab === "network" && <NetworkTab />}

      {activeTab === "settings" && (
        <SettingsTab 
          globalInterval={pollingIntervalSeconds} 
          onSaveSettings={val => setPollingIntervalSeconds(val)} 
        />
      )}
    </div>
  );
}

export default App;