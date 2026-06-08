import * as React from "react";

export interface CardProps {
  variant?: "plain" | "letter" | "quiet";
  padding?: string;
  elevated?: boolean;
  as?: keyof JSX.IntrinsicElements;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** The base warm surface container — hairline border, gentle lift, paper inset. */
export function Card(props: CardProps): JSX.Element;
