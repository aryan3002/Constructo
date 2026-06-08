import * as React from "react";
import { Icon } from "../icon/Icon";
import { StatusPill } from "../status/StatusPill";
import { Button } from "../buttons/Button";

/**
 * DecisionCard — the signature pre-briefed choice. Calm AMBER (a choice, never
 * red), a why-now line so it never feels sudden, and a single primary (green)
 * "Review" action. The CTA is green because primary actions are always green;
 * amber only signals "needs you".
 */
export function DecisionCard({
  title, whenLabel, whenIcon = "clock", reviewLabel = "Review",
  onReview, style, ...rest
}) {
  return (
    <div
      style={{
        background: "var(--amber-tint)", border: "1px solid rgba(169,122,30,.30)",
        borderRadius: "var(--radius-lg)", padding: "14px", boxShadow: "var(--shadow-card)",
        ...style,
      }}
      {...rest}
    >
      <StatusPill status="needsyou" size="sm" uppercase>Needs your choice</StatusPill>
      <h3 style={{ font: "var(--type-h3)", color: "var(--text-strong)", marginTop: 10 }}>{title}</h3>
      {whenLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5,
          font: "var(--type-label)", color: "var(--text-secondary)" }}>
          <Icon name={whenIcon} size={14} color="var(--amber-700)" />
          {whenLabel}
        </div>
      )}
      <Button fullWidth iconRight="arrow-right" onClick={onReview} style={{ marginTop: 13 }}>{reviewLabel}</Button>
    </div>
  );
}
