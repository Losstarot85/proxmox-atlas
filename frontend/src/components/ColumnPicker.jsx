import React, { useState, useEffect, useRef } from "react";
import "./ColumnPicker.css";

export function ColumnPicker({ columns, visibleColumns, onChange, presets }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleColumn = (colId) => {
    const updated = {
      ...visibleColumns,
      [colId]: !visibleColumns[colId]
    };
    onChange(updated);
  };

  const applyPreset = (presetName) => {
    const presetCols = presets[presetName];
    if (!presetCols) return;
    
    const updated = {};
    columns.forEach(col => {
      updated[col.id] = presetCols.includes(col.id);
    });
    onChange(updated);
  };

  return (
    <div className="column-picker-container" ref={dropdownRef}>
      <button 
        type="button"
        className="btn column-picker-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>Columns</span>
        <span className={`arrow ${isOpen ? 'up' : 'down'}`}>▾</span>
      </button>

      {isOpen && (
        <div className="column-picker-dropdown glass-card">
          <div className="dropdown-section presets-section">
            <span className="dropdown-label">Presets</span>
            <div className="presets-buttons">
              {Object.keys(presets).map(name => (
                <button
                  type="button"
                  key={name}
                  className="preset-btn"
                  onClick={() => applyPreset(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="dropdown-divider"></div>

          <div className="dropdown-section columns-section">
            <span className="dropdown-label">Show Columns</span>
            <div className="columns-list">
              {columns.map(col => {
                const isChecked = !!visibleColumns[col.id];
                return (
                  <label key={col.id} className="column-option">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleColumn(col.id)}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="option-label">{col.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
