/* @ds-bundle: {"format":3,"namespace":"ConstructoHomeownerDesignSystem_f56755","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"Chip","sourcePath":"components/buttons/Chip.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Card","sourcePath":"components/cards/Card.jsx"},{"name":"DecisionCard","sourcePath":"components/cards/DecisionCard.jsx"},{"name":"EvidenceCard","sourcePath":"components/cards/EvidenceCard.jsx"},{"name":"QuietState","sourcePath":"components/feedback/QuietState.jsx"},{"name":"Icon","sourcePath":"components/icon/Icon.jsx"},{"name":"Avatar","sourcePath":"components/media/Avatar.jsx"},{"name":"PhotoTile","sourcePath":"components/media/PhotoTile.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"StatusPill","sourcePath":"components/status/StatusPill.jsx"},{"name":"TimeBar","sourcePath":"components/status/TimeBar.jsx"},{"name":"AppShell","sourcePath":"ui_kits/homeowner/AppShell.jsx"},{"name":"DecisionScreen","sourcePath":"ui_kits/homeowner/DecisionScreen.jsx"},{"name":"HomeRoomScreen","sourcePath":"ui_kits/homeowner/HomeRoomScreen.jsx"},{"name":"HomeScreen","sourcePath":"ui_kits/homeowner/HomeScreen.jsx"},{"name":"JourneyScreen","sourcePath":"ui_kits/homeowner/JourneyScreen.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"06c11905c6a9","components/buttons/Chip.jsx":"8048505ccd5e","components/buttons/IconButton.jsx":"15195e89a72b","components/cards/Card.jsx":"11d7749d17ef","components/cards/DecisionCard.jsx":"06cdb84378f7","components/cards/EvidenceCard.jsx":"a2fb548d1393","components/feedback/QuietState.jsx":"6d77353c336e","components/icon/Icon.jsx":"d016e0335f51","components/media/Avatar.jsx":"9a5fe684e60b","components/media/PhotoTile.jsx":"343a5fd53497","components/navigation/BottomNav.jsx":"294c5d842f80","components/status/StatusPill.jsx":"119fd8993ce3","components/status/TimeBar.jsx":"2094332529b6","directions/design-canvas.jsx":"bd8746af6e58","ui_kits/homeowner/AppShell.jsx":"b90c896a98cc","ui_kits/homeowner/DecisionScreen.jsx":"9a998065308f","ui_kits/homeowner/HomeRoomScreen.jsx":"9dbbb4cabe68","ui_kits/homeowner/HomeScreen.jsx":"e641ee9146a8","ui_kits/homeowner/JourneyScreen.jsx":"d855b0f9dec0"},"inlinedExternals":[],"unexposedExports":[{"name":"iconNames","sourcePath":"components/icon/Icon.jsx"}]} */

