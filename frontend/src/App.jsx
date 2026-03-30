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
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [forceCollapse, setForceCollapse] = useState(false);

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

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    setForceCollapse(true);
    setIsSidebarHovered(false);
  };

  const isExpanded = isSidebarHovered && !forceCollapse;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside 
        className={`sidebar ${isExpanded ? 'expanded' : ''}`}
        onMouseEnter={() => { setIsSidebarHovered(true); setForceCollapse(false); }}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className="logo-container">
          <div className="logo-icon">💠</div>
          <div className="logo-text-group">
            <h1 className="logo-title">Proxmox Atlas</h1>
            <span className="logo-subtitle">Monitoring Hub</span>
          </div>
        </div>
        
        <nav className="nav-links">
          <button
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => handleNavClick("dashboard")}
            title={!isExpanded ? "Dashboard" : ""}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">Dashboard</span>
          </button>
          <button
            className={`nav-item ${activeTab === "network" ? "active" : ""}`}
            onClick={() => handleNavClick("network")}
            title={!isExpanded ? "Network IP" : ""}
          >
            <span className="nav-icon">🌐</span>
            <span className="nav-text">Network IP</span>
          </button>
          <button
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => handleNavClick("settings")}
            title={!isExpanded ? "Settings" : ""}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Settings</span>
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