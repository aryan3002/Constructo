import * as React from "react";
import { IconName } from "../icon/Icon";

/**
 * The signature pre-briefed choice. Calm amber (never red); the primary action stays green.
 * @startingPoint section="Cards" subtitle="Pre-briefed amber decision prompt" viewport="700x210"
 */
export interface DecisionCardProps {
  title: string;
  /** Why-now line, e.g. "Tiling begins in ~4 days". */
  whenLabel?: string;
  whenIcon?: IconName;
  reviewLabel?: string;
  onReview?: () => void;
  style?: React.CSSProperties;
}

/**
 * The signature pre-briefed choice. Calm amber (never red); the primary action
 * stays green. Use for any "a choice for you" prompt in-thread or on Home.
 */
export function DecisionCard(props: DecisionCardProps): JSX.Element;
