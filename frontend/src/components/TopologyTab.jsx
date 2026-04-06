import React, { useState, useRef, useEffect } from "react";

function getCpuColor(cpuRatio) {
  if (cpuRatio == null) return "var(--surface-hover)";
  const hue = Math.max(0, 120 - cpuRatio * 120);
  return `hsl(${hue}, 80%, 45%)`;
}

function TopologyNode({ nodeData, initialPosition, onOpenTimeMachine, onDragMove }) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.target.closest('.topo-vm-chip')) return;
    setIsDragging(true);
    e.target.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: position.x, initialY: position.y };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const zoomLevel = parseFloat(document.documentElement.style.getPropertyValue('--topo-scale')) || 1;
    const deltaX = (e.clientX - dragRef.current.startX) / zoomLevel;
    const deltaY = (e.clientY - dragRef.current.startY) / zoomLevel;
    const newPos = { x: dragRef.current.initialX + deltaX, y: dragRef.current.initialY + deltaY };
    setPosition(newPos);
    onDragMove(nodeData.name, newPos);
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  const isOnline = nodeData.status === "online";
  const nodeColor = isOnline ? getCpuColor(nodeData.cpu) : "var(--surface-hover)";

  return (
    <div
      className={`topo-node ${isDragging ? 'dragging' : ''} ${!isOnline ? 'offline' : ''}`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        borderColor: nodeColor,
        zIndex: isDragging ? 10 : 1
      }}
    >
      <div 
        className="topo-node-header" 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
           <span className={`status-indicator ${isOnline ? 'status-online' : 'status-offline'}`}></span>
           <strong>{nodeData.name}</strong>
        </div>
        <button 
          className="btn btn-sm" 
          onClick={(e) => { e.stopPropagation(); onOpenTimeMachine({ id: nodeData.name, type: "NODE", name: nodeData.name }); }}
          style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
        >
          CPU: {nodeData.cpu != null ? (nodeData.cpu * 100).toFixed(1) : "? "}%
        </button>
      </div>
      <div className="topo-vms-container">
        {nodeData.vms?.length > 0 ? (
          nodeData.vms.map(vm => (
            <div 
              key={vm.vmid} 
              className={`topo-vm-chip ${vm.status !== 'running' ? 'stopped' : ''}`}
              title={`${vm.name} (VMID: ${vm.vmid}) - CPU: ${vm.cpu ? (vm.cpu*100).toFixed(1) : 0}%`}
              onClick={(e) => { e.stopPropagation(); onOpenTimeMachine({ id: vm.vmid, type: "VM", name: vm.name }); }}
            >
               <div className="topo-vm-color" style={{ backgroundColor: vm.status === 'running' ? getCpuColor(vm.cpu) : "gray" }} />
               <span className="topo-vm-label">{vm.name}</span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.5rem' }}>No VMs</div>
        )}
      </div>
    </div>
  );
}

