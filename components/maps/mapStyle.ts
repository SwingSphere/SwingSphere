import type { StyleSpecification } from 'maplibre-gl';

export const swingMapStyle: StyleSpecification = {
  version: 8,
  name: 'SwingSphere Dark',
  sources: {
    'carto-dark-base': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    'carto-dark-labels': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#05070a' },
    },
    {
      id: 'dark-basemap',
      type: 'raster',
      source: 'carto-dark-base',
      paint: {
        'raster-saturation': -0.42,
        'raster-contrast': 0.08,
        'raster-brightness-min': 0.01,
        'raster-brightness-max': 0.72,
      },
    },
    {
      id: 'dark-basemap-labels',
      type: 'raster',
      source: 'carto-dark-labels',
      paint: {
        'raster-saturation': -0.52,
        'raster-contrast': 0.06,
        'raster-brightness-max': 0.8,
        'raster-opacity': 0.78,
      },
    },
  ],
};
