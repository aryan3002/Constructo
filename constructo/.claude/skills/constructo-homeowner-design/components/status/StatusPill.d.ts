import * as React from "react";
import { IconName } from "../icon/Icon";

export type StatusKind = "ontrack" | "milestone" | "needsyou" | "delay" | "progress" | "quiet";

export interface StatusPillProps {
  /** ontrack=green · milestone=clay · needsyou=amber · delay=RED (only) · progress/quiet=neutral. */
  status?: StatusKind;
  size?: "sm" | "md";
  /** Override the default icon for this status. */
  icon?: IconName;
  /** Override the default word. */
  children?: React.ReactNode;
  uppercase?: boolean;
  style?: React.CSSProperties;
}

/**
 * Enforces "status = color + icon + word" (never color alone) for sunlight,
 * colour-blindness and low literacy. Red is reserved for `delay` only.
 */
export function StatusPill(props: StatusPillProps): JSX.Element;
