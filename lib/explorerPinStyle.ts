export const EXPLORER_PIN_IMAGE_ID = 'swingsphere-explorer-pin';
export const EXPLORER_PIN_SELECTED_IMAGE_ID = 'swingsphere-explorer-pin-selected';
export const EXPLORER_DISCOVERY_MARKER_IMAGE_ID = 'swingsphere-explorer-discovery-marker';
export const EXPLORER_DISCOVERY_MARKER_SELECTED_IMAGE_ID = 'swingsphere-explorer-discovery-marker-selected';

export const explorerPinTokens = {
  accent: '#C51D34',
  accentSelected: '#FF4D5E',
  tip: '#C7CDD6',
  light: '#F5F5F5',
  graphite: '#0F1115',
  idleScale: 0.88,
  idleOpacity: 0.58,
  hoverOpacity: 0.74,
  selectedOpacity: 1,
  hoverScale: 1.1,
  selectedScale: 1.28,
  clusterScale: 1.08,
} as const;

type PinImageOptions = {
  selected?: boolean;
  cluster?: boolean;
};

export const createExplorerDiscoveryMarkerImage = ({ selected = false }: { selected?: boolean } = {}): ImageData => {
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size * pixelRatio;
  canvas.height = size * pixelRatio;
  const context = canvas.getContext('2d');
  if (!context) return new ImageData(canvas.width, canvas.height);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = 33;
  const color = selected ? explorerPinTokens.accentSelected : '#FFFFFF';
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 6;
  context.lineJoin = 'round';
  context.shadowColor = color;
  context.shadowBlur = 11;
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 3;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
  context.shadowBlur = 7;
  context.beginPath();
  context.arc(center, center, 3.4, 0, Math.PI * 2);
  context.fill();
  context.restore();

  return context.getImageData(0, 0, canvas.width, canvas.height);
};

export type ClusterCategory = 'club' | 'event' | 'promoter' | 'resort' | 'cruise' | 'all';

export const clusterCategoryColors: Record<ClusterCategory, { accent: string; dark: string; glow: string }> = {
  club: { accent: '#FF4D5E', dark: 'rgba(54, 10, 18, 0.94)', glow: 'rgba(255, 77, 94, 0.44)' },
  event: { accent: '#F4C95D', dark: 'rgba(46, 36, 12, 0.94)', glow: 'rgba(244, 201, 93, 0.44)' },
  promoter: { accent: '#75B2FF', dark: 'rgba(12, 28, 54, 0.94)', glow: 'rgba(117, 178, 255, 0.44)' },
  resort: { accent: '#86EFAC', dark: 'rgba(12, 42, 24, 0.94)', glow: 'rgba(134, 239, 172, 0.44)' },
  cruise: { accent: '#C4B5FD', dark: 'rgba(32, 18, 54, 0.94)', glow: 'rgba(196, 181, 253, 0.44)' },
  all: { accent: '#FF4D5E', dark: 'rgba(54, 10, 18, 0.94)', glow: 'rgba(255, 77, 94, 0.44)' },
};

export const getExplorerClusterImageId = (category: ClusterCategory = 'all', selected = false): string =>
  `swingsphere-explorer-cluster-${category}${selected ? '-selected' : ''}`;

export const EXPLORER_CLUSTER_PIN_IMAGE_ID = getExplorerClusterImageId('all', false);
export const EXPLORER_CLUSTER_SELECTED_IMAGE_ID = getExplorerClusterImageId('all', true);

function drawClusterRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawCategoryGlyph(
  context: CanvasRenderingContext2D,
  category: ClusterCategory,
  center: number,
  accent: string,
) {
  switch (category) {
    case 'club': {
      // Architectural venue silhouette with entrance portal
      context.save();
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 1.6;
      context.lineJoin = 'round';
      context.lineCap = 'round';

      context.beginPath();
      context.moveTo(center - 7, center + 6.5);
      context.lineTo(center - 7, center - 1);
      context.lineTo(center, center - 6.5);
      context.lineTo(center + 7, center - 1);
      context.lineTo(center + 7, center + 6.5);
      context.closePath();
      context.stroke();

      context.beginPath();
      context.arc(center, center + 2.5, 2.4, Math.PI, 0, false);
      context.lineTo(center + 2.4, center + 6.5);
      context.lineTo(center - 2.4, center + 6.5);
      context.closePath();
      context.fill();
      context.restore();
      break;
    }
    case 'event': {
      // Calendar badge with binder rings and date star
      context.save();
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 1.5;
      context.lineJoin = 'round';
      context.lineCap = 'round';

      drawClusterRoundedRect(context, center - 7, center - 4, 14, 11, 2);
      context.stroke();

      context.beginPath();
      context.moveTo(center - 4, center - 6.5);
      context.lineTo(center - 4, center - 3.5);
      context.moveTo(center + 4, center - 6.5);
      context.lineTo(center + 4, center - 3.5);
      context.stroke();

      context.beginPath();
      context.moveTo(center - 7, center - 0.5);
      context.lineTo(center + 7, center - 0.5);
      context.stroke();

      context.beginPath();
      context.arc(center, center + 3.2, 1.8, 0, Math.PI * 2);
      context.fill();
      context.restore();
      break;
    }
    case 'promoter': {
      // Dual host / community silhouette
      context.save();
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 1.4;
      context.lineCap = 'round';

      // Primary figure
      context.beginPath();
      context.arc(center - 2.8, center - 3, 2.3, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.arc(center - 2.8, center + 7, 5, Math.PI * 1.25, Math.PI * 1.75, false);
      context.stroke();

      // Secondary figure
      context.beginPath();
      context.arc(center + 3.5, center - 1.5, 1.9, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.arc(center + 3.5, center + 7.5, 4.2, Math.PI * 1.28, Math.PI * 1.82, false);
      context.stroke();
      context.restore();
      break;
    }
    case 'resort': {
      // Tropical palm oasis silhouette
      context.save();
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 1.5;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      context.beginPath();
      context.moveTo(center - 1.5, center + 6.5);
      context.quadraticCurveTo(center - 2.5, center + 2, center - 0.5, center - 1.5);
      context.stroke();

      context.beginPath();
      context.moveTo(center - 0.5, center - 1.5);
      context.quadraticCurveTo(center - 4.5, center - 3, center - 7, center - 1);
      context.moveTo(center - 0.5, center - 1.5);
      context.quadraticCurveTo(center - 3.5, center - 6, center - 5, center - 6.5);
      context.moveTo(center - 0.5, center - 1.5);
      context.quadraticCurveTo(center + 2.5, center - 6.5, center + 5.5, center - 5.5);
      context.moveTo(center - 0.5, center - 1.5);
      context.quadraticCurveTo(center + 4.5, center - 2.5, center + 7, center - 0.5);
      context.stroke();

      context.beginPath();
      context.moveTo(center - 6, center + 6.5);
      context.lineTo(center + 5, center + 6.5);
      context.stroke();
      context.restore();
      break;
    }
    case 'cruise': {
      // Nautical ship profile with wave
      context.save();
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 1.5;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      context.beginPath();
      context.moveTo(center - 6.5, center + 2);
      context.lineTo(center + 4, center + 2);
      context.lineTo(center + 7.5, center - 1.5);
      context.lineTo(center + 5.5, center + 4.5);
      context.lineTo(center - 5, center + 4.5);
      context.closePath();
      context.fill();

      context.beginPath();
      context.moveTo(center - 3.5, center + 2);
      context.lineTo(center - 3.5, center - 2.5);
      context.lineTo(center + 0.5, center - 2.5);
      context.lineTo(center + 0.5, center + 2);
      context.stroke();

      context.beginPath();
      context.moveTo(center - 6.5, center + 6.5);
      context.quadraticCurveTo(center - 3, center + 5, center, center + 6.5);
      context.quadraticCurveTo(center + 3.5, center + 8, center + 7, center + 6.5);
      context.stroke();
      context.restore();
      break;
    }
    case 'all':
    default: {
      // Signature SwingSphere faceted discovery emblem
      context.save();
      context.strokeStyle = accent;
      context.fillStyle = accent;
      context.lineWidth = 1.6;
      context.lineJoin = 'round';

      context.beginPath();
      context.arc(center, center, 2.6, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      const starRadius = 6.8;
      for (let i = 0; i < 6; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 3;
        const x = center + Math.cos(angle) * starRadius;
        const y = center + Math.sin(angle) * starRadius;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.stroke();
      context.restore();
      break;
    }
  }
}

export const createExplorerClusterIconImage = ({
  category = 'all',
  selected = false,
}: {
  category?: ClusterCategory;
  selected?: boolean;
} = {}): ImageData => {
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const size = 58;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * pixelRatio);
  canvas.height = Math.round(size * pixelRatio);

  const context = canvas.getContext('2d');
  if (!context) return new ImageData(canvas.width, canvas.height);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = selected ? 15.5 : 14.5;
  const catColors = clusterCategoryColors[category] || clusterCategoryColors.all;
  const accent = selected ? explorerPinTokens.accentSelected : catColors.accent;

  // Ambient density glow
  context.save();
  context.globalCompositeOperation = 'lighter';
  const glow = context.createRadialGradient(center, center, 2, center, center, 27);
  glow.addColorStop(0, selected ? 'rgba(255, 77, 94, 0.48)' : catColors.glow);
  glow.addColorStop(0.52, selected ? 'rgba(197, 29, 52, 0.2)' : 'rgba(15, 17, 21, 0.12)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(center, center, 27, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // Hexagonal shield badge
  context.save();
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 3;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = selected ? 'rgba(54, 10, 18, 0.95)' : catColors.dark;
  context.strokeStyle = accent;
  context.lineWidth = selected ? 3.0 : 2.4;
  context.shadowColor = accent;
  context.shadowBlur = selected ? 13 : 9;
  context.fill();
  context.stroke();
  context.shadowBlur = 0;

  // Inner entity glyph
  drawCategoryGlyph(context, category, center, accent);
  context.restore();

  return context.getImageData(0, 0, canvas.width, canvas.height);
};

export const createExplorerPinImage = ({
  selected = false,
  cluster = false,
}: PinImageOptions = {}): ImageData => {
  if (cluster) {
    return createExplorerClusterIconImage({ category: 'all', selected });
  }

  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const width = 48;
  const height = 78;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const context = canvas.getContext('2d');
  if (!context) return new ImageData(canvas.width, canvas.height);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  const tokens = explorerPinTokens;

  const stemTop = 30;
  const stemBottom = 70;
  const stemWidth = selected ? 2.9 : cluster ? 2.4 : 2;
  const orbRadius = selected ? 9.4 : 8.2;
  const orbCenter = { x: width / 2, y: 21 };
  const glowRadius = selected ? 20 : 15;
  const accent = selected ? tokens.accentSelected : tokens.accent;
  const tip = selected ? tokens.accent : tokens.tip;

  context.save();
  context.globalCompositeOperation = 'lighter';
  const glow = context.createRadialGradient(
    orbCenter.x,
    orbCenter.y,
    0,
    orbCenter.x,
    orbCenter.y,
    glowRadius,
  );
  glow.addColorStop(0, selected ? 'rgba(255,77,94,0.58)' : 'rgba(197,29,52,0.36)');
  glow.addColorStop(0.38, selected ? 'rgba(197,29,52,0.28)' : 'rgba(197,29,52,0.14)');
  glow.addColorStop(1, 'rgba(197,29,52,0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(orbCenter.x, orbCenter.y, glowRadius, 0, Math.PI * 2);
  context.fill();

  const stemGradient = context.createLinearGradient(width / 2, stemTop, width / 2, stemBottom);
  stemGradient.addColorStop(0, selected ? 'rgba(255,77,94,0.9)' : 'rgba(197,29,52,0.72)');
  stemGradient.addColorStop(1, 'rgba(197,29,52,0.08)');
  context.strokeStyle = stemGradient;
  context.lineWidth = stemWidth;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(width / 2, stemTop);
  context.lineTo(width / 2, stemBottom);
  context.stroke();

  const orbGradient = context.createRadialGradient(
    orbCenter.x - orbRadius * 0.35,
    orbCenter.y - orbRadius * 0.45,
    orbRadius * 0.12,
    orbCenter.x,
    orbCenter.y,
    orbRadius,
  );
  orbGradient.addColorStop(0, '#ffffff');
  orbGradient.addColorStop(0.26, tip);
  orbGradient.addColorStop(0.68, selected ? accent : '#AEB7C3');
  orbGradient.addColorStop(1, '#4B1018');
  context.fillStyle = orbGradient;
  context.strokeStyle = selected ? 'rgba(255,255,255,0.54)' : 'rgba(255,255,255,0.32)';
  context.lineWidth = selected ? 1.35 : 1;
  context.beginPath();
  context.arc(orbCenter.x, orbCenter.y, orbRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = selected ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.58)';
  context.beginPath();
  context.arc(orbCenter.x - orbRadius * 0.35, orbCenter.y - orbRadius * 0.42, orbRadius * 0.24, 0, Math.PI * 2);
  context.fill();
  context.restore();

  return context.getImageData(0, 0, canvas.width, canvas.height);
};
