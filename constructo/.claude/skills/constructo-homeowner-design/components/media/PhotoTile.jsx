import * as React from "react";
import { Icon } from "../icon/Icon";

/**
 * PhotoTile — real photos only (never AI/3D renders). Pass a `src` taken by a
 * human. With no src it shows a labelled placeholder (for mockups/specimens),
 * never a fake render. Optional count badge ("+6") and caption overlay.
 */
export function PhotoTile({
  src, alt = "", height = 120, radius = "var(--radius-lg)", count, caption,
  rounded, onClick, style, ...rest
}) {
  const r = rounded || radius;
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative", overflow: "hidden", borderRadius: r,
        height, width: "100%", background: "var(--sand-300)",
        border: "1px solid var(--border)", cursor: onClick ? "pointer" : "default",
        ...style,
      }}
      {...rest}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div aria-label="Photo placeholder" style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 6,
          color: "var(--text-muted)",
          background: "linear-gradient(150deg, #d8cdb6, #b9a888)",
        }}>
          <Icon name="image" size={22} color="rgba(255,255,255,.92)" />
          <span style={{ font: "var(--type-label)", fontSize: 11, color: "rgba(255,255,255,.92)" }}>Real photo</span>
        </div>
      )}

      {count != null && (
        <span style={{
          position: "absolute", right: 6, bottom: 6,
          font: "var(--type-label)", fontWeight: "var(--fw-bold)", fontSize: 11, color: "#fff",
          background: "rgba(42,37,25,.5)", padding: "2px 7px", borderRadius: "var(--radius-xs)",
          backdropFilter: "blur(2px)",
        }}>{count}</span>
      )}

      {caption && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 12px 9px",
          color: "#fff", font: "var(--type-label)", fontWeight: "var(--fw-medium)",
          background: "linear-gradient(transparent, rgba(42,37,25,.6))",
        }}>{caption}</div>
      )}
    </div>
  );
}
