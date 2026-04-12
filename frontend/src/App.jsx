import { useState, useEffect } from "react";
import { useClusterData } from "./hooks/useClusterData";
import { ClusterSection } from "./components/ClusterSection";
import { SettingsTab } from "./components/SettingsTab";
import { AlertsTab } from "./components/AlertsTab";
import { SummaryCards } from "./components/SummaryCards";
import { TimeMachineModal } from "./components/TimeMachineModal";
import { TopologyTab } from "./components/TopologyTab";
import { WhatIfModal } from "./components/WhatIfModal";
import { exportJSON, exportCSV } from "./utils/exportData";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(15);
  const [webhooks, setWebhooks] = useState([]);
  const [initialSettingsLoaded, setInitialSettingsLoaded] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [forceCollapse, setForceCollapse] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [timeMachineTarget, setTimeMachineTarget] = useState(null);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [whatIfTarget, setWhatIfTarget] = useState(null);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("atlas-theme");
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return "light";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("atlas-theme", theme);
  }, [theme]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setPollingIntervalSeconds(data.polling_interval || 15);
          setWebhooks(data.webhooks || []);
        }
      } catch (err) {
        console.error("Fetch settings error:", err);
      } finally {
        setInitialSettingsLoaded(true);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    let active = true;
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/alerts");
        if (res.ok && active) {
          const data = await res.json();
          const unreadCount = data.alerts?.filter(a => !a.read).length || 0;
          setUnreadAlerts(unreadCount);
        }
      } catch (err) {
        console.error("Fetch alerts error:", err);
      }
    };
    fetchUnread();
    const inv = setInterval(fetchUnread, 15000);
    return () => {
      active = false;
      clearInterval(inv);
    };
  }, []);

  const { clusters, globalHistory, metricsMap, loading, error } = useClusterData();

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
          <img src="/logo.png" alt="Proxmox Atlas Logo" className="logo-icon-img" />
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
            className={`nav-item ${activeTab === "topology" ? "active" : ""}`}
            onClick={() => handleNavClick("topology")}
            title={!isExpanded ? "Topology" : ""}
          >
            <span className="nav-icon">🌍</span>
            <span className="nav-text">Topology</span>
          </button>
          <button
            className={`nav-item ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => handleNavClick("alerts")}
            title={!isExpanded ? `Alerts ${unreadAlerts > 0 ? `(${unreadAlerts})` : ''}` : ""}
            style={{ position: 'relative' }}
          >
            <span className="nav-icon">
              🚨
              {unreadAlerts > 0 && (
                <span className="badge-notification" style={{
                  position: 'absolute',
                  top: '6px',
                  left: '26px',
                  backgroundColor: 'var(--danger)',
                  color: 'white',
                  borderRadius: '50%',
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  boxShadow: '0 0 5px rgba(239, 68, 68, 0.5)',
                  animation: 'pulse 2s infinite'
                }}>
                  {unreadAlerts > 99 ? '99+' : unreadAlerts}
                </span>
              )}
            </span>
            <span className="nav-text">Alerts</span>
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
              {activeTab === 'topology' && 'Cluster Topology'}
              {activeTab === 'alerts' && 'Notification Center'}
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
            <div className="export-group">
              <button 
                className="btn btn-sm export-btn"
                onClick={() => exportJSON(clusters)}
                title="Export full snapshot as JSON"
              >
                📄 JSON
              </button>
              <button 
                className="btn btn-sm export-btn"
                onClick={() => exportCSV(clusters)}
                title="Export inventory as CSV"
              >
                📊 CSV
              </button>
            </div>
            <button 
              className="theme-toggle" 
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
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
            <SummaryCards clusters={clusters} globalHistory={globalHistory} />
            <div style={{ marginBottom: '1.5rem', display: 'flex' }}>
              <input
                type="text"
                className="search-input"
                style={{ width: '100%', maxWidth: '400px' }}
                placeholder="Search nodes, virtual machines, tags, pools..."
                value={dashboardSearch}
                onChange={e => setDashboardSearch(e.target.value)}
              />
            </div>
            {clusters.map((cluster) => (
              <ClusterSection 
                key={cluster.name} 
                cluster={cluster} 
                globalHistory={globalHistory} 
                metricsMap={metricsMap}
                searchQuery={dashboardSearch}
                onOpenTimeMachine={setTimeMachineTarget} 
              />
            ))}
          </>
        )}

        {activeTab === "topology" && (
           <TopologyTab 
             clusters={clusters} 
             onOpenTimeMachine={setTimeMachineTarget}
             onOpenWhatIf={(clusterName, nodeName) => setWhatIfTarget({ cluster: clusterName, node: nodeName })}
           />
        )}
        {activeTab === "alerts" && <AlertsTab />}

        {activeTab === "settings" && (
          <SettingsTab
            globalInterval={pollingIntervalSeconds}
            globalWebhooks={webhooks}
            onSaveSettings={(settings) => {
              if (settings.polling_interval) setPollingIntervalSeconds(settings.polling_interval);
              if (settings.webhooks !== undefined) setWebhooks(settings.webhooks);
            }}
          />
        )}
      </main>

      <TimeMachineModal 
        target={timeMachineTarget} 
        onClose={() => setTimeMachineTarget(null)} 
      />

      {whatIfTarget && (
        <WhatIfModal
          cluster={whatIfTarget.cluster}
          node={whatIfTarget.node}
          onClose={() => setWhatIfTarget(null)}
        />
      )}
    </div>
  );
}

export default App;