import React from "react";
import type { Listing } from "../../types";
import Map2D from "./Map2D";

export type MapInteractiveProps = {
  listings: Listing[];
  allListings: Listing[];
  hoveredId: string | null;
  onSelect: (listing: Listing) => void;
  onHover: (id: string | null) => void;
  onInView: (listingsInView: Listing[]) => void;
  onMapReady?: (map?: any) => void;
  onShowRedoSearchChange?: (show: boolean) => void;
  redoSearchToken: number;
};

const MapInteractive: React.FC<MapInteractiveProps> = (props) => {
  return <Map2D {...props} />;
};

export default MapInteractive;

