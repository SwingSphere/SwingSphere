export const EXPLORER_PIN_IMAGE_ID = 'swingsphere-explorer-pin';
export const EXPLORER_PIN_SELECTED_IMAGE_ID = 'swingsphere-explorer-pin-selected';
export const EXPLORER_CLUSTER_PIN_IMAGE_ID = 'swingsphere-explorer-cluster-pin';
export const EXPLORER_CLUSTER_SELECTED_IMAGE_ID = 'swingsphere-explorer-cluster-pin-selected';

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

export const createExplorerPinImage = ({
  selected = false,
  cluster = false,
}: PinImageOptions = {}): ImageData => {
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const width = 48;
  const height = 78;
  const canvas = document.createElement('canvas');
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const context = canvas.getContext('2d');
  if (!context) return new ImageData(canvas.width, canvas.height);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);

  const tokens = explorerPinTokens;
  const stemTop = cluster ? 25 : 30;
  const stemBottom = 70;
  const stemWidth = selected ? 2.9 : cluster ? 2.4 : 2;
  const orbRadius = selected ? 9.4 : cluster ? 10.2 : 8.2;
  const orbCenter = { x: width / 2, y: cluster ? 17 : 21 };
  const glowRadius = selected ? 20 : cluster ? 18 : 15;
  const accent = selected ? tokens.accentSelected : tokens.accent;
  const tip = cluster ? tokens.light : selected ? tokens.accent : tokens.tip;
  const clusterStemTop = selected ? 'rgba(255,255,255,0.96)' : 'rgba(245,245,245,0.88)';
  const clusterStemBottom = 'rgba(245,245,245,0.12)';

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
  glow.addColorStop(0, cluster
    ? selected ? 'rgba(255,255,255,0.62)' : 'rgba(245,245,245,0.48)'
    : selected ? 'rgba(255,77,94,0.58)' : 'rgba(197,29,52,0.36)');
  glow.addColorStop(0.38, cluster
    ? selected ? 'rgba(199,205,214,0.34)' : 'rgba(199,205,214,0.22)'
    : selected ? 'rgba(197,29,52,0.28)' : 'rgba(197,29,52,0.14)');
  glow.addColorStop(1, cluster ? 'rgba(245,245,245,0)' : 'rgba(197,29,52,0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(orbCenter.x, orbCenter.y, glowRadius, 0, Math.PI * 2);
  context.fill();

  const stemGradient = context.createLinearGradient(width / 2, stemTop, width / 2, stemBottom);
  stemGradient.addColorStop(0, cluster
    ? clusterStemTop
    : selected ? 'rgba(255,77,94,0.9)' : 'rgba(197,29,52,0.72)');
  stemGradient.addColorStop(1, cluster ? clusterStemBottom : 'rgba(197,29,52,0.08)');
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
  orbGradient.addColorStop(0.68, cluster ? '#DCE1E8' : selected ? accent : '#AEB7C3');
  orbGradient.addColorStop(1, cluster ? '#6F7884' : '#4B1018');
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
