import * as React from "react";

export interface PhotoTileProps {
  /** Real photo URL (a human took it). Omit to show a labelled placeholder. */
  src?: string;
  alt?: string;
  /** Tile height in px. Default 120. */
  height?: number;
  radius?: string;
  rounded?: string;
  /** Count badge, e.g. "+6". */
  count?: string | number;
  /** Caption overlaid on a bottom protection gradient. */
  caption?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** Real-photo tile (never AI/3D renders). Optional count badge + caption. */
export function PhotoTile(props: PhotoTileProps): JSX.Element;
