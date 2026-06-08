import * as React from "react";
import { IconName } from "../icon/Icon";

export interface BottomNavItem {
  key: string;
  icon: IconName;
  label: string;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  /** key of the active item. */
  active?: string;
  onChange?: (key: string) => void;
  style?: React.CSSProperties;
}

/** The calm bottom shell — icon + label, active item sage-green, >=48px targets. */
export function BottomNav(props: BottomNavProps): JSX.Element;
