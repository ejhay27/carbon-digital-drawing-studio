export const BEACH_LOOP_SECONDS = 14;
export const BEACH_MAX_DPR = 1.25;

/** A normalized clock in [0, 1) that repeats exactly at the loop boundary. */
export function beachLoopPhase(timestampMs: number, loopSeconds = BEACH_LOOP_SECONDS) {
  if (!Number.isFinite(timestampMs) || !Number.isFinite(loopSeconds) || loopSeconds <= 0) return 0;
  const periodMs = loopSeconds * 1000;
  return ((timestampMs % periodMs) + periodMs) % periodMs / periodMs;
}

/** Smooth periodic run-up for one point along the shore; phase 0 and 1 are identical. */
export function beachSurge(phase: number, alongshore = 0) {
  const p = Number.isFinite(phase) ? phase : 0;
  const s = Number.isFinite(alongshore) ? alongshore : 0;
  return 0.5 - 0.5 * Math.cos((p + s * 0.075) * Math.PI * 2);
}

export interface CoverTransform {
  scale: number;
  x: number;
  y: number;
}

/** Matches CSS object-fit: cover and percentage object-position for canvas overlays. */
export function coverTransform(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
  positionX = 0.5,
  positionY = 0.35,
): CoverTransform {
  const values = [viewWidth, viewHeight, imageWidth, imageHeight, positionX, positionY];
  if (values.some((value) => !Number.isFinite(value)) || viewWidth <= 0 || viewHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
  return {
    scale,
    x: (viewWidth - imageWidth * scale) * positionX,
    y: (viewHeight - imageHeight * scale) * positionY,
  };
}
