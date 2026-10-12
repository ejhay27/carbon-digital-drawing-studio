import { SAMPLE_STRIDE } from './strokeRenderer';

/** Append one finite pointer sample without allowing timestamps to move backwards. */
export function appendRecordedSample(samples: number[], sample: readonly number[], preserveLastPressure = false) {
  if (samples.length % SAMPLE_STRIDE !== 0) throw new Error('Recorded stroke samples are incomplete.');
  if (sample.length !== SAMPLE_STRIDE || sample.some((n) => !Number.isFinite(n))) throw new Error('Recorded pointer sample is invalid.');

  const next = [...sample];
  const last = samples.length - SAMPLE_STRIDE;
  if (last >= 0) {
    next[5] = Math.max(samples[last + 5], next[5]);
    if (preserveLastPressure) next[2] = samples[last + 2];
    if (next.every((value, i) => value === samples[last + i])) return false;
  }
  samples.push(...next);
  return true;
}
