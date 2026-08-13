export type MapDebugLayerAudit = {
  id: string;
  source: string | null;
  sourceLayer: string | null;
  visibility: string;
  opacity: unknown;
  renderedFeatureCount: number;
};

export type MapDebugGeometrySourceMode = 'auto' | 'asset' | 'runtime';

export type MapDebugSelectedGeometrySource = {
  source: 'building-asset' | 'runtime-provider' | 'none';
  reason: string;
  assetId: string | null;
  providerFeatureId: string | null;
  geometryType: string | null;
  polygonCount: number;
};

export type MapDebugEventLogEntry = {
  id: number;
  timestamp: string;
  label: string;
  details?: string;
};

export type MapDebugFeatureInspection = {
  featureId: string;
  sourceLayer: string | null;
  geometryType: string;
  renderHeight: unknown;
  renderMinHeight: unknown;
  polygonCount: number;
  isSelected: boolean;
  isContext: boolean;
  renderedByLayer: string;
} | null;

export type MapDebugInteractionState = {
  selectedListingId: string | null;
  hoveredListingId: string | null;
  selectedBuildingId: string | null;
  selectedBuildingKind: string | null;
  hoveredBuildingId: string | null;
  hoveredBuildingKind: string | null;
};

export type MapDebugControls = {
  showSelectedBuilding: boolean;
  showContextBuildings: boolean;
  showAllExtrusions: boolean;
  showPins: boolean;
  showRoads: boolean;
  showLabels: boolean;
  showBuildingIds: boolean;
  geometrySourceMode: MapDebugGeometrySourceMode;
};

export type MapDebugVenueState = {
  selectedListingName: string | null;
  selectedListingId: string | null;
  selectedBuildingId: string | null;
  venueLatitude: number | null;
  venueLongitude: number | null;
};

export type MapDebugResolverState = {
  totalBuildingCandidates: number;
  candidatesAfterRadiusFilter: number;
  candidatesAfterOverlapFilter: number;
  candidatesAfterDuplicateRemoval: number;
  finalContextBuildingCount: number;
  selectedBuildingId: string | null;
  executionTimeMs: number | null;
};

export type MapDebugRenderingState = {
  totalFillExtrusionLayers: number;
  selectedLayerRenderedFeatureCount: number;
  contextLayerRenderedFeatureCount: number;
  totalRenderedBuildingFeatures: number;
  currentSearchRadius: number;
  cameraZoom: number;
  cameraPitch: number;
  cameraBearing: number;
};

export type MapDebugCounters = {
  resolverSelectedCount: number;
  resolverContextCount: number;
  rendererSelectedCount: number;
  rendererContextCount: number;
  rendererAllExtrusionsCount: number;
};

export type MapDebugState = {
  kind: 'map-venue-arrival';
  controls: MapDebugControls;
  venue: MapDebugVenueState;
  resolver: MapDebugResolverState;
  rendering: MapDebugRenderingState;
  layerAudit: MapDebugLayerAudit[];
  selectedGeometrySource: MapDebugSelectedGeometrySource;
  counters: MapDebugCounters;
  featureInspection: MapDebugFeatureInspection;
  interaction: MapDebugInteractionState;
  eventLog: MapDebugEventLogEntry[];
};

export const defaultMapDebugControls: MapDebugControls = {
  showSelectedBuilding: true,
  showContextBuildings: true,
  showAllExtrusions: false,
  showPins: true,
  showRoads: true,
  showLabels: true,
  showBuildingIds: false,
  geometrySourceMode: 'auto',
};

export const MAP_DEBUG_STATE_EVENT = 'swingsphere:map-debug-state';
export const MAP_DEBUG_CONTROLS_EVENT = 'swingsphere:map-debug-controls';