(() => {

const __ds_ns = (window.ConstructoHomeownerDesignSystem_f56755 = window.ConstructoHomeownerDesignSystem_f56755 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/cards/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const VARIANTS = {
  plain: {
    bg: "var(--surface-card)",
    radius: "var(--radius-xl)"
  },
  letter: {
    bg: "var(--surface-letter)",
    radius: "var(--radius-xl)"
  },
  /* warm "letter" panel */
  quiet: {
    bg: "transparent",
    radius: "var(--radius-xl)"
  } /* dashed / muted */
};

/**
 * Card — the base warm surface container. Soft hairline border, gentle lift,
 * a faint paper inset highlight. `variant="letter"` for the weekly-summary feel,
 * "quiet" for low-emphasis / empty states.
 */
function Card({
  variant = "plain",
  padding = "var(--pad-card)",
  elevated = true,
  as: Tag = "div",
  onClick,
  children,
  style,
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.plain;
  const quiet = variant === "quiet";
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onClick: onClick,
    style: {
      background: v.bg,
      border: quiet ? "1px dashed var(--border-strong)" : "1px solid var(--border)",
      borderRadius: v.radius,
      padding,
      boxShadow: elevated && !quiet ? "var(--inset-paper), var(--shadow-card)" : "none",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/Card.jsx", error: String((e && e.message) || e) }); }

// components/icon/Icon.jsx
try { (() => {
// Icon — Constructo's bundled icon set (Lucide path data, ISC licensed).
// Self-contained: no CDN. Renders inline SVG with currentColor stroke so it
// inherits text color and respects the calm 1.85 default stroke weight.
const ICONS = {
  "check": "<path d=\"M20 6 9 17l-5-5\" />",
  "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"m9 12 2 2 4-4\" />",
  "hand": "<path d=\"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2\" />\n  <path d=\"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2\" />\n  <path d=\"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8\" />\n  <path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\" />",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <polyline points=\"12 6 12 12 16 14\" />",
  "camera": "<path d=\"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z\" />\n  <circle cx=\"12\" cy=\"13\" r=\"3\" />",
  "mic": "<path d=\"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z\" />\n  <path d=\"M19 10v2a7 7 0 0 1-14 0v-2\" />\n  <line x1=\"12\" x2=\"12\" y1=\"19\" y2=\"22\" />",
  "image": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" />\n  <circle cx=\"9\" cy=\"9\" r=\"2\" />\n  <path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />",
  "images": "<path d=\"M18 22H4a2 2 0 0 1-2-2V6\" />\n  <path d=\"m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18\" />\n  <circle cx=\"12\" cy=\"8\" r=\"2\" />\n  <rect width=\"16\" height=\"16\" x=\"6\" y=\"2\" rx=\"2\" />",
  "house": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" />\n  <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />",
  "route": "<circle cx=\"6\" cy=\"19\" r=\"3\" />\n  <path d=\"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15\" />\n  <circle cx=\"18\" cy=\"5\" r=\"3\" />",
  "wallet": "<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" />\n  <path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" />",
  "arrow-left": "<path d=\"m12 19-7-7 7-7\" />\n  <path d=\"M19 12H5\" />",
  "arrow-right": "<path d=\"M5 12h14\" />\n  <path d=\"m12 5 7 7-7 7\" />",
  "arrow-up": "<path d=\"m5 12 7-7 7 7\" />\n  <path d=\"M12 19V5\" />",
  "arrow-left-right": "<path d=\"M8 3 4 7l4 4\" />\n  <path d=\"M4 7h16\" />\n  <path d=\"m16 21 4-4-4-4\" />\n  <path d=\"M20 17H4\" />",
  "chevron-left": "<path d=\"m15 18-6-6 6-6\" />",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\" />",
  "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />\n  <path d=\"m9 12 2 2 4-4\" />",
  "badge-check": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" />\n  <path d=\"m9 12 2 2 4-4\" />",
  "sparkles": "<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" />\n  <path d=\"M20 3v4\" />\n  <path d=\"M22 5h-4\" />\n  <path d=\"M4 17v2\" />\n  <path d=\"M5 18H3\" />",
  "message-circle": "<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\" />",
  "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" />\n  <path d=\"M12 17h.01\" />",
  "calendar-check": "<path d=\"M8 2v4\" />\n  <path d=\"M16 2v4\" />\n  <rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" />\n  <path d=\"M3 10h18\" />\n  <path d=\"m9 16 2 2 4-4\" />",
  "flag": "<path d=\"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z\" />\n  <line x1=\"4\" x2=\"4\" y1=\"22\" y2=\"15\" />",
  "triangle-alert": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" />\n  <path d=\"M12 9v4\" />\n  <path d=\"M12 17h.01\" />",
  "volume-2": "<path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\" />\n  <path d=\"M16 9a5 5 0 0 1 0 6\" />\n  <path d=\"M19.364 18.364a9 9 0 0 0 0-12.728\" />",
  "heart": "<path d=\"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z\" />",
  "wifi": "<path d=\"M12 20h.01\" />\n  <path d=\"M2 8.82a15 15 0 0 1 20 0\" />\n  <path d=\"M5 12.859a10 10 0 0 1 14 0\" />\n  <path d=\"M8.5 16.429a5 5 0 0 1 7 0\" />",
  "battery-full": "<rect width=\"16\" height=\"10\" x=\"2\" y=\"7\" rx=\"2\" ry=\"2\" />\n  <line x1=\"22\" x2=\"22\" y1=\"11\" y2=\"13\" />\n  <line x1=\"6\" x2=\"6\" y1=\"11\" y2=\"13\" />\n  <line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"13\" />\n  <line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"13\" />",
  "signal-high": "<path d=\"M2 20h.01\" />\n  <path d=\"M7 20v-4\" />\n  <path d=\"M12 20v-8\" />\n  <path d=\"M17 20V8\" />",
  "x": "<path d=\"M18 6 6 18\" />\n  <path d=\"m6 6 12 12\" />",
  "plus": "<path d=\"M5 12h14\" />\n  <path d=\"M12 5v14\" />",
  "bell": "<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\" />\n  <path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\" />",
  "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" />\n  <circle cx=\"12\" cy=\"7\" r=\"4\" />",
  "play": "<polygon points=\"6 3 20 12 6 21 6 3\" />",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\" />\n  <path d=\"M12 2v2\" />\n  <path d=\"M12 20v2\" />\n  <path d=\"m4.93 4.93 1.41 1.41\" />\n  <path d=\"m17.66 17.66 1.41 1.41\" />\n  <path d=\"M2 12h2\" />\n  <path d=\"M20 12h2\" />\n  <path d=\"m6.34 17.66-1.41 1.41\" />\n  <path d=\"m19.07 4.93-1.41 1.41\" />",
  "phone": "<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\" />",
  "map-pin": "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\" />\n  <circle cx=\"12\" cy=\"10\" r=\"3\" />",
  "clipboard-check": "<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" />\n  <path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" />\n  <path d=\"m9 14 2 2 4-4\" />",
  "hard-hat": "<path d=\"M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5\" />\n  <path d=\"M14 6a6 6 0 0 1 6 6v3\" />\n  <path d=\"M4 15v-3a6 6 0 0 1 6-6\" />\n  <rect x=\"2\" y=\"15\" width=\"20\" height=\"4\" rx=\"1\" />"
};
function Icon({
  name,
  size = 24,
  stroke = 1.85,
  color = "currentColor",
  title,
  style,
  className
}) {
  const inner = ICONS[name];
  if (inner === undefined && typeof console !== "undefined") console.warn("Icon: unknown name '" + name + "'");
  return /*#__PURE__*/React.createElement("svg", {
    className: className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    role: title ? "img" : undefined,
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
    style: {
      display: "block",
      flexShrink: 0,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: inner || ""
    }
  });
}
const iconNames = Object.keys(ICONS);
Object.assign(__ds_scope, { Icon, iconNames });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    h: 44,
    px: 16,
    fs: 14,
    gap: 7,
    icon: 17,
    radius: "var(--radius-sm)"
  },
  md: {
    h: 48,
    px: 18,
    fs: 15,
    gap: 8,
    icon: 19,
    radius: "var(--radius-md)"
  },
  lg: {
    h: 56,
    px: 24,
    fs: 16,
    gap: 9,
    icon: 20,
    radius: "var(--radius-md)"
  }
};
const VARIANTS = {
  primary: {
    bg: "var(--accent)",
    fg: "#fff",
    border: "transparent",
    press: "var(--accent-press)",
    hover: "var(--green-700)"
  },
  celebrate: {
    bg: "var(--secondary)",
    fg: "#fff",
    border: "transparent",
    press: "var(--clay-700)",
    hover: "var(--clay-700)"
  },
  secondary: {
    bg: "var(--surface-card)",
    fg: "var(--text-strong)",
    border: "var(--border)",
    press: "var(--surface-2)",
    hover: "var(--surface-2)"
  },
  ghost: {
    bg: "transparent",
    fg: "var(--accent-text)",
    border: "transparent",
    press: "var(--accent-tint)",
    hover: "var(--accent-tint)"
  }
};

/**
 * Button — the primary calm action. Primary = sage-green (the locked primary role).
 * Use `celebrate` (clay) only for milestone/celebration moments.
 */
function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  type = "button",
  onClick,
  children,
  style,
  ...rest
}) {
  const [pressed, setPressed] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const bg = disabled ? v.bg : pressed ? v.press : hover ? v.hover : v.bg;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onPointerDown: () => !disabled && setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => {
      setPressed(false);
      setHover(false);
    },
    onPointerEnter: () => !disabled && setHover(true),
    style: {
      display: fullWidth ? "flex" : "inline-flex",
      width: fullWidth ? "100%" : undefined,
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      height: s.h,
      minHeight: "var(--tap-min)",
      padding: `0 ${s.px}px`,
      background: bg,
      color: v.fg,
      border: `var(--border-w) solid ${v.border}`,
      borderRadius: s.radius,
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-semibold)",
      fontSize: s.fs,
      letterSpacing: ".005em",
      lineHeight: 1,
      whiteSpace: "nowrap",
      boxShadow: variant === "secondary" ? "var(--shadow-sm)" : "none",
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      transform: pressed && !disabled ? "scale(var(--press-scale))" : "none",
      transition: "var(--tr-press), var(--tr-color)",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.icon,
    stroke: 2
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon,
    stroke: 2
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Chip — a small pill for quick actions (Ask, Request a visit, Flag) and
 * lightweight toggles. `tone="accent"` highlights the AI "Ask" affordance.
 * Secondary control — sits at 38–40px; not for primary actions.
 */
function Chip({
  icon,
  children,
  tone = "neutral",
  selected = false,
  onClick,
  style,
  ...rest
}) {
  const [pressed, setPressed] = React.useState(false);
  const accent = tone === "accent";
  const bg = selected ? accent ? "var(--accent)" : "var(--ink-900)" : pressed ? accent ? "var(--green-tint-strong)" : "var(--neutral-tint)" : accent ? "var(--accent-tint)" : "var(--chip-bg, var(--surface-card))";
  const fg = selected ? "#fff" : accent ? "var(--accent-text)" : "var(--text-strong)";
  const border = selected ? "transparent" : accent ? "var(--accent-tint)" : "var(--border)";
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      whiteSpace: "nowrap",
      minHeight: 40,
      padding: "9px 14px",
      background: bg,
      color: fg,
      border: `var(--border-w) solid ${border}`,
      borderRadius: "var(--radius-pill)",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-semibold)",
      fontSize: 13,
      cursor: "pointer",
      transform: pressed ? "scale(var(--press-scale))" : "none",
      transition: "var(--tr-press), var(--tr-color)",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15,
    color: accent && !selected ? "var(--accent-text)" : undefined
  }), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Chip.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  md: {
    box: 48,
    icon: 20,
    radius: "var(--radius-md)"
  },
  lg: {
    box: 56,
    icon: 22,
    radius: "var(--radius-lg)"
  }
};
const TONES = {
  neutral: {
    bg: "var(--surface-card)",
    fg: "var(--text-strong)",
    border: "var(--border)",
    press: "var(--surface-2)"
  },
  accent: {
    bg: "var(--accent-tint)",
    fg: "var(--accent-text)",
    border: "var(--accent-tint)",
    press: "var(--green-tint-strong)"
  },
  bare: {
    bg: "transparent",
    fg: "var(--text-secondary)",
    border: "transparent",
    press: "var(--neutral-tint)"
  }
};

/**
 * IconButton — a single-icon control with a guaranteed >=48px target.
 * Use for back, mic, camera, overflow, etc. Always pass `label` for a11y.
 */
function IconButton({
  icon,
  label,
  tone = "neutral",
  size = "md",
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const [pressed, setPressed] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const t = TONES[tone] || TONES.neutral;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    disabled: disabled,
    onClick: onClick,
    onPointerDown: () => !disabled && setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: s.box,
      height: s.box,
      flexShrink: 0,
      background: pressed ? t.press : t.bg,
      color: t.fg,
      border: `var(--border-w) solid ${t.border}`,
      borderRadius: s.radius,
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      transform: pressed && !disabled ? "scale(var(--press-scale))" : "none",
      transition: "var(--tr-press), var(--tr-color)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.icon
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/QuietState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * QuietState — the calm empty/quiet state. Success here is EARNED ABSENCE:
 * a soft sage halo, a reassuring line, and (optionally) one gentle action.
 * Never an error tone, never red, never a nudge to engage.
 */
function QuietState({
  icon = "sun",
  title = "All calm",
  message = "Nothing needs you today.",
  action,
  tone = "ontrack",
  style,
  ...rest
}) {
  const haloBg = tone === "quiet" ? "radial-gradient(circle at 50% 42%, var(--sand-300), var(--sand-300))" : "radial-gradient(circle at 50% 42%, var(--green-400), var(--green-600))";
  const haloFg = tone === "quiet" ? "var(--quiet-ink)" : "#fff";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: 4,
      padding: "40px 28px",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: "50%",
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: haloBg,
      color: haloFg,
      boxShadow: tone === "quiet" ? "none" : "var(--glow-ontrack)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 30,
    stroke: 2.1
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h2)",
      color: "var(--text-strong)"
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-secondary)",
      maxWidth: 280,
      textWrap: "balance"
    }
  }, message), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, action));
}
Object.assign(__ds_scope, { QuietState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/QuietState.jsx", error: String((e && e.message) || e) }); }

// components/media/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 28,
  md: 42,
  lg: 56
};
const TONES = {
  clay: {
    bg: "var(--clay-600)",
    fg: "#fff"
  },
  green: {
    bg: "var(--green-600)",
    fg: "#fff"
  },
  neutral: {
    bg: "var(--sand-300)",
    fg: "var(--ink-700)"
  }
};
function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
}

