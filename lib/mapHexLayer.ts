import * as THREE from "three";
import * as h3 from "h3-js";

// Using any here to avoid pulling in Mapbox GL typings; Mapbox passes a Map
// instance into onAdd/render and we rely on the global mapboxgl.MercatorCoordinate
// for world coordinate conversions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHexCustomLayer(options?: {
  landMaskUrl?: string;
  globeRadius?: number;
}): any {
  const globeRadius = options?.globeRadius ?? 1;

  let camera: THREE.Camera | null = null;
  let scene: THREE.Scene | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let instancedMesh: THREE.InstancedMesh | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mapRef: any;
  let currentZoom = 0;

  const layer: any = {
    id: "hex-layer",
    type: "custom",
    renderingMode: "3d",

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onAdd(map: any, gl: WebGLRenderingContext) {
      mapRef = map;
      currentZoom = map.getZoom ? map.getZoom() : 0;

      camera = new THREE.Camera();
      scene = new THREE.Scene();

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      try {
        // Generate H3 cells at a moderate resolution.
        const resolution = 4;
        const latClamp = 65;

        const cellIds = new Set<string>();
        const res0 = h3.getRes0Cells() as string[];
        for (const root of res0) {
          const children = h3.cellToChildren(root, resolution) as string[];
          for (const c of children) {
            const [lat, lon] = h3.cellToLatLng(c) as [number, number];
            if (lat > latClamp || lat < -latClamp) continue;
            cellIds.add(c);
          }
        }

        const cells = Array.from(cellIds);
        if (!cells.length) {
          return;
        }

        // Base flat hex cap
        const baseRadius = 1;
        const geom = new THREE.CylinderGeometry(
          baseRadius,
          baseRadius,
          0.006,
          6,
        );
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color("#4a9ba8"),
          emissive: new THREE.Color("#4a9ba8"),
          emissiveIntensity: 0.16,
          metalness: 0.12,
          roughness: 0.42,
          transparent: true,
          opacity: 0.9,
        });

        instancedMesh = new THREE.InstancedMesh(geom, mat, cells.length);
        instancedMesh.frustumCulled = false;

        const up = new THREE.Vector3(0, 0, 1);
        const dummy = new THREE.Object3D();

        const toWorld = (lat: number, lon: number, radius: number) => {
          const g = (globalThis as any).mapboxgl;
          if (!g || !g.MercatorCoordinate) {
            return new THREE.Vector3(0, 0, 0);
          }
          const mc = g.MercatorCoordinate.fromLngLat([lon, lat], 0);
          const scale = radius / mc.meterInMercatorCoordinateUnits();
          return new THREE.Vector3(
            mc.x * scale,
            mc.y * scale,
            mc.z * scale,
          );
        };

        // Use a small, fixed world radius; can be refined with per-cell spacing.
        const hexRadiusWorld = 0.02;

        cells.forEach((id, i) => {
          const [lat, lon] = h3.cellToLatLng(id) as [number, number];

          const p = toWorld(lat, lon, globeRadius);
          dummy.position.copy(p);

          // Approximate surface normal
          const normal = p.clone().normalize();
          dummy.quaternion.setFromUnitVectors(up, normal);

          const scaleXY = hexRadiusWorld / baseRadius;
          dummy.scale.set(scaleXY, 1, scaleXY);

          dummy.updateMatrix();
          instancedMesh!.setMatrixAt(i, dummy.matrix);
        });

        instancedMesh.instanceMatrix.needsUpdate = true;

        const light = new THREE.DirectionalLight(0xffffff, 0.6);
        light.position.set(0, 0, 10);
        scene.add(light);

        scene.add(instancedMesh);

        if (map.on) {
          map.on("zoom", () => {
            currentZoom = map.getZoom();
          });
        }
      } catch {
        // Any error in hex generation should not break the main map.
        instancedMesh = null;
      }
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(gl: WebGLRenderingContext, matrix: number[]) {
      if (!renderer || !camera || !scene || !instancedMesh) return;

      const m = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
      camera.projectionMatrix = m;

      // Zoom-based fading: visible on globe, fade out into city zoom.
      const fadeStart = 3.0;
      const fadeEnd = 6.0;
      let alpha = 1.0;
      if (currentZoom >= fadeEnd) {
        alpha = 0.0;
      } else if (currentZoom > fadeStart) {
        const t = (currentZoom - fadeStart) / (fadeEnd - fadeStart);
        alpha = 1.0 - t;
      }

      const mat = instancedMesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.9 * alpha;
      mat.transparent = alpha < 1.0;

      renderer.resetState();
      renderer.render(scene, camera);
      if (mapRef && mapRef.triggerRepaint) {
        mapRef.triggerRepaint();
      }
    },
  };

  return layer;
}

