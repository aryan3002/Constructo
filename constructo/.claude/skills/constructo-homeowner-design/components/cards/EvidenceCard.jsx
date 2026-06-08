import * as React from "react";
import { Icon } from "../icon/Icon";
import { PhotoTile } from "../media/PhotoTile";
import { StatusPill } from "../status/StatusPill";

/**
 * EvidenceCard — the "show proof" card. A curated, published update backed by
 * real photos: a "Published update" tag, a real-photo thumb, plain-language
 * title + date/count, and a "Show proof" affordance. Trust through evidence.
 */
export function EvidenceCard({
  title, date, photoCount, thumbSrc, proofLabel = "Show proof",
  tagWord = "Published update", onShowProof, style, ...rest
}) {
  return (
    <div
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", overflow: "hidden",
        boxShadow: "var(--shadow-card)", ...style,
      }}
      {...rest}
    >
      <div style={{ padding: "13px 14px 14px" }}>
        <StatusPill status="ontrack" size="sm" icon="badge-check" uppercase>{tagWord}</StatusPill>
        <div style={{ display: "flex", gap: 13, marginTop: 11 }}>
          <div style={{ width: 66, flexShrink: 0 }}>
            <PhotoTile src={thumbSrc} height={66} radius="var(--radius-md)" count={photoCount ? "+" + photoCount : undefined} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{title}</h3>
            {(date || photoCount != null) && (
              <div style={{ font: "var(--type-label)", color: "var(--text-secondary)", marginTop: 3 }}>
                {[date, photoCount != null ? `${photoCount} photos` : null].filter(Boolean).join(" · ")}
              </div>
            )}
            <button type="button" onClick={onShowProof} style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9,
              font: "var(--type-label)", fontWeight: "var(--fw-semibold)", color: "var(--accent-text)",
              cursor: "pointer", minHeight: 24, whiteSpace: "nowrap",
            }}>
              <Icon name="images" size={15} /> {proofLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
