/**
 * useHashRouter — Lightweight hash-based router for Proxmox Atlas.
 *
 * Supported routes:
 *   #/dashboard                          — Dashboard tab
 *   #/topology                           — Topology tab
 *   #/alerts                             — Alerts tab
 *   #/settings                           — Settings tab
 *   #/dashboard/timemachine/NODE/pve1    — Time Machine for a node
 *   #/dashboard/timemachine/VM/100       — Time Machine for a VM
 *   #/dashboard/resource/VM/100          — Resource detail drawer
 *   #/dashboard/resource/NODE/pve1       — Resource detail drawer
 */

import { useState, useEffect, useCallback, useRef } from "react";

const VALID_TABS = ["dashboard", "topology", "alerts", "settings", "backups"];

/**
 * Parse location.hash into { tab, timeMachine, resource }.
 */
function parseHash(hash) {
  const path = hash.replace(/^#\/?/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { tab: "dashboard", timeMachine: null, resource: null };
  }

  const tab = VALID_TABS.includes(segments[0].toLowerCase()) ? segments[0].toLowerCase() : "dashboard";

  // #/tab/timemachine/TYPE/ID
  if (segments[1]?.toLowerCase() === "timemachine" && segments.length >= 4) {
    const type = segments[2].toUpperCase();
    const id = segments[3];
    return { tab, timeMachine: { id, type, name: id }, resource: null };
  }

  // #/tab/resource/TYPE/ID
  if (segments[1]?.toLowerCase() === "resource" && segments.length >= 4) {
    const type = segments[2].toUpperCase();
    const id = segments[3];
    return { tab, timeMachine: null, resource: { id, type, name: id } };
  }

  // Legacy: #/timemachine/TYPE/ID (no tab prefix)
  if (segments[0].toLowerCase() === "timemachine" && segments.length >= 3) {
    const type = segments[1].toUpperCase();
    const id = segments[2];
    return { tab: "dashboard", timeMachine: { id, type, name: id }, resource: null };
  }

  return { tab, timeMachine: null, resource: null };
}

function updateHash(newHash, internalRef) {
  if (window.location.hash !== newHash) {
    internalRef.current = true;
    window.location.hash = newHash;
  }
}

export function useHashRouter() {
  const isInternalNav = useRef(false);
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

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

  const navigate = useCallback((tab) => {
    updateHash(`#/${tab}`, isInternalNav);
    setRoute({ tab, timeMachine: null, resource: null });
  }, []);

  const navigateTimeMachine = useCallback((target) => {
    const tab = parseHash(window.location.hash).tab || "dashboard";
    updateHash(`#/${tab}/timemachine/${target.type}/${target.id}`, isInternalNav);
    setRoute({ tab, timeMachine: target, resource: null });
  }, []);

  const closeTimeMachine = useCallback(() => {
    const { tab } = parseHash(window.location.hash);
    updateHash(`#/${tab}`, isInternalNav);
    setRoute((prev) => ({ ...prev, timeMachine: null }));
  }, []);

  const navigateResource = useCallback((target) => {
    const tab = parseHash(window.location.hash).tab || "dashboard";
    updateHash(`#/${tab}/resource/${target.type}/${target.id}`, isInternalNav);
    setRoute({ tab, timeMachine: null, resource: target });
  }, []);

  const closeResource = useCallback(() => {
    const { tab } = parseHash(window.location.hash);
    updateHash(`#/${tab}`, isInternalNav);
    setRoute((prev) => ({ ...prev, resource: null }));
  }, []);

  return {
    tab: route.tab,
    timeMachine: route.timeMachine,
    resource: route.resource,
    navigate,
    navigateTimeMachine,
    closeTimeMachine,
    navigateResource,
    closeResource,
  };
}
