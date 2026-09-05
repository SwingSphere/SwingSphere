export const resolveAdaptiveClusterDecision = ({
  minimumScreenDistance,
  wasClustered,
  enterDistancePx = 48,
  exitDistancePx = 64,
}) => {
  if (!Number.isFinite(minimumScreenDistance)) return true;
  const enterDistance = Math.max(0, Number(enterDistancePx) || 0);
  const exitDistance = Math.max(enterDistance, Number(exitDistancePx) || enterDistance);
  const threshold = wasClustered ? exitDistance : enterDistance;
  return minimumScreenDistance < threshold;
};

export const shouldIgnoreProgrammaticControlsChange = (programmaticControlsUpdateDepth) =>
  Number(programmaticControlsUpdateDepth) > 0;
