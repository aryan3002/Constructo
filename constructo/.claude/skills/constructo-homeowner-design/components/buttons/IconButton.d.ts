import * as React from "react";
import { IconName } from "../icon/Icon";

export interface IconButtonProps {
  icon: IconName;
  /** Accessible label — required (icon-only control). */
  label: string;
  tone?: "neutral" | "accent" | "bare";
  size?: "md" | "lg";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

/** A single-icon control with a guaranteed >=48px target (back, mic, camera, overflow). */
export function IconButton(props: IconButtonProps): JSX.Element;
