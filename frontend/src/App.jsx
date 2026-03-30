import { useState, useEffect } from "react";
import { useClusterData } from "./hooks/useClusterData";
import { ClusterSection } from "./components/ClusterSection";
import { NetworkTab } from "./components/NetworkTab";
import { SettingsTab } from "./components/SettingsTab";
import { SummaryCards } from "./components/SummaryCards";
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
        console.error("Fetch settings error:", err);
      } finally {
        setInitialSettingsLoaded(true);
      }
    };
    fetchSettings();
  }, []);

  const { clusters, loading, error } = useClusterData(pollingIntervalSeconds * 1000);

  if (!initialSettingsLoaded) {
    return (
      <div className="loading-view">
        <div className="spinner"></div>
        <p>Loading Configuration...</p>
      </div>
    );
  }

  if (loading && clusters.length === 0) {
    return (
      <div className="loading-view">
        <div className="spinner"></div>
        <p>Connecting to Atlas...</p>
      </div>
    );
  }

  const activeNodes = clusters.reduce((acc, c) => acc + (c.nodes?.filter(n => n.status === "online").length || 0), 0);
  const totalNodes = clusters.reduce((acc, c) => acc + (c.nodes?.length || 0), 0);
  const runningVms = clusters.reduce((acc, c) => acc + (c.resources?.filter(r => r.type === "VM" && r.status === "running").length || 0), 0);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <h1 className="logo-title">Proxmox Atlas</h1>
          <span className="logo-subtitle">Monitoring Hub</span>
        </div>
        
        <nav className="nav-links">
          <button
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <span className="nav-icon">📊</span>
            Dashboard
          </button>
          <button
            className={`nav-item ${activeTab === "network" ? "active" : ""}`}
            onClick={() => setActiveTab("network")}
          >
            <span className="nav-icon">🌐</span>
            Network IP
          </button>
          <button
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <span className="nav-icon">⚙️</span>
            Settings
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-header">
          <div>
            <h2 className="page-title">
              {activeTab === 'dashboard' && 'Dashboard Overview'}
              {activeTab === 'network' && 'Network Intelligence'}
              {activeTab === 'settings' && 'Global Configurations'}
            </h2>
          </div>
          <div className="global-status">
            <div className="status-chip">
              Clusters <strong>{clusters.length}</strong>
            </div>
            <div className="status-chip">
              Nodes <strong>{activeNodes}/{totalNodes}</strong>
            </div>
            <div className="status-chip">
              Running VMs <strong>{runningVms}</strong>
            </div>
          </div>
        </header>

        {error && (
          <div className="global-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {activeTab === "dashboard" && (
          <>
            <SummaryCards clusters={clusters} />
            {clusters.map((cluster) => (
              <ClusterSection key={cluster.name} cluster={cluster} />
            ))}
          </>
        )}

        {activeTab === "network" && <NetworkTab />}

        {activeTab === "settings" && (
          <SettingsTab
            globalInterval={pollingIntervalSeconds}
            onSaveSettings={(val) => setPollingIntervalSeconds(val)}
          />
        )}
      </main>
    </div>
  );
}

export default App;