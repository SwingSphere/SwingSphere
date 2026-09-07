import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../components/ProductionGlobePage.tsx', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../src/features/globe/runtime/SwingSphereGlobe.js', import.meta.url), 'utf8');
const geoJsonLayerSource = readFileSync(new URL('../src/features/globe/runtime/CountryGeoJsonBorderLayer.js', import.meta.url), 'utf8');

test('hybrid alignment bench exposes each geospatial layer independently', () => {
  for (const label of [
    'Physical land GLB',
    'Pins + WGS84 anchors',
    'Authoritative GeoJSON',
    'Country ID / visual atlas',
    'Country ID texture',
    'Visual country atlas',
    'Selected-country mask',
    'Set all +1.5°',
  ]) {
    assert.match(pageSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('verified hybrid baseline keeps GeoJSON at zero and shifts pins plus atlas', () => {
  assert.match(
    pageSource,
    /pins:\s*\{ longitudeOffsetDeg: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG, latitudeOffsetDeg: 0 \}/,
  );
  assert.match(
    pageSource,
    /countryGeoJson:\s*\{ longitudeOffsetDeg: 0, latitudeOffsetDeg: 0 \}/,
  );
  assert.match(
    pageSource,
    /countryAtlas:\s*\{ longitudeOffsetDeg: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG, latitudeOffsetDeg: 0 \}/,
  );
});

test('production uses the verified offsets without moving the GeoJSON raster', () => {
  assert.match(
    pageSource,
    /longitudeOffsetDeg: hybridPrototype[\s\S]*?: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG/,
  );
  assert.match(
    pageSource,
    /pinLongitudeOffsetDeg: hybridPrototype[\s\S]*?: GEOSPATIAL_BASELINE_LONGITUDE_OFFSET_DEG/,
  );
  assert.match(
    pageSource,
    /countryGeoJson:[\s\S]*?longitudeOffsetDeg: hybridPrototype[\s\S]*?: 0/,
  );
  assert.ok(
    geoJsonLayerSource.includes('THREE.MathUtils.degToRad(this.alignment.longitudeOffsetDeg)'),
    'GeoJSON must use its independent layer calibration.',
  );
  assert.ok(
    !geoJsonLayerSource.includes('Number(alignment.longitudeOffsetDeg ?? 0) + this.alignment.longitudeOffsetDeg'),
    'GeoJSON must not inherit the country-atlas offset.',
  );
});

test('visible WGS84 boundary layers do not inherit the pin offset', () => {
  assert.match(
    runtimeSource,
    /function createWgs84BoundaryConfig\(config\)[\s\S]*?pinLongitudeOffsetDeg:\s*Number\(countryGeoJson\.longitudeOffsetDeg \?\? 0\)/,
  );
  for (const layer of [
    'CountryVectorBorderLayer',
    'CountryVectorActivityLayer',
    'AdministrativeBoundaryLayer',
  ]) {
    assert.match(
      runtimeSource,
      new RegExp(`new ${layer}\\(\\{ renderer: this\\.renderer, config: wgs84BoundaryConfig \\}\\)`),
      `${layer} must use the authoritative GeoJSON projection rather than the pin projection.`,
    );
  }
});

test('hybrid calibration state reaches the matching runtime fields', () => {
  for (const binding of [
    'pinLongitudeOffsetDeg: hybridGeospatialCalibration.pins.longitudeOffsetDeg',
    'geoJsonLongitudeOffsetDeg: hybridGeospatialCalibration.countryGeoJson.longitudeOffsetDeg',
    'countryAtlasLongitudeOffsetDeg: hybridGeospatialCalibration.countryAtlas.longitudeOffsetDeg',
    'showCountryIdTexture: hybridAtlasAuditLayers.showCountryIdTexture',
    'showVisualCountryAtlas: hybridAtlasAuditLayers.showVisualCountryAtlas',
    'showCountryHighlightMask: hybridAtlasAuditLayers.showCountryHighlightMask',
  ]) {
    assert.ok(pageSource.includes(binding), `Missing page-to-runtime binding: ${binding}`);
  }

  assert.ok(runtimeSource.includes('alignmentPatch.pinLongitudeOffsetDeg = pinLongitude'));
  assert.ok(runtimeSource.includes('this.countryGeoJsonBorders?.updateAlignment'));
  assert.ok(runtimeSource.includes('this.countrySelection?.updateDebugView'));
  assert.ok(runtimeSource.includes('countryAtlasLongitudeOffsetDeg'));
});
