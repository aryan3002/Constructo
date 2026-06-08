import * as React from "react";

export interface AvatarProps {
  /** Person / builder name — used for initials and the a11y label. */
  name: string;
  /** Real photo URL (optional). */
  src?: string;
  size?: "sm" | "md" | "lg" | number;
  shape?: "rounded" | "circle";
  tone?: "clay" | "green" | "neutral";
  style?: React.CSSProperties;
}

/** Builder / person identity — real photo or tidy initials on a tinted square. */
export function Avatar(props: AvatarProps): JSX.Element;