/**
 * Avatar — builder / person identity. Shows a real photo `src` if given, else
 * tidy initials on a tinted square (the builder's mark). Squircle by default;
 * pass shape="circle" for people.
 */
function Avatar({
  name = "",
  src,
  size = "md",
  shape = "rounded",
  tone = "clay",
  style,
  ...rest
}) {
  const px = typeof size === "number" ? size : SIZES[size] || SIZES.md;
  const t = TONES[tone] || TONES.clay;
  const radius = shape === "circle" ? "50%" : Math.round(px * 0.3);
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "img",
    "aria-label": name,
    style: {
      width: px,
      height: px,
      flexShrink: 0,
      borderRadius: radius,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: t.bg,
      color: t.fg,
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-semibold)",
      fontSize: Math.round(px * 0.36),
      letterSpacing: ".02em",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials(name));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/media/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/media/PhotoTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * PhotoTile — real photos only (never AI/3D renders). Pass a `src` taken by a
 * human. With no src it shows a labelled placeholder (for mockups/specimens),
 * never a fake render. Optional count badge ("+6") and caption overlay.
 */
function PhotoTile({
  src,
  alt = "",
  height = 120,
  radius = "var(--radius-lg)",
  count,
  caption,
  rounded,
  onClick,
  style,
  ...rest
}) {
  const r = rounded || radius;
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      position: "relative",
      overflow: "hidden",
      borderRadius: r,
      height,
      width: "100%",
      background: "var(--sand-300)",
      border: "1px solid var(--border)",
      cursor: onClick ? "pointer" : "default",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt,
    loading: "lazy",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    "aria-label": "Photo placeholder",
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      color: "var(--text-muted)",
      background: "linear-gradient(150deg, #d8cdb6, #b9a888)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "image",
    size: 22,
    color: "rgba(255,255,255,.92)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      fontSize: 11,
      color: "rgba(255,255,255,.92)"
    }
  }, "Real photo")), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 6,
      bottom: 6,
      font: "var(--type-label)",
      fontWeight: "var(--fw-bold)",
      fontSize: 11,
      color: "#fff",
      background: "rgba(42,37,25,.5)",
      padding: "2px 7px",
      borderRadius: "var(--radius-xs)",
      backdropFilter: "blur(2px)"
    }
  }, count), caption && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "18px 12px 9px",
      color: "#fff",
      font: "var(--type-label)",
      fontWeight: "var(--fw-medium)",
      background: "linear-gradient(transparent, rgba(42,37,25,.6))"
    }
  }, caption));
}
Object.assign(__ds_scope, { PhotoTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/media/PhotoTile.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * BottomNav — the calm shell. Icon + label, never icon-only. Active item is
 * sage-green with a slightly heavier icon; every target is >=48px.
 */
function BottomNav({
  items = [],
  active,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      display: "flex",
      justifyContent: "space-around",
      alignItems: "stretch",
      padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 14px))",
      background: "color-mix(in srgb, var(--surface-card) 88%, transparent)",
      borderTop: "1px solid var(--border)",
      backdropFilter: "blur(10px)",
      boxShadow: "var(--shadow-nav)",
      ...style
    }
  }, rest), items.map(it => {
    const on = it.key === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.key,
      type: "button",
      "aria-label": it.label,
      "aria-current": on ? "page" : undefined,
      onClick: () => onChange && onChange(it.key),
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        flex: 1,
        minHeight: "var(--tap-min)",
        padding: "4px 6px",
        color: on ? "var(--accent-text)" : "var(--text-secondary)",
        font: "var(--type-label)",
        fontSize: 11,
        fontWeight: on ? "var(--fw-semibold)" : "var(--fw-medium)",
        cursor: "pointer",
        transition: "color var(--dur) var(--ease-calm)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 24,
      stroke: on ? 2.2 : 1.85
    }), it.label);
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/status/StatusPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// status -> { fg, bg, icon, word } — the locked semantic palette.
const STATUS = {
  ontrack: {
    fg: "var(--status-ontrack-fg)",
    bg: "var(--status-ontrack-bg)",
    icon: "circle-check",
    word: "On track"
  },
  milestone: {
    fg: "var(--status-milestone-fg)",
    bg: "var(--status-milestone-bg)",
    icon: "badge-check",
    word: "Milestone"
  },
  needsyou: {
    fg: "var(--status-needsyou-fg)",
    bg: "var(--status-needsyou-bg)",
    icon: "hand",
    word: "Needs you"
  },
  delay: {
    fg: "var(--status-delay-fg)",
    bg: "var(--status-delay-bg)",
    icon: "triangle-alert",
    word: "Delayed"
  },
  progress: {
    fg: "var(--status-progress-fg)",
    bg: "var(--status-progress-bg)",
    icon: "arrow-left-right",
    word: "In progress"
  },
  quiet: {
    fg: "var(--status-quiet-fg)",
    bg: "var(--status-quiet-bg)",
    icon: "clock",
    word: "Quiet"
  }
};
const SIZES = {
  sm: {
    fs: 11.5,
    py: 5,
    px: 9,
    icon: 13,
    gap: 5
  },
  md: {
    fs: 13,
    py: 7,
    px: 12,
    icon: 15,
    gap: 7
  }
};

