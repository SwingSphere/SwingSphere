import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { Listing } from "../../types";
import { resolveCountryFlagEmoji } from "../../lib/formatting";
import { getListingPhysicalAddress } from "../../lib/entityCompatibility";
import { getListingDisplayCoords } from "../../lib/explorerMarkers";

declare const mapboxgl: any;

export type MapVariant = "globe" | "2d";

export type MapEngineBaseProps = {
  variant: MapVariant;
  listings: Listing[];
  allListings: Listing[];
  hoveredId: string | null;
  onSelect: (listing: Listing) => void;
  onHover: (id: string | null) => void;
  onInView: (listingsInView: Listing[]) => void;
  onMapReady?: (map: any) => void;
  onShowRedoSearchChange?: (show: boolean) => void;
  redoSearchToken: number;
};

export type MapEngineBaseHandle = {
  getMap: () => any | null;
};

export const MapEngineBase = forwardRef<MapEngineBaseHandle, MapEngineBaseProps>(
  (
    {
      variant,
      listings,
      allListings,
      hoveredId,
      onSelect,
      onHover,
      onInView,
      onMapReady,
      onShowRedoSearchChange,
      redoSearchToken,
    },
    ref,
  ) => {
    const mapContainer = useRef<HTMLDivElement | null>(null);
    const map = useRef<any>(null);
    const isMapLoadedRef = useRef(false);
    const lastHoveredOnMapRef = useRef<string | null>(null);
    const hoverPopupRef = useRef<any | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        getMap: () => map.current,
      }),
      [],
    );

    const listingsById = useMemo(
      () => new Map(allListings.map((l) => [l.id, l] as const)),
      [allListings],
    );

    const clearBuildingHighlight = useCallback(() => {
      if (!map.current) return;
      try {
        if (map.current.getLayer("highlight-building")) {
          map.current.setFilter("highlight-building", ["==", "osm_id", "NONE"]);
        }
        if (map.current.getLayer("highlight-building-glow")) {
          map.current.setFilter("highlight-building-glow", [
            "==",
            "osm_id",
            "NONE",
          ]);
        }
      } catch {
        // ignore
      }
    }, []);

    const highlightBuildingForListing = useCallback(
      (listing: Listing) => {
        if (!map.current) return;

        const zoom = map.current.getZoom?.() ?? 0;
        if (zoom < 14) {
          clearBuildingHighlight();
          return;
        }

        const coords = getListingDisplayCoords(listing);
        if (!coords) {
          clearBuildingHighlight();
          return;
        }
        const screenPoint = map.current.project([coords.lng, coords.lat]);

        const features = map.current.queryRenderedFeatures(screenPoint, {
          layers: ["3d-buildings"],
        });

        if (!features.length) {
          clearBuildingHighlight();
          return;
        }

        const building = features[0] as any;
        const osmId = building.properties?.osm_id;

        if (!osmId) {
          clearBuildingHighlight();
          return;
        }

        try {
          map.current.setFilter("highlight-building", ["==", "osm_id", osmId]);
          map.current.setFilter("highlight-building-glow", [
            "==",
            "osm_id",
            osmId,
          ]);
        } catch {
          // ignore
        }
      },
      [clearBuildingHighlight],
    );

    const updateListingsInView = useCallback(() => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      const feats = map.current.queryRenderedFeatures({
        layers: ["unclustered-point"],
      });
      const ids = Array.from(
        new Set(
          feats
            .map((f: any) => f?.properties?.id)
            .filter((v: unknown): v is string => typeof v === "string"),
        ),
      );
      const inView = ids
        .map((id) => listingsById.get(id))
        .filter((l): l is Listing => !!l);
      onInView(inView);
    }, [listingsById, onInView]);

    useEffect(() => {
      if (
        typeof window === "undefined" ||
        map.current ||
        !mapContainer.current
      )
        return;

      const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
      if (!mapboxAccessToken) {
        console.warn("[SwingSphere map] VITE_MAPBOX_ACCESS_TOKEN is not configured.");
        return;
      }
      mapboxgl.accessToken = mapboxAccessToken;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-98.5795, 39.8283],
        zoom: 3.5,
        projection: variant === "globe" ? "globe" : "mercator",
      });

      map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
      if (window.isSecureContext) {
        map.current.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
          }),
          "top-right",
        );
      }

      hoverPopupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -12],
        className: "swing-popup",
      });

      const updateStyleForZoom = (zoom: number) => {
        const m = map.current;
        if (!m) return;

        const style = m.getStyle();
        const layers = style?.layers || [];

        if (variant === "globe") {
          layers.forEach((layer: any) => {
            const id = layer.id as string;
            const type = layer.type as string;
            if (!m.getLayer(id)) return;

            const lowerId = id.toLowerCase();
            const isPlaceLabel =
              type === "symbol" && lowerId.includes("place-label");
            const isStreetLabel =
              type === "symbol" &&
              (lowerId.includes("road-label") ||
                lowerId.includes("street") ||
                lowerId.includes("highway"));
            const isPoiLabel =
              type === "symbol" &&
              (lowerId.includes("poi-label") || lowerId.includes("poi"));

            try {
              if (isPlaceLabel) {
                m.setLayoutProperty(
                  id,
                  "visibility",
                  zoom < 5 ? "none" : "visible",
                );
              } else if (isStreetLabel) {
                m.setLayoutProperty(
                  id,
                  "visibility",
                  zoom < 10 ? "none" : "visible",
                );
              } else if (isPoiLabel) {
                m.setLayoutProperty(
                  id,
                  "visibility",
                  zoom < 12 ? "none" : "visible",
                );
              }
            } catch {
              // ignore per-layer failures
            }
          });

          try {
            if (m.getLayer("admin-0-boundary")) {
              m.setPaintProperty(
                "admin-0-boundary",
                "line-color",
                "#ff3f7a",
              );
              m.setPaintProperty("admin-0-boundary", "line-width", 2);
              m.setLayoutProperty("admin-0-boundary", "visibility", "visible");
            }
          } catch {
            // ignore
          }
        }

        try {
          if (m.getLayer("background")) {
            m.setPaintProperty(
              "background",
              "background-color",
              variant === "globe" ? "#02070A" : "#0a0a0a",
            );
          }
        } catch {
          // ignore
        }
      };

      map.current.on("style.load", () => {
        const m = map.current;
        if (!m) return;

        if (variant === "globe") {
          try {
            m.setFog({
              color: "rgb(2,7,10)",
              "high-color": "rgb(0,0,0)",
              "space-color": "rgb(0,0,0)",
              "horizon-blend": 0.04,
              "star-intensity": 0.0,
            });
          } catch {
            // ignore fog failures
          }
        } else {
          try {
            m.setFog(null);
          } catch {
            // ignore
          }
        }

        const style = m.getStyle();
        const layers = style?.layers || [];

        try {
          m.setPaintProperty(
            "background",
            "background-color",
            variant === "globe" ? "#02070A" : "#0a0a0a",
          );
        } catch {
          // ignore
        }

        const waterLayer = layers.find((l: any) => l.id === "water")?.id;

        if (!m.getLayer("ocean-base")) {
          try {
            if (waterLayer) {
              m.addLayer(
                {
                  id: "ocean-base",
                  type: "background",
                  paint: { "background-color": "#02070A" },
                },
                waterLayer,
              );
            } else {
              m.addLayer({
                id: "ocean-base",
                type: "background",
                paint: { "background-color": "#02070A" },
              });
            }
          } catch {
            // ignore
          }
        }

        if (!m.getLayer("land-shade")) {
          try {
            m.addLayer(
              {
                id: "land-shade",
                type: "fill",
                source: "composite",
                "source-layer": "landcover",
                paint: {
                  "fill-color": "#0a0f14",
                  "fill-opacity": 1,
                },
              },
              waterLayer,
            );
          } catch {
            // ignore
          }
        }

        if (!m.getLayer("3d-buildings")) {
          try {
            m.addLayer({
              id: "3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#1c1f25",
                "fill-extrusion-height": ["get", "height"],
                "fill-extrusion-base": ["get", "min_height"],
                "fill-extrusion-opacity": 1.0,
              },
            });

            m.addLayer(
              {
                id: "highlight-building",
                type: "fill-extrusion",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "osm_id", "NONE"],
                paint: {
                  "fill-extrusion-color": "#ff3f7a",
                  "fill-extrusion-height": ["get", "height"],
                  "fill-extrusion-base": ["get", "min_height"],
                  "fill-extrusion-opacity": 1.0,
                },
              },
              "3d-buildings",
            );

            m.addLayer(
              {
                id: "highlight-building-glow",
                type: "fill-extrusion",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "osm_id", "NONE"],
                paint: {
                  "fill-extrusion-color": "#ff3f7a",
                  "fill-extrusion-height": ["+", ["get", "height"], 35],
                  "fill-extrusion-base": ["get", "height"],
                  "fill-extrusion-opacity": 0.35,
                },
              },
              "highlight-building",
            );
          } catch {
            // ignore
          }
        }

        updateStyleForZoom(m.getZoom());
      });

      const onLoad = () => {
        if (!map.current) return;

        map.current.addSource("listings", {
          type: "geojson",
          promoteId: "id",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        map.current.addLayer({
          id: "clusters-glow",
          type: "circle",
          source: "listings",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#ff3f7a",
            "circle-radius": 25,
            "circle-opacity": 0.2,
            "circle-blur": 0.8,
          },
        });

        map.current.addLayer({
          id: "clusters",
          type: "circle",
          source: "listings",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#ff3f7a",
            "circle-radius": 15,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.current.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "listings",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
          paint: {
            "text-color": "#ffffff",
          },
        });

        map.current.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "listings",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "#f87171",
              [
                "match",
                ["get", "type"],
                "club",
                "#ef4444",
                "event",
                "#3b82f6",
                "#cccccc",
              ],
            ],
          },
        });

        isMapLoadedRef.current = true;
        onMapReady?.(map.current);

        ["clusters", "unclustered-point"].forEach((layer) => {
          map.current.on("mouseenter", layer, () => {
            map.current.getCanvas().style.cursor = "pointer";
          });
          map.current.on("mouseleave", layer, () => {
            map.current.getCanvas().style.cursor = "";
          });
        });

        map.current.on("click", "clusters", (e: any) => {
          const features = map.current.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          });
          const clusterId = features[0].properties.cluster_id;
          map.current
            .getSource("listings")
            .getClusterExpansionZoom(
              clusterId,
              (err: any, zoom: number) => {
                if (err) return;
                map.current.easeTo({
                  center: features[0].geometry.coordinates,
                  zoom,
                });
              },
            );
        });

        map.current.on("click", "unclustered-point", (e: any) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          const listing = listingsById.get(id);
          if (listing) {
            try {
              const coords = getListingDisplayCoords(listing);
              if (!coords) return;
              const isPrivate =
                listing.type === "event" && listing.isAddressPrivate;

              const globeOptions = {
                center: [coords.lng, coords.lat],
                zoom: isPrivate ? 10 : 17.5,
                pitch: isPrivate ? 45 : 65,
                bearing: isPrivate ? 20 : 30,
                speed: 0.8,
                curve: 1.4,
                essential: true,
              };

              const map2dOptions = {
                center: [coords.lng, coords.lat],
                zoom: isPrivate ? 10 : 16,
                pitch: 60,
                bearing: 20,
                speed: 0.8,
                curve: 1.4,
                essential: true,
              };

              map.current.flyTo(
                variant === "globe" ? globeOptions : map2dOptions,
              );
            } catch {
              // ignore flyTo failures
            }

            highlightBuildingForListing(listing);
            onSelect(listing);
          }
        });

        let lastHoverIdOnMap: string | null = null;
        map.current.on("mousemove", "unclustered-point", (e: any) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          if (lastHoverIdOnMap && lastHoverIdOnMap !== id) {
            map.current.setFeatureState(
              { source: "listings", id: lastHoverIdOnMap },
              { hover: false },
            );
          }
          map.current.setFeatureState(
            { source: "listings", id },
            { hover: true },
          );
          lastHoverIdOnMap = id;
          onHover(id);

          const listing = listingsById.get(id);
          if (listing && hoverPopupRef.current) {
            const coords = getListingDisplayCoords(listing);
            if (!coords) return;
            const address = getListingPhysicalAddress(listing);
            const city = address.city ?? "";
            const region = address.region ?? "";
            const country = address.country ?? "";
            const emoji = resolveCountryFlagEmoji(country);
            const emojiPrefix = emoji ? `${emoji} ` : "";
            hoverPopupRef.current
              .setLngLat([coords.lng, coords.lat])
              .setHTML(
                `<div class="popup-hover">${emojiPrefix}${city}${
                  region ? ", " + region : ""
                }</div>`,
              )
              .addTo(map.current);
          }
        });

        map.current.on("mouseleave", "unclustered-point", () => {
          if (lastHoverIdOnMap) {
            map.current.setFeatureState(
              { source: "listings", id: lastHoverIdOnMap },
              { hover: false },
            );
          }
          lastHoverIdOnMap = null;
          onHover(null);
          try {
            hoverPopupRef.current?.remove();
          } catch {
            // ignore
          }
        });

        map.current.on("dragend", () => {
          onShowRedoSearchChange?.(true);
        });
        map.current.on("zoomend", () => {
          onShowRedoSearchChange?.(true);
          updateStyleForZoom(map.current.getZoom());
          updateListingsInView();
        });
      };

      map.current.on("load", onLoad);

      return () => {
        try {
          map.current?.off("load", onLoad);
          map.current?.remove();
        } catch {
          // noop
        }
        map.current = null;
        isMapLoadedRef.current = false;
      };
    }, [
      listingsById,
      onSelect,
      onHover,
      onMapReady,
      onShowRedoSearchChange,
      updateListingsInView,
      variant,
      highlightBuildingForListing,
    ]);

    useEffect(() => {
      if (!isMapLoadedRef.current || !map.current?.getSource("listings")) return;
      const geojson = {
        type: "FeatureCollection",
        features: listings
          .map((listing) => {
            const coords = getListingDisplayCoords(listing);
            if (!coords) return null;
            return {
              type: "Feature",
              id: listing.id,
              properties: { id: listing.id, type: listing.type },
              geometry: {
                type: "Point",
                coordinates: [coords.lng, coords.lat],
              },
            };
          })
          .filter((feature) => feature !== null),
      };
      map.current.getSource("listings").setData(geojson);
      map.current.once("idle", () => {
        updateListingsInView();
        onShowRedoSearchChange?.(false);
      });
    }, [listings, updateListingsInView, onShowRedoSearchChange]);

    useEffect(() => {
      if (!isMapLoadedRef.current) return;
      updateListingsInView();
      onShowRedoSearchChange?.(false);
    }, [redoSearchToken, updateListingsInView, onShowRedoSearchChange]);

    useEffect(() => {
      if (!map.current) return;
      const prev = lastHoveredOnMapRef.current;
      if (prev && prev !== hoveredId) {
        map.current.setFeatureState(
          { source: "listings", id: prev },
          { hover: false },
        );
      }
      if (hoveredId) {
        map.current.setFeatureState(
          { source: "listings", id: hoveredId },
          { hover: true },
        );
      }
      lastHoveredOnMapRef.current = hoveredId ?? null;
    }, [hoveredId]);

    return <div ref={mapContainer} className="absolute inset-0" />;
  },
);

MapEngineBase.displayName = "MapEngineBase";

export default MapEngineBase;
