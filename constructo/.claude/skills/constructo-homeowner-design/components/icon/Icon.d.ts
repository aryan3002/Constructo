import * as React from "react";

export type IconName =
  | "check" | "circle-check" | "hand" | "clock" | "camera" | "mic" | "image" | "images"
  | "house" | "route" | "wallet" | "arrow-left" | "arrow-right" | "arrow-up" | "arrow-left-right"
  | "chevron-left" | "chevron-right" | "shield-check" | "badge-check" | "sparkles" | "message-circle"
  | "circle-help" | "calendar-check" | "flag" | "triangle-alert" | "volume-2" | "heart" | "wifi"
  | "battery-full" | "signal-high" | "x" | "plus" | "bell" | "user" | "play" | "sun" | "phone"
  | "map-pin" | "clipboard-check" | "hard-hat";

export interface IconProps {
  /** Icon name from the bundled Constructo set (Lucide path data). */
  name: IconName;
  /** Pixel size (square). Default 24. */
  size?: number;
  /** Stroke width. Default 1.85 (calm). */
  stroke?: number;
  /** Stroke color. Default "currentColor" — inherits text color. */
  color?: string;
  /** Accessible label. Omit for decorative icons (defaults to aria-hidden). */
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Constructo's bundled icon set — self-contained inline SVG (no CDN).
 * Line icons, calm 1.85 stroke, currentColor. Use everywhere an icon is needed
 * so status is always color + icon + word.
 */
export function Icon(props: IconProps): JSX.Element;

/** All available icon names. */
export const iconNames: IconName[];