/**
 * StatusPill — the enforcement of "status = color + icon + word" (never color alone).
 * Pick a `status`; the icon + word + calm tint come from the locked palette.
 * Override the word via children. Red appears only for `delay`.
 */
function StatusPill({
  status = "ontrack",
  size = "md",
  icon,
  children,
  uppercase = false,
  style,
  ...rest
}) {
  const s = STATUS[status] || STATUS.ontrack;
  const z = SIZES[size] || SIZES.md;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: z.gap,
      whiteSpace: "nowrap",
      color: s.fg,
      background: s.bg,
      padding: `${z.py}px ${z.px}px`,
      borderRadius: "var(--radius-pill)",
      fontFamily: "var(--font-body)",
      fontWeight: "var(--fw-semibold)",
      fontSize: z.fs,
      letterSpacing: uppercase ? ".06em" : 0,
      textTransform: uppercase ? "uppercase" : "none",
      lineHeight: 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || s.icon,
    size: z.icon
  }), children || s.word);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/status/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/cards/DecisionCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * DecisionCard — the signature pre-briefed choice. Calm AMBER (a choice, never
 * red), a why-now line so it never feels sudden, and a single primary (green)
 * "Review" action. The CTA is green because primary actions are always green;
 * amber only signals "needs you".
 */
