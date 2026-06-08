import * as React from "react";

const SIZES = { sm: 28, md: 42, lg: 56 };
const TONES = {
  clay:    { bg: "var(--clay-600)",  fg: "#fff" },
  green:   { bg: "var(--green-600)", fg: "#fff" },
  neutral: { bg: "var(--sand-300)",  fg: "var(--ink-700)" },
};

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
}

/**
 * Avatar — builder / person identity. Shows a real photo `src` if given, else
 * tidy initials on a tinted square (the builder's mark). Squircle by default;
 * pass shape="circle" for people.
 */
export function Avatar({ name = "", src, size = "md", shape = "rounded", tone = "clay", style, ...rest }) {
  const px = typeof size === "number" ? size : (SIZES[size] || SIZES.md);
  const t = TONES[tone] || TONES.clay;
  const radius = shape === "circle" ? "50%" : Math.round(px * 0.3);
  return (
    <div
      role="img" aria-label={name}
      style={{
        width: px, height: px, flexShrink: 0, borderRadius: radius, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: t.bg, color: t.fg,
        fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)",
        fontSize: Math.round(px * 0.36), letterSpacing: ".02em", ...style,
      }}
      {...rest}
    >
      {src ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(name)}
    </div>
  );
}
