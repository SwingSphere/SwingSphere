import type { Listing, VenueData, BuildingAsset } from '../../../types';

export type BuildingInspectorViewMode = '3d' | '2d';
export type BuildingInspectorSelectionMode = 'single' | 'multi';

export type BuildingInspectorWorkspaceMode = 'provider' | 'manual_massing';
export type ManualMassingDrawTool = 'select' | 'rectangle' | 'polygon';
export type ManualMassingRole = 'ambient' | 'venue_candidate';

export interface ManualMassingObject {
  id: string;
  name: string;
  role: ManualMassingRole;
  heightMeters: number;
  minHeightMeters?: number;
  // Local 2D coordinates in meters [x, z] relative to scene origin
  localCoordinates: [number, number][];
  // Geographic GeoJSON Polygon coordinates in [lng, lat]
  geoJson: GeoJSON.Polygon;
  areaMeters: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceImageState {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  aspect: number;
  position: { x: number; z: number }; // meters in Three.js scene
  rotationDeg: number;
  scaleMeters: number; // width in world meters
  opacity: number; // 0.0 - 1.0
  isLocked: boolean;
  isVisible: boolean;
}

export interface VenueAmbientMassingSession {
  venueId: string;
  version: 1;
  updatedAt: string;
  objects: ManualMassingObject[];
}

export type BuildingInspectorLayoutState = {
  leftWidth: number;
  rightWidth: number;
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
};

export type StepperStepId = 'place' | 'location' | 'footprint' | 'save';

export type StepperStepStatus = 'complete' | 'warning' | 'info' | 'pending' | 'blocked' | 'ready';

export type StepperStep = {
  id: StepperStepId;
  label: string;
  shortLabel: string;
  status: StepperStepStatus;
  detail?: string;
};