function DecisionCard({
  title,
  whenLabel,
  whenIcon = "clock",
  reviewLabel = "Review",
  onReview,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--amber-tint)",
      border: "1px solid rgba(169,122,30,.30)",
      borderRadius: "var(--radius-lg)",
      padding: "14px",
      boxShadow: "var(--shadow-card)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "needsyou",
    size: "sm",
    uppercase: true
  }, "Needs your choice"), /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)",
      marginTop: 10
    }
  }, title), whenLabel && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginTop: 5,
      font: "var(--type-label)",
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: whenIcon,
    size: 14,
    color: "var(--amber-700)"
  }), whenLabel), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    fullWidth: true,
    iconRight: "arrow-right",
    onClick: onReview,
    style: {
      marginTop: 13
    }
  }, reviewLabel));
}
Object.assign(__ds_scope, { DecisionCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/DecisionCard.jsx", error: String((e && e.message) || e) }); }

// components/cards/EvidenceCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * EvidenceCard — the "show proof" card. A curated, published update backed by
 * real photos: a "Published update" tag, a real-photo thumb, plain-language
 * title + date/count, and a "Show proof" affordance. Trust through evidence.
 */
function EvidenceCard({
  title,
  date,
  photoCount,
  thumbSrc,
  proofLabel = "Show proof",
  tagWord = "Published update",
  onShowProof,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      boxShadow: "var(--shadow-card)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "13px 14px 14px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "ontrack",
    size: "sm",
    icon: "badge-check",
    uppercase: true
  }, tagWord), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 13,
      marginTop: 11
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 66,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.PhotoTile, {
    src: thumbSrc,
    height: 66,
    radius: "var(--radius-md)",
    count: photoCount ? "+" + photoCount : undefined
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, title), (date || photoCount != null) && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-secondary)",
      marginTop: 3
    }
  }, [date, photoCount != null ? `${photoCount} photos` : null].filter(Boolean).join(" · ")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onShowProof,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      marginTop: 9,
      font: "var(--type-label)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--accent-text)",
      cursor: "pointer",
      minHeight: 24,
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "images",
    size: 15
  }), " ", proofLabel)))));
}
Object.assign(__ds_scope, { EvidenceCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/EvidenceCard.jsx", error: String((e && e.message) || e) }); }

// components/status/TimeBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * TimeBar — position in TIME, never a percentage or progress ring.
 * A segmented Start -> Handover bar with a warm "you-are-here" marker on the
 * current phase. Completed phases are sage-green; future phases are a calm track.
 */
function TimeBar({
  phases = [],
  current = 0,
  startLabel = "Start",
  endLabel = "Handover",
  showPhase = true,
  style,
  ...rest
}) {
  const n = Math.max(phases.length, 1);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: style
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5
    },
    role: "img",
    "aria-label": `Phase ${current + 1} of ${n}${phases[current] ? ": " + phases[current] : ""}`
  }, Array.from({
    length: n
  }).map((_, i) => {
    const done = i < current;
    const here = i === current;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        position: "relative",
        flex: 1,
        height: 8,
        borderRadius: 6,
        background: done || here ? "var(--green-600)" : "var(--sand-300)"
      }
    }, here && /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: "absolute",
        right: -4,
        top: -6,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "var(--clay-600)",
        border: "4px solid var(--surface-card)",
        boxShadow: "var(--glow-here)"
      }
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 10,
      font: "var(--type-label)",
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement("span", null, startLabel), /*#__PURE__*/React.createElement("span", null, endLabel)), showPhase && phases[current] && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, phases[current]), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--clay-700)",
      fontWeight: "var(--fw-semibold)"
    }
  }, "you are here")));
}
Object.assign(__ds_scope, { TimeBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/status/TimeBar.jsx", error: String((e && e.message) || e) }); }

// directions/design-canvas.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Exports (to window): DesignCanvas, DCSection, DCArtboard, DCPostIt.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>
//
// Artboards are static design frames, not scroll regions — never use
// height: 100% + overflow: auto/scroll on inner elements; size each artboard
// to fit its content (explicit pixel height, or let it grow).
/* END USAGE */

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "directions/design-canvas.jsx", error: String((e && e.message) || e) }); }

// ui_kits/homeowner/DecisionScreen.jsx
try { (() => {
function Option({
  tile,
  title,
  meaning,
  price,
  free,
  taste,
  onChoose
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 11,
      display: "flex",
      flexDirection: "column",
      boxShadow: "var(--shadow-card)"
    }
  }, taste && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 18,
      left: 18,
      zIndex: 2,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      background: "var(--green-600)",
      color: "#fff",
      fontSize: 11,
      fontWeight: 600,
      padding: "4px 9px",
      borderRadius: "var(--radius-pill)",
      boxShadow: "var(--shadow-raise)",
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "heart",
    size: 12
  }), " Matches your taste"), /*#__PURE__*/React.createElement(__ds_scope.PhotoTile, {
    height: 118,
    radius: "var(--radius-md)"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "t-h3",
    style: {
      marginTop: 11
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-secondary)",
      marginTop: 5,
      minHeight: 50
    }
  }, meaning), /*#__PURE__*/React.createElement("div", {
    className: "t-mono",
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: free ? "var(--green-700)" : "var(--text-strong)",
      marginTop: 2
    }
  }, price), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    fullWidth: true,
    onClick: onChoose,
    style: {
      marginTop: 11
    }
  }, title.startsWith("Matte") ? "Choose Matte" : "Choose Glossy"));
}

