import * as React from "react";
import { IconName } from "../icon/Icon";

/**
 * Props for the calm primary action.
 * @startingPoint section="Buttons" subtitle="Primary / secondary / ghost actions" viewport="700x340"
 */
export interface ButtonProps {
  /** primary = sage-green (default). celebrate = clay (milestones only). secondary = sand surface. ghost = text-only. */
  variant?: "primary" | "celebrate" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  /** Leading icon name. */
  icon?: IconName;
  /** Trailing icon name (e.g. "arrow-right"). */
  iconRight?: IconName;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * The primary calm action. Green = primary actions (locked role); use `celebrate`
 * (clay) only for milestone moments. Targets are >=48px. Never use red for actions.
 */
export function Button(props: ButtonProps): JSX.Element;
