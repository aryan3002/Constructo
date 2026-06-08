import * as React from "react";
import { Icon } from "../../components/icon/Icon";
import { IconButton } from "../../components/buttons/IconButton";
import { Chip } from "../../components/buttons/Chip";
import { Card } from "../../components/cards/Card";
import { StatusPill } from "../../components/status/StatusPill";
import { TimeBar } from "../../components/status/TimeBar";
import { EvidenceCard } from "../../components/cards/EvidenceCard";
import { DecisionCard } from "../../components/cards/DecisionCard";

const PHASES = ["Foundation", "Brickwork & walls", "Plaster", "Finishes", "Handover"];

/** Home — the "Am I okay?" screen. Answers in 3 seconds, then quiets down. */
export function HomeScreen({ onOpenThread, onReview, decided }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 16px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "16px 0 4px" }}>
        <div>
          <div style={{ font: "var(--type-label)", color: "var(--text-secondary)", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap" }}>Good morning, Priya</div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", opacity: .8, marginTop: 2 }}>Friday, 7 June</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chip selected style={{ minHeight: 36, padding: "7px 11px" }}>EN</Chip>
          <IconButton icon="message-circle" label="Open builder thread" onClick={onOpenThread} />
        </div>
      </div>

      {/* hero — the reassurance */}
      <div style={{ padding: "22px 2px 8px" }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%", marginBottom: 18,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          background: "radial-gradient(circle at 50% 42%, var(--green-400), var(--green-600))",
          boxShadow: "var(--glow-ontrack), 0 8px 16px -8px rgba(47,97,81,.55)",
        }}>
          <Icon name="check" size={25} stroke={2.4} />
        </div>
        <div className="t-eyebrow">Today</div>
        <div style={{ font: "var(--type-hero)", letterSpacing: "var(--ls-hero)", color: "var(--text-strong)", marginTop: 9 }}>You're okay.</div>
        <p style={{ font: "var(--type-body)", fontSize: 18, color: "var(--text-secondary)", marginTop: 13, maxWidth: 320 }}>
          Nothing needs you today. We'll tell you the moment it does.
        </p>
        <div style={{ marginTop: 18 }}>
          <StatusPill status="ontrack">On track · checked 1h ago</StatusPill>
        </div>
      </div>

      {/* time-bar */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="t-eyebrow" style={{ color: "var(--text-secondary)" }}>Start → Handover</span>
          <span className="t-mono" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Mar – Dec</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <TimeBar phases={PHASES} current={1} startLabel="Start · Mar" endLabel="Handover · Dec" />
        </div>
      </Card>

      {/* decision or its confirmation */}
      {decided ? (
        <Card style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <StatusPill status="ontrack" icon="circle-check">Chosen</StatusPill>
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>
            You chose <b>{decided}</b> tile. Reversible for ~4 days.
          </span>
        </Card>
      ) : (
        <div style={{ marginTop: 16 }}>
          <DecisionCard title="A choice for you — bathroom tile" whenLabel="Tiling begins in ~4 days" onReview={onReview} />
        </div>
      )}

      {/* latest update */}
      <div style={{ marginTop: 16 }}>
        <EvidenceCard title="Roof slab complete" date="2 days ago" photoCount={6} onShowProof={() => {}} />
      </div>
    </div>
  );
}