/** Decision — one pre-briefed choice. Amber "needs you", equal-weight options, reversible. */
function DecisionScreen({
  onBack,
  onChoose
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--page-bg)",
      padding: "0 22px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 0 6px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "arrow-left",
    label: "Back",
    onClick: onBack
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-secondary)",
      whiteSpace: "nowrap"
    }
  }, "A decision for you \xB7 1 of 1")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "needsyou"
  }, "Needs your choice")), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h2)",
      color: "var(--text-strong)",
      marginTop: 16,
      lineHeight: 1.25
    }
  }, "Tiling starts in ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--clay-700)"
    }
  }, "~4 days"), ", so we need your tile pick before then."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 13,
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(Option, {
    title: "Matte anti-slip",
    meaning: "Safer when wet, softer look.",
    price: "+\u20B90",
    free: true,
    taste: true,
    onChoose: () => onChoose("Matte")
  }), /*#__PURE__*/React.createElement(Option, {
    title: "Glossy",
    meaning: "Shinier, but shows water spots.",
    price: "+\u20B96,000",
    onChoose: () => onChoose("Glossy")
  })), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    fullWidth: true,
    icon: "message-circle",
    style: {
      marginTop: 13
    },
    onClick: onBack
  }, "Ask first"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      justifyContent: "center",
      marginTop: "auto",
      padding: "18px 0 26px",
      font: "var(--type-label)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--green-700)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-check",
    size: 16
  }), " Reversible until tiling begins (~4 days)"));
}
Object.assign(__ds_scope, { DecisionScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/homeowner/DecisionScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/homeowner/HomeRoomScreen.jsx
try { (() => {
function Bubble({
  side,
  children
}) {
  const me = side === "me";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: me ? "flex-end" : "flex-start",
      maxWidth: "84%",
      flexShrink: 0,
      background: me ? "var(--green-tint)" : "var(--surface-card)",
      border: `1px solid ${me ? "rgba(78,125,105,.2)" : "var(--border)"}`,
      borderRadius: me ? "var(--radius-bubble) var(--radius-bubble) 6px var(--radius-bubble)" : "var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) 6px",
      padding: "11px 14px",
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, children);
}

/** Home Room — the curated, trust-safe builder thread (one per property). */
function HomeRoomScreen({
  onBack,
  onReview
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--page-bg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      padding: "8px 16px 12px",
      borderBottom: "1px solid var(--border)",
      background: "color-mix(in srgb, var(--surface-card) 90%, transparent)",
      backdropFilter: "blur(8px)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "chevron-left",
    label: "Back",
    tone: "bare",
    onClick: onBack
  }), /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: "Verma Constructions"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-title)",
      fontFamily: "var(--font-display)",
      fontWeight: 600,
      fontSize: 16,
      color: "var(--text-strong)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, "Priya's Home \xB7 Whitefield"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      font: "var(--type-label)",
      color: "var(--text-secondary)",
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "badge-check",
    size: 13,
    color: "var(--accent-text)"
  }), " Verma Constructions")), /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    selected: true,
    style: {
      minHeight: 34,
      padding: "6px 10px"
    }
  }, "EN")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      marginTop: 11,
      font: "var(--type-label)",
      fontSize: 11.5,
      color: "var(--text-secondary)",
      background: "color-mix(in srgb, var(--surface-card) 70%, transparent)",
      border: "1px solid var(--border)",
      padding: "7px 11px",
      borderRadius: 11
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shield-check",
    size: 14,
    color: "var(--accent-text)"
  }), " Your builder posts here \xB7 only what they send reaches you.")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "18px 16px 8px",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      alignSelf: "center",
      flexShrink: 0,
      font: "var(--type-label)",
      fontSize: 11,
      fontWeight: 600,
      color: "var(--text-secondary)",
      background: "var(--surface-card)",
      padding: "4px 12px",
      borderRadius: "var(--radius-pill)"
    }
  }, "Sunday, 8 June"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 9,
      alignSelf: "flex-start",
      maxWidth: "84%",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: "Verma Constructions",
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Bubble, {
    side: "them"
  }, "Namaste Priya \uD83D\uDE4F This week we finished the roof slab \u2014 curing is on now."), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      fontSize: 10.5,
      color: "var(--text-secondary)",
      marginTop: 5
    }
  }, "9:02 AM"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "90%",
      alignSelf: "flex-start",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.EvidenceCard, {
    title: "Roof slab complete",
    date: "8 Jun",
    photoCount: 6,
    onShowProof: () => {}
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "90%",
      alignSelf: "flex-start",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.DecisionCard, {
    title: "A choice for you \u2014 bathroom tile",
    whenLabel: "Tiling begins in ~4 days",
    onReview: onReview
  })), /*#__PURE__*/React.createElement(Bubble, {
    side: "me"
  }, "Looks lovely! Can we see the kitchen next?"), /*#__PURE__*/React.createElement(Bubble, {
    side: "me"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--accent-text)",
      fontWeight: 600
    }
  }, "@ask"), " curing matlab kya?"), /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: "flex-start",
      maxWidth: "88%",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 8,
      background: "linear-gradient(140deg, var(--green-500), var(--green-700))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "sparkles",
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      fontFamily: "var(--font-display)",
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, "Nivaan ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-secondary)",
      fontWeight: 400
    }
  }, "\xB7 your guide"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "6px var(--radius-bubble) var(--radius-bubble) var(--radius-bubble)",
      padding: "12px 14px",
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, "Curing = keeping the slab wet so it sets strong \u2014 about 2 weeks for your roof, day 3 now.", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      font: "var(--type-label)",
      fontSize: 11,
      fontWeight: 600,
      color: "var(--green-700)",
      background: "var(--green-tint)",
      padding: "5px 9px",
      borderRadius: "var(--radius-pill)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "sparkles",
    size: 12
  }), " from your site updates"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      marginLeft: 7,
      font: "var(--type-label)",
      fontSize: 11,
      color: "var(--text-secondary)",
      border: "1px dashed var(--border-strong)",
      padding: "5px 9px",
      borderRadius: "var(--radius-pill)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "message-circle",
    size: 12
  }), " ask your builder"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      borderTop: "1px solid var(--border)",
      background: "color-mix(in srgb, var(--surface-card) 90%, transparent)",
      backdropFilter: "blur(8px)",
      padding: "10px 14px calc(14px + env(safe-area-inset-bottom, 10px))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      overflowX: "auto",
      paddingBottom: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    tone: "accent",
    icon: "sparkles"
  }, "Ask"), /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    icon: "circle-help"
  }, "Ask a question"), /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    icon: "calendar-check"
  }, "Request a visit"), /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    icon: "flag"
  }, "Flag")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "camera",
    label: "Take a photo",
    tone: "accent"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      height: 48,
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)",
      background: "var(--surface-card)",
      display: "flex",
      alignItems: "center",
      padding: "0 6px 0 15px",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: "var(--type-body-sm)",
      color: "var(--text-secondary)",
      whiteSpace: "nowrap",
      overflow: "hidden"
    }
  }, "Message Verma Constructions\u2026"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "mic",
    size: 19
  }))), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "arrow-up",
    label: "Send",
    tone: "accent",
    style: {
      background: "var(--accent)",
      color: "#fff",
      border: "none"
    }
  }))));
}
Object.assign(__ds_scope, { HomeRoomScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/homeowner/HomeRoomScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/homeowner/HomeScreen.jsx
try { (() => {
const PHASES = ["Foundation", "Brickwork & walls", "Plaster", "Finishes", "Handover"];

/** Home — the "Am I okay?" screen. Answers in 3 seconds, then quiets down. */
function HomeScreen({
  onOpenThread,
  onReview,
  decided
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "0 22px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      padding: "16px 0 4px"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-secondary)",
      fontWeight: "var(--fw-medium)",
      whiteSpace: "nowrap"
    }
  }, "Good morning, Priya"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-secondary)",
      opacity: .8,
      marginTop: 2
    }
  }, "Friday, 7 June")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    selected: true,
    style: {
      minHeight: 36,
      padding: "7px 11px"
    }
  }, "EN"), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "message-circle",
    label: "Open builder thread",
    onClick: onOpenThread
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "22px 2px 8px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: "50%",
      marginBottom: 18,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      background: "radial-gradient(circle at 50% 42%, var(--green-400), var(--green-600))",
      boxShadow: "var(--glow-ontrack), 0 8px 16px -8px rgba(47,97,81,.55)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 25,
    stroke: 2.4
  })), /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow"
  }, "Today"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-hero)",
      letterSpacing: "var(--ls-hero)",
      color: "var(--text-strong)",
      marginTop: 9
    }
  }, "You're okay."), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      fontSize: 18,
      color: "var(--text-secondary)",
      marginTop: 13,
      maxWidth: 320
    }
  }, "Nothing needs you today. We'll tell you the moment it does."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "ontrack"
  }, "On track \xB7 checked 1h ago"))), /*#__PURE__*/React.createElement(__ds_scope.Card, {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-eyebrow",
    style: {
      color: "var(--text-secondary)"
    }
  }, "Start \u2192 Handover"), /*#__PURE__*/React.createElement("span", {
    className: "t-mono",
    style: {
      fontSize: 12.5,
      color: "var(--text-secondary)"
    }
  }, "Mar \u2013 Dec")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.TimeBar, {
    phases: PHASES,
    current: 1,
    startLabel: "Start \xB7 Mar",
    endLabel: "Handover \xB7 Dec"
  }))), decided ? /*#__PURE__*/React.createElement(__ds_scope.Card, {
    style: {
      marginTop: 16,
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "ontrack",
    icon: "circle-check"
  }, "Chosen"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, "You chose ", /*#__PURE__*/React.createElement("b", null, decided), " tile. Reversible for ~4 days.")) : /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.DecisionCard, {
    title: "A choice for you \u2014 bathroom tile",
    whenLabel: "Tiling begins in ~4 days",
    onReview: onReview
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.EvidenceCard, {
    title: "Roof slab complete",
    date: "2 days ago",
    photoCount: 6,
    onShowProof: () => {}
  })));
}
Object.assign(__ds_scope, { HomeScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/homeowner/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/homeowner/JourneyScreen.jsx
try { (() => {
const NODE = {
  milestone: {
    fg: "var(--clay-700)",
    bg: "var(--clay-tint)",
    icon: "badge-check"
  },
  progress: {
    fg: "var(--neutral-ink)",
    bg: "var(--neutral-tint)",
    icon: "arrow-left-right"
  },
  delay: {
    fg: "var(--red-600)",
    bg: "var(--red-tint)",
    icon: "triangle-alert"
  },
  quiet: {
    fg: "var(--quiet-ink)",
    bg: "var(--quiet-tint)",
    icon: "clock"
  }
};
function FeedItem({
  kind,
  last,
  children
}) {
  const n = NODE[kind];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      position: "relative",
      paddingBottom: last ? 0 : 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      flexShrink: 0,
      display: "flex",
      justifyContent: "center",
      position: "relative"
    }
  }, !last && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 8,
      bottom: -18,
      width: 2,
      background: "var(--border)",
      borderRadius: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: "50%",
      position: "relative",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: n.bg,
      color: n.fg,
      border: "2px solid var(--page-bg)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: n.icon,
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, children));
}
function Letter() {
  const lines = [{
    ic: "check",
    tone: "ontrack",
    lab: "Done",
    txt: "Roof slab finished",
    bold: true
  }, {
    ic: "arrow-right",
    tone: "progress",
    lab: "Coming next",
    txt: "Plastering begins"
  }, {
    ic: "hand",
    tone: "needsyou",
    lab: "Needs you",
    txt: "1 tile choice"
  }, {
    ic: "triangle-alert",
    tone: "delay",
    lab: "Delays",
    txt: "Plastering ~5 days (rain)"
  }];
  const tint = {
    ontrack: ["var(--green-tint)", "var(--green-700)"],
    progress: ["var(--neutral-tint)", "var(--neutral-ink)"],
    needsyou: ["var(--amber-tint)", "var(--amber-700)"],
    delay: ["var(--red-tint)", "var(--red-600)"]
  };
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    variant: "letter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow"
  }, "This week"), /*#__PURE__*/React.createElement("h2", {
    className: "t-h2",
    style: {
      marginTop: 6
    }
  }, "2\u20138 June"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      marginTop: 11,
      font: "var(--type-body-sm)",
      fontSize: 14,
      color: "var(--text-body)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 7,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: tint[l.tone][0],
      color: tint[l.tone][1],
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: l.ic,
    size: 13
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-secondary)",
      fontWeight: "var(--fw-semibold)"
    }
  }, l.lab, " \xB7 "), l.bold ? /*#__PURE__*/React.createElement("b", null, l.txt) : l.txt)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    size: "sm",
    icon: "volume-2"
  }, "Listen"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "sm",
    iconRight: "arrow-right",
    style: {
      flex: 1
    }
  }, "Read full letter")));
}

