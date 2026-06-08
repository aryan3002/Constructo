import * as React from "react";

/**
 * The "show proof" card — a curated published update backed by real photos.
 * @startingPoint section="Cards" subtitle="Published update with photo proof" viewport="700x200"
 */
export interface EvidenceCardProps {
  title: string;
  date?: string;
  /** Number of photos — shown as "N photos" and a "+N" tile badge. */
  photoCount?: number;
  /** Real photo URL for the thumb. */
  thumbSrc?: string;
  proofLabel?: string;
  tagWord?: string;
  onShowProof?: () => void;
  style?: React.CSSProperties;
}

/**
 * The "show proof" card — a curated published update backed by real photos.
 */
export function EvidenceCard(props: EvidenceCardProps): JSX.Element;
