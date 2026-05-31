/**
 * RadialGauge — Shared SVG circular progress indicator.
 *
 * Features:
 * - Animated fill transition (cubic-bezier spring)
 * - Auto color gradient: green → yellow → red based on utilization
 * - Optional explicit color override
 * - Size variants: "sm" (64px), "md" (90px, default), "lg" (120px)
 * - Center label: percentage or custom value
 *
 * Used in: ResourceDetail, NodeDetail, SummaryCards
 */

import React, { useId } from "react";
import "./RadialGauge.css";

/**
 * Returns an HSL color interpolated from green (120°) → yellow (50°) → red (0°)
 * based on a 0–100 percentage value.
 */
function autoColor(pct) {
  // 0% → hue 142 (emerald green), 50% → hue 45 (amber), 100% → hue 0 (red)
  if (pct <= 50) {
    // Green to yellow: hue 142 → 45
    const hue = 142 - (pct / 50) * (142 - 45);
    return `hsl(${hue}, 80%, 50%)`;
  }
  // Yellow to red: hue 45 → 0
  const hue = 45 - ((pct - 50) / 50) * 45;
  const sat = 80 + ((pct - 50) / 50) * 10; // slightly more saturated toward red
  return `hsl(${hue}, ${sat}%, 50%)`;
}

const SIZES = {
  sm: { width: 64, radius: 26, strokeWidth: 5, valueFontSize: 11, labelFontSize: 7 },
  md: { width: 90, radius: 38, strokeWidth: 6, valueFontSize: 13, labelFontSize: 9 },
  lg: { width: 120, radius: 50, strokeWidth: 7, valueFontSize: 16, labelFontSize: 11 },
};

/**
 * @param {number}  value  - Current value (e.g. 45.2)
 * @param {number}  max    - Maximum value (e.g. 100)
 * @param {string}  label  - Bottom label (e.g. "CPU")
 * @param {string}  [color]     - Explicit stroke color. If omitted, auto-gradient is used.
 * @param {string}  [unit="%"]  - Unit suffix shown after percentage
 * @param {string}  [size="md"] - Size variant: "sm", "md", "lg"
 * @param {boolean} [showGradient=true] - Use SVG gradient fill (subtle glow effect)
 * @param {string}  [displayValue] - Custom center text (overrides auto pct)
 */
export function RadialGauge({
  value,
  max,
  label,
  color,
  unit = "%",
  size = "md",
  showGradient = true,
  displayValue,
}) {
  const gradientId = useId();
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const s = SIZES[size] || SIZES.md;
  const circumference = 2 * Math.PI * s.radius;
  const offset = circumference - (pct / 100) * circumference;

  // Resolve color
  const resolvedColor = color || autoColor(pct);

  // For gradient: slightly lighter version
  const gradientEnd = color
    ? color
    : autoColor(Math.max(0, pct - 20));

  const centerText = displayValue != null ? displayValue : `${pct.toFixed(1)}${unit}`;

  return (
    <div className={`rg-gauge rg-${size}`}>
      <svg viewBox="0 0 100 100" className="rg-gauge-svg" style={{ width: s.width, height: s.width }}>
        {/* Gradient definition */}
        {showGradient && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={resolvedColor} />
              <stop offset="100%" stopColor={gradientEnd} />
            </linearGradient>
          </defs>
        )}

        {/* Track */}
        <circle
          cx="50" cy="50" r={s.radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={s.strokeWidth}
          className="rg-track"
        />

        {/* Fill arc */}
        <circle
          cx="50" cy="50" r={s.radius}
          fill="none"
          stroke={showGradient ? `url(#${gradientId})` : resolvedColor}
          strokeWidth={s.strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className="rg-fill"
        />

        {/* Glow effect (subtle duplicate at lower opacity) */}
        <circle
          cx="50" cy="50" r={s.radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={s.strokeWidth + 4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className="rg-glow"
          opacity="0.12"
        />

        {/* Center value */}
        <text
          x="50" y={label ? 46 : 52}
          textAnchor="middle"
          dominantBaseline="central"
          className="rg-value"
          fill="var(--text-primary)"
          style={{ fontSize: `${s.valueFontSize}px` }}
        >
          {centerText}
        </text>

        {/* Label */}
        {label && (
          <text
            x="50" y="64"
            textAnchor="middle"
            dominantBaseline="central"
            className="rg-label"
            fill="var(--text-secondary)"
            style={{ fontSize: `${s.labelFontSize}px` }}
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}
