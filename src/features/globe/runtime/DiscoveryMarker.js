import { createMarkerStyle, GlobeMarker } from "./GlobeMarker.js";

export class DiscoveryMarker {
  constructor({ region, position, radialDirection, config, referenceDistance, globeRadius }) {
    this.region = region;
    this.isSingleListing = (region.listingIds || []).length === 1;
    const entityType = this.isSingleListing ? region.singleEntityType : null;
    const palette = entityType === "club"
      ? { base: "#E3263E", active: "#FF5367" }
      : entityType === "event"
        ? { base: "#D6A62E", active: "#F4C95D" }
        : { base: config.colors.lightText, active: config.colors.accent };
    this.marker = new GlobeMarker({
      id: region.id,
      labelTitle: this.isSingleListing ? (region.singleListingName || region.name) : region.name,
      labelSubtitle: this.isSingleListing ? region.name : formatCount(region),
      labelLogoUrl: this.isSingleListing ? (region.singleListingLogoUrl || "") : "",
      position,
      radialDirection,
      config,
      referenceDistance,
      markerType: "region",
      variant: entityType ?? (this.isSingleListing ? "singleListingRegion" : "clusterRegion"),
      styleOverrides: createMarkerStyle(config, {
        stemEmissive: palette.base,
        stemSelectedColor: palette.active,
        tipColor: palette.base,
        tipHoverColor: palette.active,
        tipSelectedColor: palette.active,
        glowColor: palette.active,
        rippleColor: config.colors.lightText,
        showLabel: true,
        hoverOpacity: 1,
        hoverScale: this.isSingleListing ? 1.5 : 1.42,
        hoverLengthScale: this.isSingleListing ? 2.45 : 2.2,
        hoverLift: globeRadius * 0.018,
        glowHoverOpacityFactor: 0.22,
        hoverLabelOpacity: 0.96
      }, globeRadius)
    });

    // Compatibility aliases used by ActivityRegionManager.
    this.group = this.marker.group;
    this.hitTarget = this.marker.hitTarget;
    this.label = this.marker.label;
  }

  update(state) {
    this.marker.update(state);
  }

  getWorldPosition(target) {
    return this.marker.getWorldPosition(target);
  }

  dispose() {
    this.marker.dispose();
  }
}

function formatCount(region) {
  const parts = [];
  if (region.clubCount) parts.push(`${region.clubCount} club${region.clubCount === 1 ? "" : "s"}`);
  if (region.eventCount) parts.push(`${region.eventCount} event${region.eventCount === 1 ? "" : "s"}`);
  return parts.join(" / ") || `${region.listingIds.length} listing${region.listingIds.length === 1 ? "" : "s"}`;
}
