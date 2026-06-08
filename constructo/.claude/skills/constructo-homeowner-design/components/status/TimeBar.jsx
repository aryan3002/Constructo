import * as React from "react";

/**
 * TimeBar — position in TIME, never a percentage or progress ring.
 * A segmented Start -> Handover bar with a warm "you-are-here" marker on the
 * current phase. Completed phases are sage-green; future phases are a calm track.
 */
export function TimeBar({
  phases = [],
  current = 0,
  startLabel = "Start",
  endLabel = "Handover",
  showPhase = true,
  style,
  ...rest
}) {
  const n = Math.max(phases.length, 1);
  return (
    <div style={style} {...rest}>
      <div style={{ display: "flex", gap: 5 }} role="img"
        aria-label={`Phase ${current + 1} of ${n}${phases[current] ? ": " + phases[current] : ""}`}>
        {Array.from({ length: n }).map((_, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <div key={i} style={{
              position: "relative", flex: 1, height: 8, borderRadius: 6,
              background: done || here ? "var(--green-600)" : "var(--sand-300)",
            }}>
              {here && (
                <span aria-hidden="true" style={{
                  position: "absolute", right: -4, top: -6, width: 20, height: 20, borderRadius: "50%",
                  background: "var(--clay-600)", border: "4px solid var(--surface-card)",
                  boxShadow: "var(--glow-here)",
                }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: 10,
        font: "var(--type-label)", color: "var(--text-secondary)",
      }}>
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>

      {showPhase && phases[current] && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{phases[current]}</span>
          <span style={{ font: "var(--type-label)", color: "var(--clay-700)", fontWeight: "var(--fw-semibold)" }}>you are here</span>
        </div>
      )}
    </div>
  );
}