/** Journey — the story of the build. Pinned letter + total, then the status spine. */
function JourneyScreen({
  onReview
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      padding: "10px 20px 14px"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "t-h1"
  }, "Journey"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-secondary)",
      marginTop: 5
    }
  }, "Priya's Home \xB7 Whitefield")), /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    selected: true,
    style: {
      minHeight: 36,
      padding: "7px 11px"
    }
  }, "EN")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "2px 18px 24px"
    }
  }, /*#__PURE__*/React.createElement(Letter, null), /*#__PURE__*/React.createElement(__ds_scope.Card, {
    style: {
      marginTop: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      color: "var(--text-secondary)"
    }
  }, "Changes so far"), /*#__PURE__*/React.createElement("div", {
    className: "t-mono",
    style: {
      fontSize: 24,
      fontWeight: 600,
      color: "var(--text-strong)",
      marginTop: 5
    }
  }, "+\u20B92,40,000")), /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "ontrack",
    icon: "circle-check"
  }, "all approved by you")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      color: "var(--text-secondary)",
      margin: "0 0 6px 50px"
    }
  }, "Updates"), /*#__PURE__*/React.createElement(FeedItem, {
    kind: "milestone"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 13,
      boxShadow: "var(--shadow-card)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "milestone",
    size: "sm",
    uppercase: true
  }, "Milestone"), /*#__PURE__*/React.createElement("h3", {
    className: "t-h3",
    style: {
      marginTop: 6
    }
  }, "Roof slab complete"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-secondary)",
      marginTop: 3
    }
  }, "8 Jun \xB7 6 photos"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 11,
      marginTop: 11,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 50
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.PhotoTile, {
    height: 50,
    radius: "var(--radius-sm)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      font: "var(--type-label)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--accent-text)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "images",
    size: 15
  }), " Show proof")))), /*#__PURE__*/React.createElement(FeedItem, {
    kind: "progress"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 13,
      boxShadow: "var(--shadow-card)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "progress",
    size: "sm",
    uppercase: true
  }, "Progress"), /*#__PURE__*/React.createElement("h3", {
    className: "t-h3",
    style: {
      marginTop: 6
    }
  }, "Curing started"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-secondary)",
      marginTop: 3
    }
  }, "2 days ago"))), /*#__PURE__*/React.createElement(FeedItem, {
    kind: "delay"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--red-tint)",
      border: "1px solid rgba(164,56,42,.24)",
      borderRadius: "var(--radius-lg)",
      padding: 13
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "delay",
    size: "sm",
    uppercase: true
  }, "Delay"), /*#__PURE__*/React.createElement("h3", {
    className: "t-h3",
    style: {
      marginTop: 6
    }
  }, "Plastering pushed ~5 days"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(Row, {
    k: "Now expected",
    v: "~18 Jul"
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Reason",
    v: "Rain"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-secondary)",
      minWidth: 92
    }
  }, "Handover"), /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "ontrack",
    size: "sm",
    icon: "circle-check"
  }, "unchanged"))), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      marginTop: 11,
      font: "var(--type-label)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--red-600)"
    }
  }, "Why this happened ", /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-right",
    size: 15
  })))), /*#__PURE__*/React.createElement(FeedItem, {
    kind: "progress"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 13,
      boxShadow: "var(--shadow-card)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "progress",
    size: "sm",
    uppercase: true
  }, "Change"), /*#__PURE__*/React.createElement("h3", {
    className: "t-h3",
    style: {
      marginTop: 6
    }
  }, "Bathroom tile upgraded"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      marginTop: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-mono",
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, "+\u20B918,000"), /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "ontrack",
    size: "sm",
    icon: "circle-check"
  }, "approved by you")))), /*#__PURE__*/React.createElement(FeedItem, {
    kind: "quiet",
    last: true
  }, /*#__PURE__*/React.createElement(__ds_scope.Card, {
    variant: "quiet",
    elevated: false,
    padding: "13px 14px"
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: "quiet",
    size: "sm",
    uppercase: true
  }, "Quiet"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-secondary)",
      marginTop: 6
    }
  }, "Site quiet 3 days \u2014 curing, normal. Nothing to worry about."))))));
}
function Row({
  k,
  v
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-secondary)",
      minWidth: 92
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-strong)"
    }
  }, v));
}
Object.assign(__ds_scope, { JourneyScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/homeowner/JourneyScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/homeowner/AppShell.jsx
try { (() => {
function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "13px 26px 0",
      fontSize: 14,
      fontWeight: 600,
      color: "var(--text-strong)",
      fontFamily: "var(--font-body)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "signal-high",
    size: 16
  }), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "wifi",
    size: 16
  }), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "battery-full",
    size: 16
  })));
}
const NAV = [{
  key: "home",
  icon: "house",
  label: "Home"
}, {
  key: "journey",
  icon: "route",
  label: "Journey"
}, {
  key: "photos",
  icon: "images",
  label: "Photos"
}, {
  key: "money",
  icon: "wallet",
  label: "Money"
}];

