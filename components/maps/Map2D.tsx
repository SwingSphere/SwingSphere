import React, { useRef } from "react";
import MapEngineBase, {
  MapEngineBaseHandle,
  MapEngineBaseProps,
} from "./MapEngineBase";
import ResetViewButton from "./ResetViewButton";
import { WORLD_BEARING, WORLD_PITCH } from "../../lib/explorerCamera";

type Map2DProps = Omit<MapEngineBaseProps, "variant">;

const Map2D: React.FC<Map2DProps> = (props) => {
  const engineRef = useRef<MapEngineBaseHandle | null>(null);

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
      <MapEngineBase ref={engineRef} variant="2d" {...props} />
      <ResetViewButton onReset={handleResetView} />
    </div>
  );
};

export default Map2D;
