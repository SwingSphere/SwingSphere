const CARTO_BASEMAP_KEY = (import.meta.env.VITE_CARTO_BASEMAP_KEY ?? 'cb1_2frk_1_8c9919b56379f96b4d7feb1a').trim();

export const withCartoBasemapKey = (tileUrl: string) => {
  if (!CARTO_BASEMAP_KEY) {
    if (import.meta.env.DEV) {
      console.warn('VITE_CARTO_BASEMAP_KEY is not configured; CARTO raster tiles may show a watermark.');
    }
    return tileUrl;
  }

  const separator = tileUrl.includes('?') ? '&' : '?';
  return `${tileUrl}${separator}key=${encodeURIComponent(CARTO_BASEMAP_KEY)}`;
};
