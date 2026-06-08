import * as React from "react";
import { IconName } from "../icon/Icon";

/**
 * The calm empty/quiet state — success as "earned absence".
 * @startingPoint section="Feedback" subtitle="Calm empty / quiet state" viewport="700x340"
 */
export interface QuietStateProps {
  icon?: IconName;
  title?: string;
  message?: string;
  /** Optional single gentle action (e.g. a ghost Button). */
  action?: React.ReactNode;
  tone?: "ontrack" | "quiet";
  style?: React.CSSProperties;
}

/**
 * The calm empty/quiet state — success as "earned absence". Never an error
 * tone, never red, never a nudge to engage.
 */
export function QuietState(props: QuietStateProps): JSX.Element;
