import React from 'react';

export function UptimePulse({ historyBlocks }) {
  // Pad with empty blocks if history is less than 40
  const maxBlocks = 40;
  const blocks = [...historyBlocks];
  while (blocks.length < maxBlocks) {
    blocks.unshift({ status: "padding" });
  }
  
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', height: '14px', marginTop: '6px' }}>
      {blocks.map((b, i) => {
        let bgColor = "rgba(255,255,255,0.05)";
        if (b.status === "online") bgColor = "var(--success)";
        else if (b.status === "offline") bgColor = "var(--danger)";

        return (
          <div 
            key={i} 
            style={{ 
              flex: 1, 
              height: '100%', 
              backgroundColor: bgColor,
              borderRadius: '1px',
              minWidth: '2px',
              opacity: b.status === "padding" ? 0.3 : 1
            }} 
            title={b.status === "padding" ? "No data" : `Status: ${b.status}`}
          />
        );
      })}
    </div>
  );
}