/**
 * AppShell — the calm phone shell for the Constructo homeowner app.
 * Holds the status bar, the active tab screen, the bottom nav, and the pushed
 * overlays (Home Room thread, Decision flow). A self-contained interactive demo.
 */
function AppShell() {
  const [tab, setTab] = React.useState("home");
  const [overlay, setOverlay] = React.useState(null); // "homeroom" | "decision" | null
  const [decided, setDecided] = React.useState(null);
  const frame = {
    width: 390,
    height: 844,
    margin: "0 auto",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "var(--page-bg)",
    fontFamily: "var(--font-body)",
    color: "var(--text-body)"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: frame
  }, /*#__PURE__*/React.createElement(StatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    }
  }, tab === "home" && /*#__PURE__*/React.createElement(__ds_scope.HomeScreen, {
    onOpenThread: () => setOverlay("homeroom"),
    onReview: () => setOverlay("decision"),
    decided: decided
  }), tab === "journey" && /*#__PURE__*/React.createElement(__ds_scope.JourneyScreen, {
    onReview: () => setOverlay("decision")
  }), tab === "photos" && /*#__PURE__*/React.createElement(__ds_scope.QuietState, {
    icon: "images",
    title: "Photos",
    message: "Every real photo your builder shares lands here. Nothing new today."
  }), tab === "money" && /*#__PURE__*/React.createElement(__ds_scope.QuietState, {
    icon: "wallet",
    title: "Money",
    message: "No new charges. Every change shows here \u2014 only after you approve it."
  })), /*#__PURE__*/React.createElement(__ds_scope.BottomNav, {
    items: NAV,
    active: tab,
    onChange: k => {
      setTab(k);
      setOverlay(null);
    }
  }), overlay === "homeroom" && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.HomeRoomScreen, {
    onBack: () => setOverlay(null),
    onReview: () => setOverlay("decision")
  })), overlay === "decision" && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.DecisionScreen, {
    onBack: () => setOverlay(null),
    onChoose: choice => {
      setDecided(choice);
      setOverlay(null);
      setTab("home");
    }
  })));
}
Object.assign(__ds_scope, { AppShell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/homeowner/AppShell.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.DecisionCard = __ds_scope.DecisionCard;

__ds_ns.EvidenceCard = __ds_scope.EvidenceCard;

__ds_ns.QuietState = __ds_scope.QuietState;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.PhotoTile = __ds_scope.PhotoTile;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.TimeBar = __ds_scope.TimeBar;

__ds_ns.AppShell = __ds_scope.AppShell;

__ds_ns.DecisionScreen = __ds_scope.DecisionScreen;

__ds_ns.HomeRoomScreen = __ds_scope.HomeRoomScreen;

__ds_ns.HomeScreen = __ds_scope.HomeScreen;

__ds_ns.JourneyScreen = __ds_scope.JourneyScreen;

})();
