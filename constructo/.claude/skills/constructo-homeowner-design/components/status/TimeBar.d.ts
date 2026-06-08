import * as React from "react";

/**
 * Position in TIME — never a percentage or progress ring.
 * @startingPoint section="Status" subtitle="Start → Handover time-bar (not a ring)" viewport="700x160"
 */
export interface TimeBarProps {
  /** Ordered phase names, e.g. ["Foundation","Brickwork","Plaster","Finish","Handover"]. */
  phases: string[];
  /** Index of the current phase (0-based). */
  current?: number;
  startLabel?: string;
  endLabel?: string;
  /** Show the current phase name + "you are here" line below the bar. */
  showPhase?: boolean;
  style?: React.CSSProperties;
}

/**
 * Position in TIME — never a percentage or progress ring (a frozen % manufactures
 * anxiety). Segmented Start -> Handover bar with a warm you-are-here marker.
 */
export function TimeBar(props: TimeBarProps): JSX.Element;
