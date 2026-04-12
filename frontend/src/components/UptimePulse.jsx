import React from 'react';

// Accepts an array of status strings (e.g. ["online", "online", "offline"])
export const UptimePulse = ({ historyBlocks }) => {
  const maxBlocks = 40;
  // Pad with nulls if history is shorter
  const padCount = Math.max(0, maxBlocks - (historyBlocks ? historyBlocks.length : 0));
  
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', height: '14px', marginTop: '6px' }}>
      {Array.from({ length: padCount }, (_, i) => (
        <div 
          key={`pad-${i}`} 
          style={{ 
            flex: 1, height: '100%', 
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '1px', minWidth: '2px', opacity: 0.3
          }} 
          title="No data"
        />
      ))}
      {(historyBlocks || []).map((status, i) => {
        let bgColor = "rgba(255,255,255,0.05)";
        if (status === "online") bgColor = "var(--success)";
        else if (status === "offline") bgColor = "var(--danger)";

        return (
          <div 
            key={i} 
            style={{ 
              flex: 1, height: '100%', 
              backgroundColor: bgColor,
              borderRadius: '1px', minWidth: '2px'
            }} 
            title={`Status: ${status}`}
          />
        );
      })}
    </div>
  );
};
