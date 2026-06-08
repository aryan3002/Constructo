import * as React from "react";
import { Icon } from "../icon/Icon";

/**
 * BottomNav — the calm shell. Icon + label, never icon-only. Active item is
 * sage-green with a slightly heavier icon; every target is >=48px.
 */
export function BottomNav({ items = [], active, onChange, style, ...rest }) {
  return (
    <nav
      style={{
        display: "flex", justifyContent: "space-around", alignItems: "stretch",
        padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 14px))",
        background: "color-mix(in srgb, var(--surface-card) 88%, transparent)",
        borderTop: "1px solid var(--border)", backdropFilter: "blur(10px)",
        boxShadow: "var(--shadow-nav)", ...style,
      }}
      {...rest}
    >
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            aria-label={it.label}
            aria-current={on ? "page" : undefined}
            onClick={() => onChange && onChange(it.key)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              flex: 1, minHeight: "var(--tap-min)", padding: "4px 6px",
              color: on ? "var(--accent-text)" : "var(--text-secondary)",
              font: "var(--type-label)", fontSize: 11, fontWeight: on ? "var(--fw-semibold)" : "var(--fw-medium)",
              cursor: "pointer", transition: "color var(--dur) var(--ease-calm)",
            }}
          >
            <Icon name={it.icon} size={24} stroke={on ? 2.2 : 1.85} />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
