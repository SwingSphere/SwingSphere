import React, { useRef, useEffect } from "react";
import MapEngineBase, {
  MapEngineBaseHandle,
  MapEngineBaseProps,
} from "./MapEngineBase";
import { createHexCustomLayer } from "../../lib/mapHexLayer";
import ResetViewButton from "./ResetViewButton";
import { WORLD_BEARING, WORLD_PITCH } from "../../lib/explorerCamera";

type Globe3DProps = Omit<MapEngineBaseProps, "variant">;

const Globe3D: React.FC<Globe3DProps> = (props) => {
  const engineRef = useRef<MapEngineBaseHandle | null>(null);

  useEffect(() => {
    const m = engineRef.current?.getMap();
    if (!m) return;

    const onStyleLoad = () => {
      try {
        const style = m.getStyle();
        const layers = style?.layers || [];
        const waterLayer = layers.find((l: any) => l.id === "water")?.id;
        const hexLayer = createHexCustomLayer({ globeRadius: 1 });
        if (hexLayer && !m.getLayer(hexLayer.id)) {
          if (waterLayer) {
            m.addLayer(hexLayer, waterLayer);
          } else {
            m.addLayer(hexLayer);
          }
        }
      } catch {
        // ignore
      }
    };

    m.on("style.load", onStyleLoad);
    return () => {
      m.off("style.load", onStyleLoad);
    };
  }, []);

  const handleResetView = () => {
    const m = engineRef.current?.getMap();
    if (!m) return;
    try {
      m.flyTo({
        center: [-98.5795, 39.8283],
        zoom: 3.5,
        bearing: WORLD_BEARING,
        pitch: WORLD_PITCH,
        speed: 0.6,
        essential: true,
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="absolute inset-0">
      <MapEngineBase ref={engineRef} variant="globe" {...props} />
      <ResetViewButton onReset={handleResetView} />
    </div>
  );
};

export default Globe3D;
