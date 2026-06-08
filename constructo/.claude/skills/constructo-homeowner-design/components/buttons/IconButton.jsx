import * as React from "react";
import { Icon } from "../icon/Icon";

const SIZES = {
  md: { box: 48, icon: 20, radius: "var(--radius-md)" },
  lg: { box: 56, icon: 22, radius: "var(--radius-lg)" },
};

const TONES = {
  neutral:  { bg: "var(--surface-card)", fg: "var(--text-strong)", border: "var(--border)", press: "var(--surface-2)" },
  accent:   { bg: "var(--accent-tint)",  fg: "var(--accent-text)", border: "var(--accent-tint)", press: "var(--green-tint-strong)" },
  bare:     { bg: "transparent",         fg: "var(--text-secondary)", border: "transparent", press: "var(--neutral-tint)" },
};

/**
 * IconButton — a single-icon control with a guaranteed >=48px target.
 * Use for back, mic, camera, overflow, etc. Always pass `label` for a11y.
 */
export function IconButton({ icon, label, tone = "neutral", size = "md", disabled = false, onClick, style, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const t = TONES[tone] || TONES.neutral;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: s.box, height: s.box, flexShrink: 0,
        background: pressed ? t.press : t.bg, color: t.fg,
        border: `var(--border-w) solid ${t.border}`, borderRadius: s.radius,
        opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
        transform: pressed && !disabled ? "scale(var(--press-scale))" : "none",
        transition: "var(--tr-press), var(--tr-color)",
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={s.icon} />
    </button>
  );
}