function TopologyCluster({ clusterBlock, rawCluster, onOpenTimeMachine, updateNodePosition }) {
  const [position, setPosition] = useState(clusterBlock.pos);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.topo-node')) return; // let node handle its own drag
    e.stopPropagation();
    setIsDragging(true);
    e.target.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: position.x, initialY: position.y };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const zoomLevel = parseFloat(document.documentElement.style.getPropertyValue('--topo-scale')) || 1;
    const newPos = {
      x: dragRef.current.initialX + (e.clientX - dragRef.current.startX) / zoomLevel,
      y: dragRef.current.initialY + (e.clientY - dragRef.current.startY) / zoomLevel
    };
    setPosition(newPos);
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  // Calcola le dimensioni del body per far quadrare i nodi inseriti (una stima bounding box)
  let maxX = 350;
  let maxY = 200;
  clusterBlock.nodes.forEach(n => {
    if (n.pos.x + 320 > maxX) maxX = n.pos.x + 350;
    if (n.pos.y + 400 > maxY) maxY = n.pos.y + 450;
  });

  const nodeCount = rawCluster.nodes ? rawCluster.nodes.length : 0;
  const vmCount = rawCluster.resources ? rawCluster.resources.length : 0;

  return (
    <div 
      className={`topo-cluster ${isDragging ? 'dragging' : ''}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, zIndex: isDragging ? 2 : 1 }}
    >
      <div 
        className="topo-cluster-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🏢</span>
          <strong style={{ fontSize: '1.1rem' }}>{clusterBlock.id}</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {nodeCount} Nodes | {vmCount} VMs
        </div>
      </div>
      
      <div className="topo-cluster-body" style={{ width: Math.max(350, maxX), height: Math.max(200, maxY) }}>
        {clusterBlock.nodes.map(nb => {
          const nodeData = rawCluster.nodes?.find(n => n.name === nb.id);
          if (!nodeData) return null;
          const nodeVms = rawCluster.resources?.filter(r => r.node === nb.id) || [];
          const nodeDataWithVms = { ...nodeData, vms: nodeVms };

          return (
            <TopologyNode 
              key={nb.id} 
              nodeData={nodeDataWithVms} 
              initialPosition={nb.pos} 
              onOpenTimeMachine={onOpenTimeMachine}
              onDragMove={(nodeId, newPos) => updateNodePosition(clusterBlock.id, nodeId, newPos)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function TopologyTab({ clusters, onOpenTimeMachine }) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const [clusterBlocks, setClusterBlocks] = useState([]);

  // Setup layout alla prima apertura
  useEffect(() => {
    if (clusterBlocks.length === 0 && clusters.length > 0) {
      const blocks = [];
      let cStartX = 50;
      let cStartY = 50;
      
      clusters.forEach(c => {
        const clusterBlock = { id: c.name, pos: { x: cStartX, y: cStartY }, nodes: [] };
        let nStartX = 20;
        let nStartY = 20;
        
        if (c.nodes) {
          c.nodes.forEach(n => {
             clusterBlock.nodes.push({ id: n.name, pos: { x: nStartX, y: nStartY } });
             nStartX += 340; 
             // andiamo a capo nel recinto del cluster ogni 3 nodi per rack (1000px)
             if (nStartX > 1000) {
                nStartX = 20;
                nStartY += 350;
             }
          });
        }
        blocks.push(clusterBlock);
        
        // Offset verticale per i cluster successivi (Datacenter diversi impilati o affiancati)
        // Per semplicità li impiliamo verso il basso con offset massiccio calcolato.
        const clusterHeight = (Math.ceil((c.nodes ? c.nodes.length : 1) / 3)) * 350 + 100;
        cStartY += clusterHeight + 100;
      });
      
      setClusterBlocks(blocks);
    }
  }, [clusters, clusterBlocks.length]);

  const updateNodePos = (clusterId, nodeId, newPos) => {
    // Non forza un re-render React continuo del macro canvas per non impallare le performance a 60fps.
    // TopologyNode aggiorna se stesso in React (local state), noi aggiorniamo l'array logico sotto traccia per persistenza locale.
    setClusterBlocks(prev => {
       const next = [...prev];
       const c = next.find(x => x.id === clusterId);
       if(c) {
          const n = c.nodes.find(y => y.id === nodeId);
          if (n) {
             n.pos = newPos;
          }
       }
       return next;
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    let delta = -e.deltaY * zoomSensitivity;
    setScale(prev => Math.min(Math.max(0.2, prev + delta), 3));
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('.topo-cluster')) return;
    isPanningRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e) => {
    isPanningRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--topo-scale', scale);
  }, [scale]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      <div className="topology-controls glass-card">
         <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Topology Board</span>
         <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '1rem' }}>
              Wheel: Zoom | Drag Bg: Pan | Drag Clusters: Datacenter | Drag Nodes: Rack Position
            </span>
            <button className="btn btn-sm" onClick={() => setScale(s => Math.max(0.2, s - 0.2))}>-</button>
            <span style={{ width: '40px', textAlign: 'center', fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>{(scale * 100).toFixed(0)}%</span>
            <button className="btn btn-sm" onClick={() => setScale(s => Math.min(3, s + 0.2))}>+</button>
            <button className="btn btn-sm" onClick={() => { setScale(1); setPan({x:0, y:0}); }}>Reset</button>
         </div>
      </div>

      <div className="topology-viewport" 
           onWheel={handleWheel}
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerLeave={handlePointerUp}
      >
        <div 
          className="topology-canvas"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {clusterBlocks.map(cb => {
             const rawCluster = clusters.find(c => c.name === cb.id);
             if (!rawCluster) return null;
             
             return (
               <TopologyCluster 
                 key={cb.id} 
                 clusterBlock={cb} 
                 rawCluster={rawCluster} 
                 onOpenTimeMachine={onOpenTimeMachine}
                 updateNodePosition={updateNodePos}
               />
             );
          })}
        </div>
      </div>
    </div>
  );
}
