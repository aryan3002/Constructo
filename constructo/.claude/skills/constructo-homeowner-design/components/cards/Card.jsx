import * as React from "react";

const VARIANTS = {
  plain:  { bg: "var(--surface-card)",   radius: "var(--radius-xl)" },
  letter: { bg: "var(--surface-letter)", radius: "var(--radius-xl)" },  /* warm "letter" panel */
  quiet:  { bg: "transparent",           radius: "var(--radius-xl)" },  /* dashed / muted */
};

/**
 * Card — the base warm surface container. Soft hairline border, gentle lift,
 * a faint paper inset highlight. `variant="letter"` for the weekly-summary feel,
 * "quiet" for low-emphasis / empty states.
 */
export function Card({
  variant = "plain", padding = "var(--pad-card)", elevated = true,
  as: Tag = "div", onClick, children, style, ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.plain;
  const quiet = variant === "quiet";
  return (
    <Tag
      onClick={onClick}
      style={{
        background: v.bg,
        border: quiet ? "1px dashed var(--border-strong)" : "1px solid var(--border)",
        borderRadius: v.radius, padding,
        boxShadow: elevated && !quiet ? "var(--inset-paper), var(--shadow-card)" : "none",
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
