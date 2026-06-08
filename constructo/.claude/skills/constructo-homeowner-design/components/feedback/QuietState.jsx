import * as React from "react";
import { Icon } from "../icon/Icon";

/**
 * QuietState — the calm empty/quiet state. Success here is EARNED ABSENCE:
 * a soft sage halo, a reassuring line, and (optionally) one gentle action.
 * Never an error tone, never red, never a nudge to engage.
 */
export function QuietState({
  icon = "sun", title = "All calm", message = "Nothing needs you today.",
  action, tone = "ontrack", style, ...rest
}) {
  const haloBg = tone === "quiet"
    ? "radial-gradient(circle at 50% 42%, var(--sand-300), var(--sand-300))"
    : "radial-gradient(circle at 50% 42%, var(--green-400), var(--green-600))";
  const haloFg = tone === "quiet" ? "var(--quiet-ink)" : "#fff";
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        gap: 4, padding: "40px 28px", ...style,
      }}
      {...rest}
    >
      <div style={{
        width: 64, height: 64, borderRadius: "50%", marginBottom: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: haloBg, color: haloFg,
        boxShadow: tone === "quiet" ? "none" : "var(--glow-ontrack)",
      }}>
        <Icon name={icon} size={30} stroke={2.1} />
      </div>
      <h2 style={{ font: "var(--type-h2)", color: "var(--text-strong)" }}>{title}</h2>
      <p style={{ font: "var(--type-body)", color: "var(--text-secondary)", maxWidth: 280, textWrap: "balance" }}>{message}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
