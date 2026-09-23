export const EXPLORER_PIN_IMAGE_ID = 'swingsphere-explorer-pin';
export const EXPLORER_PIN_SELECTED_IMAGE_ID = 'swingsphere-explorer-pin-selected';
export const EXPLORER_CLUSTER_PIN_IMAGE_ID = 'swingsphere-explorer-cluster-pin';
export const EXPLORER_CLUSTER_SELECTED_IMAGE_ID = 'swingsphere-explorer-cluster-pin-selected';
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
    const angle = -Math.PI / 2 + index * Math.PI / 3;
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

export const createExplorerPinImage = ({
  selected = false,
  cluster = false,
}: PinImageOptions = {}): ImageData => {
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const width = cluster ? 58 : 48;
  const height = cluster ? 58 : 78;
  const canvas = document.createElement('canvas');
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const context = canvas.getContext('2d');
  if (!context) return new ImageData(canvas.width, canvas.height);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  const tokens = explorerPinTokens;

  if (cluster) {
    const center = width / 2;
    const radius = selected ? 12.5 : 11.5;
    const accent = selected ? tokens.accentSelected : tokens.light;

    context.save();
    context.globalCompositeOperation = 'lighter';
    const glow = context.createRadialGradient(center, center, 2, center, center, 25);
    glow.addColorStop(0, selected ? 'rgba(255,77,94,0.46)' : 'rgba(255,255,255,0.34)');
    glow.addColorStop(0.48, selected ? 'rgba(197,29,52,0.18)' : 'rgba(199,205,214,0.14)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(center, center, 25, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.translate(center, center);
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 3;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = selected ? 'rgba(54,10,18,0.94)' : 'rgba(15,17,21,0.92)';
    context.strokeStyle = accent;
    context.lineWidth = selected ? 3.1 : 2.7;
    context.shadowColor = accent;
    context.shadowBlur = selected ? 12 : 9;
    context.fill();
    context.stroke();
    context.shadowBlur = 0;

    context.beginPath();
    context.arc(0, 0, selected ? 3.3 : 3, 0, Math.PI * 2);
    context.fillStyle = accent;
    context.fill();
    context.restore();

    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

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
