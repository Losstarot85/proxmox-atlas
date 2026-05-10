/**
 * useHashRouter — Lightweight hash-based router for Proxmox Atlas.
 *
 * Supported routes:
 *   #/dashboard         — Dashboard tab
 *   #/topology          — Topology tab
 *   #/alerts            — Alerts tab
 *   #/settings          — Settings tab
 *   #/timemachine/NODE/pve1   — Open Time Machine for a node
 *   #/timemachine/VM/100      — Open Time Machine for a VM
 *   #/timemachine/LXC/200     — Open Time Machine for an LXC
 *
 * The hook returns the current route state and a navigate function
 * that updates both the hash and the app state.
 */

import { useState, useEffect, useCallback, useRef } from "react";

const VALID_TABS = ["dashboard", "topology", "alerts", "settings"];

/**
 * Parse location.hash into { tab, timeMachine }.
 */
function parseHash(hash) {
  const path = hash.replace(/^#\/?/, "").toLowerCase();
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { tab: "dashboard", timeMachine: null };
  }

  // #/timemachine/TYPE/ID
  if (segments[0] === "timemachine" && segments.length >= 3) {
    const type = segments[1].toUpperCase();
    const id = segments[2];
    return {
      tab: "dashboard",
      timeMachine: { id, type, name: id },
    };
  }

  // #/dashboard, #/topology, etc.
  const tab = VALID_TABS.includes(segments[0]) ? segments[0] : "dashboard";
  return { tab, timeMachine: null };
}

/**
 * Build a hash string from state.
 */
function buildHash(tab, timeMachine) {
  if (timeMachine) {
    return `#/${tab}/timemachine/${timeMachine.type}/${timeMachine.id}`;
  }
  return `#/${tab}`;
}

export function useHashRouter() {
  const isInternalNav = useRef(false);

  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  // Listen for hash changes (back/forward or manual URL edit)
  useEffect(() => {
    function onHashChange() {
      if (isInternalNav.current) {
        isInternalNav.current = false;
        return;
      }
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Navigate to a tab (and optionally open time machine)
  const navigate = useCallback((tab, timeMachine = null) => {
    const newHash = buildHash(tab, timeMachine);
    if (window.location.hash !== newHash) {
      isInternalNav.current = true;
      window.location.hash = newHash;
    }
    setRoute({ tab, timeMachine });
  }, []);

  // Navigate to time machine for a resource
  const navigateTimeMachine = useCallback((target) => {
    const tab = parseHash(window.location.hash).tab || "dashboard";
    const newHash = `#/${tab}/timemachine/${target.type}/${target.id}`;
    if (window.location.hash !== newHash) {
      isInternalNav.current = true;
      window.location.hash = newHash;
    }
    setRoute({ tab, timeMachine: target });
  }, []);

  // Close time machine (go back to tab-only route)
  const closeTimeMachine = useCallback(() => {
    const { tab } = parseHash(window.location.hash);
    const newHash = `#/${tab}`;
    if (window.location.hash !== newHash) {
      isInternalNav.current = true;
      window.location.hash = newHash;
    }
    setRoute((prev) => ({ ...prev, timeMachine: null }));
  }, []);

  return {
    tab: route.tab,
    timeMachine: route.timeMachine,
    navigate,
    navigateTimeMachine,
    closeTimeMachine,
  };
}
