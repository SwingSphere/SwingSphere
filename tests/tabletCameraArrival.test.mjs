import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraFocusController } from '../src/features/globe/runtime/CameraFocusController.js';
import { createGlobeRuntimeConfig } from '../src/features/globe/runtime/GlobeRuntimeConfig.js';

function setup(aspect, anchor) {
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.01, 100);
  camera.position.set(0, 0.45, 10);
  const events = { addEventListener() {}, removeEventListener() {} };
  const controls = new OrbitControls(camera, {
    ...events, style: {}, getRootNode: () => events,
  });
  controls.minDistance = 3;
  controls.maxDistance = 20;
  controls.enableDamping = true;
  const config = createGlobeRuntimeConfig();
  Object.assign(config.cameraFocus.heroArrival, {
    useViewOffset: false, destinationAnchor: anchor, fov: 34,
    heroStage: { distance: 5.85, tiltDegrees: 40, headingDegrees: -6 },
  });
  const focus = new CameraFocusController({
    camera, controls, config, globe: new THREE.Group(), globeRadius: 2.55,
  });
  return { camera, controls, focus };
}

// City-level directions only; framing must work independently of exact listing coordinates.
for (const [city, lat, lon] of [
  ['Mexico City', 19.4, -99.1], ['Sydney', -33.9, 151.2], ['San Francisco', 37.8, -122.4],
]) {
  for (const aspect of [768 / 1024, 1024 / 768]) {
    test(`${city}, aspect ${aspect}: translated arrival preserves tilt and lands continuously`, () => {
      const anchor = { x: 0.35, y: 0.425 };
      const { camera, controls, focus } = setup(aspect, anchor);
      const world = new THREE.Vector3().setFromSphericalCoords(
        2.55, THREE.MathUtils.degToRad(90 - lat), THREE.MathUtils.degToRad(lon),
      );
      const baseline = setup(aspect);
      baseline.focus.focus(world, 0, { arrivalMode: 'accurate-center' });
      const origin = camera.position.clone();
      focus.focus(world, 0, { arrivalMode: 'accurate-center' });
      assert.ok(camera.position.distanceTo(origin) < 1e-12, 'planning does not move the live camera');
      const direction = focus.animation.toCameraPosition.clone().sub(focus.animation.toTarget);
      assert.ok(direction.distanceTo(baseline.focus.animation.toCameraPosition) < 1e-10,
        'pan preserves the original tilted camera direction and orbit distance');
      const duration = focus.animation.duration;
      for (let frame = 0; frame < 120; frame++) focus.update(duration * frame / 120);
      focus.update(duration * (1 - 1e-5));
      const beforeEnd = camera.position.clone();
      focus.update(duration);
      assert.ok(camera.position.distanceTo(beforeEnd) < 1e-8, 'no completion snap');
      camera.updateMatrixWorld(true);
      const projected = world.clone().project(camera);
      assert.ok(Math.abs((projected.x + 1) / 2 - anchor.x) < 1e-10);
      assert.ok(Math.abs((1 - projected.y) / 2 - anchor.y) < 1e-10);
      controls.update();
      assert.ok(camera.position.distanceTo(focus.animation.toCameraPosition) < 1e-10,
        'OrbitControls keeps the translated endpoint');
      controls.dispose();
      baseline.controls.dispose();
    });
  }
}

test('without the tablet opt-in, hero arrival retains the globe-center target', () => {
  const { controls, focus } = setup(390 / 844);
  focus.focus(new THREE.Vector3(0, 0, 2.55), 0, { arrivalMode: 'accurate-center' });
  assert.deepEqual(focus.animation.toTarget.toArray(), [0, 0, 0]);
  controls.dispose();
});
