import * as React from "react";
import { Icon } from "../../components/icon/Icon";
import { Chip } from "../../components/buttons/Chip";
import { Button } from "../../components/buttons/Button";
import { Card } from "../../components/cards/Card";
import { StatusPill } from "../../components/status/StatusPill";
import { PhotoTile } from "../../components/media/PhotoTile";

const NODE = {
  milestone: { fg: "var(--clay-700)", bg: "var(--clay-tint)", icon: "badge-check" },
  progress:  { fg: "var(--neutral-ink)", bg: "var(--neutral-tint)", icon: "arrow-left-right" },
  delay:     { fg: "var(--red-600)", bg: "var(--red-tint)", icon: "triangle-alert" },
  quiet:     { fg: "var(--quiet-ink)", bg: "var(--quiet-tint)", icon: "clock" },
};

function FeedItem({ kind, last, children }) {
  const n = NODE[kind];
  return (
    <div style={{ display: "flex", gap: 14, position: "relative", paddingBottom: last ? 0 : 18 }}>
      <div style={{ width: 34, flexShrink: 0, display: "flex", justifyContent: "center", position: "relative" }}>
        {!last && <span style={{ position: "absolute", top: 8, bottom: -18, width: 2, background: "var(--border)", borderRadius: 2 }} />}
        <div style={{ width: 32, height: 32, borderRadius: "50%", position: "relative", zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: n.bg, color: n.fg, border: "2px solid var(--page-bg)" }}>
          <Icon name={n.icon} size={16} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Letter() {
  const lines = [
    { ic: "check", tone: "ontrack", lab: "Done", txt: "Roof slab finished", bold: true },
    { ic: "arrow-right", tone: "progress", lab: "Coming next", txt: "Plastering begins" },
    { ic: "hand", tone: "needsyou", lab: "Needs you", txt: "1 tile choice" },
    { ic: "triangle-alert", tone: "delay", lab: "Delays", txt: "Plastering ~5 days (rain)" },
  ];
  const tint = { ontrack: ["var(--green-tint)", "var(--green-700)"], progress: ["var(--neutral-tint)", "var(--neutral-ink)"],
    needsyou: ["var(--amber-tint)", "var(--amber-700)"], delay: ["var(--red-tint)", "var(--red-600)"] };
  return (
    <Card variant="letter">
      <div className="t-eyebrow">This week</div>
      <h2 className="t-h2" style={{ marginTop: 6 }}>2–8 June</h2>
      <div style={{ marginTop: 10 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 11, font: "var(--type-body-sm)", fontSize: 14, color: "var(--text-body)" }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: tint[l.tone][0], color: tint[l.tone][1], marginTop: 1 }}><Icon name={l.ic} size={13} /></span>
            <span><span style={{ color: "var(--text-secondary)", fontWeight: "var(--fw-semibold)" }}>{l.lab} · </span>{l.bold ? <b>{l.txt}</b> : l.txt}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Button variant="secondary" size="sm" icon="volume-2">Listen</Button>
        <Button variant="ghost" size="sm" iconRight="arrow-right" style={{ flex: 1 }}>Read full letter</Button>
      </div>
    </Card>
  );
}

/** Journey — the story of the build. Pinned letter + total, then the status spine. */
export function JourneyScreen({ onReview }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "10px 20px 14px" }}>
        <div>
          <h1 className="t-h1">Journey</h1>
          <div style={{ font: "var(--type-label)", color: "var(--text-secondary)", marginTop: 5 }}>Priya's Home · Whitefield</div>
        </div>
        <Chip selected style={{ minHeight: 36, padding: "7px 11px" }}>EN</Chip>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 18px 24px" }}>
        <Letter />

        <Card style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <div className="t-eyebrow" style={{ color: "var(--text-secondary)" }}>Changes so far</div>
            <div className="t-mono" style={{ fontSize: 24, fontWeight: 600, color: "var(--text-strong)", marginTop: 5 }}>+₹2,40,000</div>
          </div>
          <StatusPill status="ontrack" icon="circle-check">all approved by you</StatusPill>
        </Card>

        <div style={{ marginTop: 22 }}>
          <div className="t-eyebrow" style={{ color: "var(--text-secondary)", margin: "0 0 6px 50px" }}>Updates</div>

          <FeedItem kind="milestone">
            <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 13, boxShadow: "var(--shadow-card)" }}>
              <StatusPill status="milestone" size="sm" uppercase>Milestone</StatusPill>
              <h3 className="t-h3" style={{ marginTop: 6 }}>Roof slab complete</h3>
              <div style={{ font: "var(--type-label)", color: "var(--text-secondary)", marginTop: 3 }}>8 Jun · 6 photos</div>
              <div style={{ display: "flex", gap: 11, marginTop: 11, alignItems: "center" }}>
                <div style={{ width: 50 }}><PhotoTile height={50} radius="var(--radius-sm)" /></div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--type-label)", fontWeight: "var(--fw-semibold)", color: "var(--accent-text)" }}><Icon name="images" size={15} /> Show proof</span>
              </div>
            </div>
          </FeedItem>

          <FeedItem kind="progress">
            <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 13, boxShadow: "var(--shadow-card)" }}>
              <StatusPill status="progress" size="sm" uppercase>Progress</StatusPill>
              <h3 className="t-h3" style={{ marginTop: 6 }}>Curing started</h3>
              <div style={{ font: "var(--type-label)", color: "var(--text-secondary)", marginTop: 3 }}>2 days ago</div>
            </div>
          </FeedItem>

          <FeedItem kind="delay">
            <div style={{ background: "var(--red-tint)", border: "1px solid rgba(164,56,42,.24)", borderRadius: "var(--radius-lg)", padding: 13 }}>
              <StatusPill status="delay" size="sm" uppercase>Delay</StatusPill>
              <h3 className="t-h3" style={{ marginTop: 6 }}>Plastering pushed ~5 days</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                <Row k="Now expected" v="~18 Jul" />
                <Row k="Reason" v="Rain" />
                <div style={{ display: "flex", gap: 7, fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)", minWidth: 92 }}>Handover</span>
                  <StatusPill status="ontrack" size="sm" icon="circle-check">unchanged</StatusPill>
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 11, font: "var(--type-label)", fontWeight: "var(--fw-semibold)", color: "var(--red-600)" }}>Why this happened <Icon name="arrow-right" size={15} /></span>
            </div>
          </FeedItem>

          <FeedItem kind="progress">
            <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 13, boxShadow: "var(--shadow-card)" }}>
              <StatusPill status="progress" size="sm" uppercase>Change</StatusPill>
              <h3 className="t-h3" style={{ marginTop: 6 }}>Bathroom tile upgraded</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
                <span className="t-mono" style={{ fontSize: 15, fontWeight: 600 }}>+₹18,000</span>
                <StatusPill status="ontrack" size="sm" icon="circle-check">approved by you</StatusPill>
              </div>
            </div>
          </FeedItem>

          <FeedItem kind="quiet" last>
            <Card variant="quiet" elevated={false} padding="13px 14px">
              <StatusPill status="quiet" size="sm" uppercase>Quiet</StatusPill>
              <p style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 6 }}>Site quiet 3 days — curing, normal. Nothing to worry about.</p>
            </Card>
          </FeedItem>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 7, fontSize: 13 }}>
      <span style={{ color: "var(--text-secondary)", minWidth: 92 }}>{k}</span>
      <span style={{ fontWeight: "var(--fw-semibold)", color: "var(--text-strong)" }}>{v}</span>
    </div>
  );
}
