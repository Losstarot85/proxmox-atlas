import { useState, useEffect } from "react";
import { useClusterData } from "./hooks/useClusterData";
import { ClusterSection } from "./components/ClusterSection";
import { NetworkTab } from "./components/NetworkTab";
import { SettingsTab } from "./components/SettingsTab";
import { AlertsTab } from "./components/AlertsTab";
import { SummaryCards } from "./components/SummaryCards";
import { TimeMachineModal } from "./components/TimeMachineModal";
import { CommandPalette } from "./components/CommandPalette";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(15);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [initialSettingsLoaded, setInitialSettingsLoaded] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [forceCollapse, setForceCollapse] = useState(false);
  const [timeMachineTarget, setTimeMachineTarget] = useState(null);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

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
          setWebhookUrl(data.webhook_url || "");
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

  const { clusters, history, loading, error } = useClusterData();

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

  const handleCommandPaletteSelect = (item) => {
    setActiveTab("dashboard");
    setTimeMachineTarget({ id: item.vmid || item.name, type: item.type, name: item.name });
  };

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
            className={`nav-item ${activeTab === "network" ? "active" : ""}`}
            onClick={() => handleNavClick("network")}
            title={!isExpanded ? "Network IP" : ""}
          >
            <span className="nav-icon">🌐</span>
            <span className="nav-text">Network IP</span>
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
              {activeTab === 'network' && 'Network Intelligence'}
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
            <SummaryCards clusters={clusters} history={history} />
            {clusters.map((cluster) => (
              <ClusterSection 
                key={cluster.name} 
                cluster={cluster} 
                history={history} 
                onOpenTimeMachine={setTimeMachineTarget} 
              />
            ))}
          </>
        )}

        {activeTab === "network" && <NetworkTab />}
        
        {activeTab === "alerts" && <AlertsTab />}

        {activeTab === "settings" && (
          <SettingsTab
            globalInterval={pollingIntervalSeconds}
            globalWebhook={webhookUrl}
            onSaveSettings={(settings) => {
              if (settings.polling_interval) setPollingIntervalSeconds(settings.polling_interval);
              if (settings.webhook_url !== undefined) setWebhookUrl(settings.webhook_url);
            }}
          />
        )}
      </main>

      <TimeMachineModal 
        target={timeMachineTarget} 
        onClose={() => setTimeMachineTarget(null)} 
      />
      
      <CommandPalette 
        clusters={clusters} 
        onSelectResult={handleCommandPaletteSelect} 
      />
    </div>
  );
}

export default App;