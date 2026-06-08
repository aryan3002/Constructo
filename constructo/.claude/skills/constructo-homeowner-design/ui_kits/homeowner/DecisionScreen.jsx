import * as React from "react";
import { Icon } from "../../components/icon/Icon";
import { IconButton } from "../../components/buttons/IconButton";
import { Button } from "../../components/buttons/Button";
import { StatusPill } from "../../components/status/StatusPill";
import { PhotoTile } from "../../components/media/PhotoTile";

function Option({ tile, title, meaning, price, free, taste, onChoose }) {
  return (
    <div style={{ position: "relative", background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: 11, display: "flex", flexDirection: "column", boxShadow: "var(--shadow-card)" }}>
      {taste && (
        <span style={{ position: "absolute", top: 18, left: 18, zIndex: 2, display: "inline-flex", alignItems: "center", gap: 5,
          background: "var(--green-600)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: "var(--radius-pill)", boxShadow: "var(--shadow-raise)", whiteSpace: "nowrap" }}>
          <Icon name="heart" size={12} /> Matches your taste
        </span>
      )}
      <PhotoTile height={118} radius="var(--radius-md)" />
      <h3 className="t-h3" style={{ marginTop: 11 }}>{title}</h3>
      <p style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 5, minHeight: 50 }}>{meaning}</p>
      <div className="t-mono" style={{ fontSize: 16, fontWeight: 600, color: free ? "var(--green-700)" : "var(--text-strong)", marginTop: 2 }}>{price}</div>
      <Button fullWidth onClick={onChoose} style={{ marginTop: 11 }}>{title.startsWith("Matte") ? "Choose Matte" : "Choose Glossy"}</Button>
    </div>
  );
}

/** Decision — one pre-briefed choice. Amber "needs you", equal-weight options, reversible. */
export function DecisionScreen({ onBack, onChoose }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--page-bg)", padding: "0 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0 6px" }}>
        <IconButton icon="arrow-left" label="Back" onClick={onBack} />
        <span style={{ font: "var(--type-label)", fontWeight: "var(--fw-semibold)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>A decision for you · 1 of 1</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <StatusPill status="needsyou">Needs your choice</StatusPill>
      </div>
      <h2 style={{ font: "var(--type-h2)", color: "var(--text-strong)", marginTop: 16, lineHeight: 1.25 }}>
        Tiling starts in <span style={{ color: "var(--clay-700)" }}>~4 days</span>, so we need your tile pick before then.
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginTop: 22 }}>
        <Option title="Matte anti-slip" meaning="Safer when wet, softer look." price="+₹0" free taste onChoose={() => onChoose("Matte")} />
        <Option title="Glossy" meaning="Shinier, but shows water spots." price="+₹6,000" onChoose={() => onChoose("Glossy")} />
      </div>

      <Button variant="secondary" fullWidth icon="message-circle" style={{ marginTop: 13 }} onClick={onBack}>Ask first</Button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: "auto", padding: "18px 0 26px",
        font: "var(--type-label)", fontWeight: "var(--fw-semibold)", color: "var(--green-700)" }}>
        <Icon name="circle-check" size={16} /> Reversible until tiling begins (~4 days)
      </div>
    </div>
  );
}
