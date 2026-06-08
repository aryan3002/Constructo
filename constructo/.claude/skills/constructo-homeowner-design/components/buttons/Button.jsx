import * as React from "react";
import { Icon } from "../icon/Icon";

const SIZES = {
  sm: { h: 44, px: 16, fs: 14, gap: 7, icon: 17, radius: "var(--radius-sm)" },
  md: { h: 48, px: 18, fs: 15, gap: 8, icon: 19, radius: "var(--radius-md)" },
  lg: { h: 56, px: 24, fs: 16, gap: 9, icon: 20, radius: "var(--radius-md)" },
};

const VARIANTS = {
  primary:   { bg: "var(--accent)",        fg: "#fff",                border: "transparent", press: "var(--accent-press)", hover: "var(--green-700)" },
  celebrate: { bg: "var(--secondary)",     fg: "#fff",                border: "transparent", press: "var(--clay-700)",     hover: "var(--clay-700)" },
  secondary: { bg: "var(--surface-card)",  fg: "var(--text-strong)",  border: "var(--border)", press: "var(--surface-2)",  hover: "var(--surface-2)" },
  ghost:     { bg: "transparent",          fg: "var(--accent-text)",  border: "transparent", press: "var(--accent-tint)",  hover: "var(--accent-tint)" },
};

/**
 * Button — the primary calm action. Primary = sage-green (the locked primary role).
 * Use `celebrate` (clay) only for milestone/celebration moments.
 */
export function Button({
  variant = "primary", size = "md", icon, iconRight, fullWidth = false,
  disabled = false, type = "button", onClick, children, style, ...rest
}) {
  const [pressed, setPressed] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const bg = disabled ? v.bg : pressed ? v.press : hover ? v.hover : v.bg;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => { setPressed(false); setHover(false); }}
      onPointerEnter={() => !disabled && setHover(true)}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center", justifyContent: "center", gap: s.gap,
        height: s.h, minHeight: "var(--tap-min)", padding: `0 ${s.px}px`,
        background: bg, color: v.fg,
        border: `var(--border-w) solid ${v.border}`,
        borderRadius: s.radius,
        fontFamily: "var(--font-body)", fontWeight: "var(--fw-semibold)", fontSize: s.fs,
        letterSpacing: ".005em", lineHeight: 1, whiteSpace: "nowrap",
        boxShadow: variant === "secondary" ? "var(--shadow-sm)" : "none",
        opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
        transform: pressed && !disabled ? "scale(var(--press-scale))" : "none",
        transition: "var(--tr-press), var(--tr-color)",
        ...style,
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={s.icon} stroke={2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} stroke={2} />}
    </button>
  );
}
