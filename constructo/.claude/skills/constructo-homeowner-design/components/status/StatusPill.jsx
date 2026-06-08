import * as React from "react";
import { Icon } from "../icon/Icon";

// status -> { fg, bg, icon, word } — the locked semantic palette.
const STATUS = {
  ontrack:   { fg: "var(--status-ontrack-fg)",   bg: "var(--status-ontrack-bg)",   icon: "circle-check",    word: "On track" },
  milestone: { fg: "var(--status-milestone-fg)", bg: "var(--status-milestone-bg)", icon: "badge-check",     word: "Milestone" },
  needsyou:  { fg: "var(--status-needsyou-fg)",  bg: "var(--status-needsyou-bg)",  icon: "hand",            word: "Needs you" },
  delay:     { fg: "var(--status-delay-fg)",     bg: "var(--status-delay-bg)",     icon: "triangle-alert",  word: "Delayed" },
  progress:  { fg: "var(--status-progress-fg)",  bg: "var(--status-progress-bg)",  icon: "arrow-left-right",word: "In progress" },
  quiet:     { fg: "var(--status-quiet-fg)",     bg: "var(--status-quiet-bg)",     icon: "clock",           word: "Quiet" },
};

const SIZES = {
  sm: { fs: 11.5, py: 5, px: 9, icon: 13, gap: 5 },
  md: { fs: 13,   py: 7, px: 12, icon: 15, gap: 7 },
};

/**
 * StatusPill — the enforcement of "status = color + icon + word" (never color alone).
 * Pick a `status`; the icon + word + calm tint come from the locked palette.
 * Override the word via children. Red appears only for `delay`.
 */
export function StatusPill({ status = "ontrack", size = "md", icon, children, uppercase = false, style, ...rest }) {
  const s = STATUS[status] || STATUS.ontrack;
  const z = SIZES[size] || SIZES.md;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: z.gap, whiteSpace: "nowrap",
        color: s.fg, background: s.bg,
        padding: `${z.py}px ${z.px}px`, borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-body)", fontWeight: "var(--fw-semibold)", fontSize: z.fs,
        letterSpacing: uppercase ? ".06em" : 0, textTransform: uppercase ? "uppercase" : "none",
        lineHeight: 1, ...style,
      }}
      {...rest}
    >
      <Icon name={icon || s.icon} size={z.icon} />
      {children || s.word}
    </span>
  );
}
