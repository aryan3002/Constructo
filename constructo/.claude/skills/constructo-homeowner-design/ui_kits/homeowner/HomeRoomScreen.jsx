import * as React from "react";
import { Icon } from "../../components/icon/Icon";
import { IconButton } from "../../components/buttons/IconButton";
import { Chip } from "../../components/buttons/Chip";
import { Avatar } from "../../components/media/Avatar";
import { EvidenceCard } from "../../components/cards/EvidenceCard";
import { DecisionCard } from "../../components/cards/DecisionCard";

function Bubble({ side, children }) {
  const me = side === "me";
  return (
    <div style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "84%", flexShrink: 0,
      background: me ? "var(--green-tint)" : "var(--surface-card)",
      border: `1px solid ${me ? "rgba(78,125,105,.2)" : "var(--border)"}`,
      borderRadius: me ? "var(--radius-bubble) var(--radius-bubble) 6px var(--radius-bubble)" : "var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) 6px",
      padding: "11px 14px", font: "var(--type-body)", color: "var(--text-body)" }}>
      {children}
    </div>
  );
}

/** Home Room — the curated, trust-safe builder thread (one per property). */
export function HomeRoomScreen({ onBack, onReview }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--page-bg)" }}>
      {/* header */}
      <div style={{ flexShrink: 0, padding: "8px 16px 12px", borderBottom: "1px solid var(--border)", background: "color-mix(in srgb, var(--surface-card) 90%, transparent)", backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <IconButton icon="chevron-left" label="Back" tone="bare" onClick={onBack} />
          <Avatar name="Verma Constructions" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ font: "var(--type-title)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Priya's Home · Whitefield</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 4, font: "var(--type-label)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              <Icon name="badge-check" size={13} color="var(--accent-text)" /> Verma Constructions
            </div>
          </div>
          <Chip selected style={{ minHeight: 34, padding: "6px 10px" }}>EN</Chip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11, font: "var(--type-label)", fontSize: 11.5, color: "var(--text-secondary)",
          background: "color-mix(in srgb, var(--surface-card) 70%, transparent)", border: "1px solid var(--border)", padding: "7px 11px", borderRadius: 11 }}>
          <Icon name="shield-check" size={14} color="var(--accent-text)" /> Your builder posts here · only what they send reaches you.
        </div>
      </div>

      {/* thread */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ alignSelf: "center", flexShrink: 0, font: "var(--type-label)", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", background: "var(--surface-card)", padding: "4px 12px", borderRadius: "var(--radius-pill)" }}>Sunday, 8 June</span>

        <div style={{ display: "flex", gap: 9, alignSelf: "flex-start", maxWidth: "84%", flexShrink: 0 }}>
          <Avatar name="Verma Constructions" size="sm" />
          <div>
            <Bubble side="them">Namaste Priya 🙏 This week we finished the roof slab — curing is on now.</Bubble>
            <div style={{ font: "var(--type-label)", fontSize: 10.5, color: "var(--text-secondary)", marginTop: 5 }}>9:02 AM</div>
          </div>
        </div>

        <div style={{ width: "90%", alignSelf: "flex-start", flexShrink: 0 }}>
          <EvidenceCard title="Roof slab complete" date="8 Jun" photoCount={6} onShowProof={() => {}} />
        </div>

        <div style={{ width: "90%", alignSelf: "flex-start", flexShrink: 0 }}>
          <DecisionCard title="A choice for you — bathroom tile" whenLabel="Tiling begins in ~4 days" onReview={onReview} />
        </div>

        <Bubble side="me">Looks lovely! Can we see the kitchen next?</Bubble>
        <Bubble side="me"><span style={{ color: "var(--accent-text)", fontWeight: 600 }}>@ask</span> curing matlab kya?</Bubble>

        {/* Nivaan answer */}
        <div style={{ alignSelf: "flex-start", maxWidth: "88%", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(140deg, var(--green-500), var(--green-700))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><Icon name="sparkles" size={14} /></span>
            <span style={{ font: "var(--type-label)", fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-strong)" }}>Nivaan <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>· your guide</span></span>
          </div>
          <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "6px var(--radius-bubble) var(--radius-bubble) var(--radius-bubble)", padding: "12px 14px", font: "var(--type-body)", color: "var(--text-body)" }}>
            Curing = keeping the slab wet so it sets strong — about 2 weeks for your roof, day 3 now.
            <div style={{ marginTop: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "var(--type-label)", fontSize: 11, fontWeight: 600, color: "var(--green-700)", background: "var(--green-tint)", padding: "5px 9px", borderRadius: "var(--radius-pill)" }}><Icon name="sparkles" size={12} /> from your site updates</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: 7, font: "var(--type-label)", fontSize: 11, color: "var(--text-secondary)", border: "1px dashed var(--border-strong)", padding: "5px 9px", borderRadius: "var(--radius-pill)" }}><Icon name="message-circle" size={12} /> ask your builder</span>
            </div>
          </div>
        </div>
      </div>

      {/* composer */}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", background: "color-mix(in srgb, var(--surface-card) 90%, transparent)", backdropFilter: "blur(8px)", padding: "10px 14px calc(14px + env(safe-area-inset-bottom, 10px))" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }}>
          <Chip tone="accent" icon="sparkles">Ask</Chip>
          <Chip icon="circle-help">Ask a question</Chip>
          <Chip icon="calendar-check">Request a visit</Chip>
          <Chip icon="flag">Flag</Chip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <IconButton icon="camera" label="Take a photo" tone="accent" />
          <div style={{ flex: 1, minWidth: 0, height: 48, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-card)", display: "flex", alignItems: "center", padding: "0 6px 0 15px", gap: 6 }}>
            <span style={{ flex: 1, font: "var(--type-body-sm)", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden" }}>Message Verma Constructions…</span>
            <span style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}><Icon name="mic" size={19} /></span>
          </div>
          <IconButton icon="arrow-up" label="Send" tone="accent" style={{ background: "var(--accent)", color: "#fff", border: "none" }} />
        </div>
      </div>
    </div>
  );
}
