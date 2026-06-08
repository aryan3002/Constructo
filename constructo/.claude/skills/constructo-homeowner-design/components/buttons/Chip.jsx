import * as React from "react";
import { Icon } from "../icon/Icon";

/**
 * Chip — a small pill for quick actions (Ask, Request a visit, Flag) and
 * lightweight toggles. `tone="accent"` highlights the AI "Ask" affordance.
 * Secondary control — sits at 38–40px; not for primary actions.
 */
export function Chip({ icon, children, tone = "neutral", selected = false, onClick, style, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  const accent = tone === "accent";
  const bg = selected
    ? (accent ? "var(--accent)" : "var(--ink-900)")
    : pressed
      ? (accent ? "var(--green-tint-strong)" : "var(--neutral-tint)")
      : (accent ? "var(--accent-tint)" : "var(--chip-bg, var(--surface-card))");
  const fg = selected ? "#fff" : accent ? "var(--accent-text)" : "var(--text-strong)";
  const border = selected ? "transparent" : accent ? "var(--accent-tint)" : "var(--border)";
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        minHeight: 40, padding: "9px 14px",
        background: bg, color: fg,
        border: `var(--border-w) solid ${border}`, borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-body)", fontWeight: "var(--fw-semibold)", fontSize: 13,
        cursor: "pointer", transform: pressed ? "scale(var(--press-scale))" : "none",
        transition: "var(--tr-press), var(--tr-color)",
        ...style,
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={15} color={accent && !selected ? "var(--accent-text)" : undefined} />}
      {children}
    </button>
  );
}
