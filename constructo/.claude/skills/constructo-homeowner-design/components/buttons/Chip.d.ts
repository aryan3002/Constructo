import * as React from "react";
import { IconName } from "../icon/Icon";

export interface ChipProps {
  icon?: IconName;
  children?: React.ReactNode;
  /** "accent" highlights the AI "Ask" affordance. */
  tone?: "neutral" | "accent";
  selected?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

/** A small pill for quick actions (Ask, Request a visit, Flag) and lightweight toggles. */
export function Chip(props: ChipProps): JSX.Element;
