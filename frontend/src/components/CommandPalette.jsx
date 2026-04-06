import React, { useState, useEffect, useRef } from "react";

export function CommandPalette({ clusters, onSelectResult }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Flatten all searchable items
  const items = [];
  clusters.forEach((c) => {
    if (c.nodes) {
      c.nodes.forEach((n) => {
        items.push({
          id: n.name,
          type: "NODE",
          name: n.name,
          cluster: c.name,
          status: n.status,
          cpu: n.cpu,
          mem: n.mem,
          maxmem: n.maxmem,
          ip: n.ip || "",
          searchString: `${n.name} node physical ${c.name} ${n.ip || ""}`.toLowerCase()
        });
      });
    }
    if (c.resources) {
      c.resources.forEach((r) => {
        // Find IPs if network is populated in cache (which is true for network tab, 
        // but resources typically don't have IPs natively unless merged. But name/vmid is enough)
        items.push({
          id: r.vmid.toString(),
          type: r.type,
          name: r.name,
          vmid: r.vmid,
          node: r.node,
          cluster: c.name,
          status: r.status,
          cpu: r.cpu,
          mem: r.mem,
          maxmem: r.maxmem,
          ip: r.ip || "",
          searchString: `${r.vmid} ${r.name} ${r.type} ${r.node} ${c.name} ${r.ip || ""}`.toLowerCase()
        });
      });
    }
  });

  const term = query.toLowerCase().trim();
  const filtered = items.filter((it) => it.searchString.includes(term)).slice(0, 15);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    }
  };

  const handleSelect = (item) => {
    setIsOpen(false);
    onSelectResult(item);
    // Attempt scroll
    setTimeout(() => {
      const rowId = `row-${item.type}-${item.vmid || item.name}`;
      const el = document.getElementById(rowId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.backgroundColor = 'var(--accent-glow)';
        setTimeout(() => el.style.backgroundColor = '', 2000);
      }
    }, 100);
  };

  return (
    <div className="palette-overlay" onClick={() => setIsOpen(false)}>
      <div className="palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="palette-header">
          <span className="palette-icon">🔍</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search nodes, VMs, containers... (Cmd+K)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button className="palette-esc" onClick={() => setIsOpen(false)}>ESC</button>
        </div>

        {filtered.length > 0 ? (
          <div className="palette-results">
            {filtered.map((item, i) => (
              <div
                key={`${item.type}-${item.id}`}
                className={`palette-item ${i === selectedIndex ? "selected" : ""}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="palette-item-icon">
                  {item.type === "NODE" ? "🖥️" : item.type === "VM" ? "💻" : "📦"}
                </div>
                <div className="palette-item-details">
                  <span className="palette-item-name">
                    {item.vmid ? <span className="mono-cell" style={{marginRight: '6px'}}>{item.vmid}</span> : null}
                    {item.name}
                  </span>
                  <span className="palette-item-sub">
                    {item.type} in {item.cluster} {item.node ? `(${item.node})` : ''} 
                    {item.status === "online" || item.status === "running" ? 
                      <span style={{color: 'var(--success)', marginLeft: '6px', marginRight: '6px'}}>●</span> : 
                      <span style={{color: 'var(--danger)', marginLeft: '6px', marginRight: '6px'}}>●</span>}
                    {item.cpu !== undefined && (
                      <span className="mono-cell" style={{opacity: 0.8}}>CPU: {(item.cpu * 100).toFixed(0)}% | RAM: {item.maxmem ? ((item.mem / item.maxmem) * 100).toFixed(0) : 0}%</span>
                    )}
                    {item.ip && <span className="mono-cell" style={{marginLeft: '6px', opacity: 0.6}}>{item.ip}</span>}
                  </span>
                </div>
                <div className="palette-item-action">Jump ↵</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="palette-empty">No results found for "{query}"</div>
        )}
      </div>
    </div>
  );
}
