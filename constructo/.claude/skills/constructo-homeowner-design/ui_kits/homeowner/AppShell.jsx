import * as React from "react";
import { Icon } from "../../components/icon/Icon";
import { IconButton } from "../../components/buttons/IconButton";
import { BottomNav } from "../../components/navigation/BottomNav";
import { QuietState } from "../../components/feedback/QuietState";
import { HomeScreen } from "./HomeScreen";
import { JourneyScreen } from "./JourneyScreen";
import { DecisionScreen } from "./DecisionScreen";
import { HomeRoomScreen } from "./HomeRoomScreen";

function StatusBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 26px 0", fontSize: 14, fontWeight: 600, color: "var(--text-strong)",
      fontFamily: "var(--font-body)", flexShrink: 0 }}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Icon name="signal-high" size={16} /><Icon name="wifi" size={16} /><Icon name="battery-full" size={16} />
      </span>
    </div>
  );
}

const NAV = [
  { key: "home", icon: "house", label: "Home" },
  { key: "journey", icon: "route", label: "Journey" },
  { key: "photos", icon: "images", label: "Photos" },
  { key: "money", icon: "wallet", label: "Money" },
];

/**
 * AppShell — the calm phone shell for the Constructo homeowner app.
 * Holds the status bar, the active tab screen, the bottom nav, and the pushed
 * overlays (Home Room thread, Decision flow). A self-contained interactive demo.
 */
export function AppShell() {
  const [tab, setTab] = React.useState("home");
  const [overlay, setOverlay] = React.useState(null); // "homeroom" | "decision" | null
  const [decided, setDecided] = React.useState(null);

  const frame = {
    width: 390, height: 844, margin: "0 auto", position: "relative", overflow: "hidden",
    display: "flex", flexDirection: "column", background: "var(--page-bg)",
    fontFamily: "var(--font-body)", color: "var(--text-body)",
  };

  return (
    <div style={frame}>
      <StatusBar />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {tab === "home" && <HomeScreen onOpenThread={() => setOverlay("homeroom")} onReview={() => setOverlay("decision")} decided={decided} />}
        {tab === "journey" && <JourneyScreen onReview={() => setOverlay("decision")} />}
        {tab === "photos" && <QuietState icon="images" title="Photos" message="Every real photo your builder shares lands here. Nothing new today." />}
        {tab === "money" && <QuietState icon="wallet" title="Money" message="No new charges. Every change shows here — only after you approve it." />}
      </div>
      <BottomNav items={NAV} active={tab} onChange={(k) => { setTab(k); setOverlay(null); }} />

      {overlay === "homeroom" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
          <HomeRoomScreen onBack={() => setOverlay(null)} onReview={() => setOverlay("decision")} />
        </div>
      )}
      {overlay === "decision" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
          <DecisionScreen
            onBack={() => setOverlay(null)}
            onChoose={(choice) => { setDecided(choice); setOverlay(null); setTab("home"); }}
          />
        </div>
      )}
    </div>
  );
}
