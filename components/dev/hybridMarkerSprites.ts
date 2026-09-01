export type HybridMarkerShape = 'circle' | 'diamond' | 'square';

export const HYBRID_MARKER_IMAGE_IDS = {
  club: 'swingsphere-unified-club-diamond',
  event: 'swingsphere-unified-event-circle',
  promoter: 'swingsphere-unified-promoter-square',
} as const;

export const HYBRID_MARKER_COLORS = {
  club: '#E3263E',
  clubActive: '#FF5367',
  event: '#D6A62E',
  eventActive: '#F4C95D',
  promoter: '#20B8C7',
  promoterActive: '#67E8F9',
} as const;

export const makeHybridMarkerImage = (shape: HybridMarkerShape, color: string): ImageData => {
  const size = 48;
  const center = size / 2;
  const radius = 13.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create unified marker canvas context.');

  context.clearRect(0, 0, size, size);
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 9;
  context.fillStyle = color;
  context.strokeStyle = 'rgba(255,255,255,0.9)';
  context.lineWidth = 1.7;
  context.beginPath();

  if (shape === 'circle') {
    context.arc(center, center, radius, 0, Math.PI * 2);
  } else if (shape === 'diamond') {
    context.moveTo(center, center - radius - 1);
    context.lineTo(center + radius, center);
    context.lineTo(center, center + radius + 1);
    context.lineTo(center - radius, center);
    context.closePath();
  } else {
    context.rect(center - radius, center - radius, radius * 2, radius * 2);
  }

  context.fill();
  context.shadowBlur = 0;
  context.stroke();
  context.restore();

  return context.getImageData(0, 0, size, size);
};
